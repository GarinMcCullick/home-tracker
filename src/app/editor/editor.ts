import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PropertyService } from '../services/property';
import { EditorStateService, EditorTool, Point } from '../services/editor-state';

import { Door } from '../models/door';
import { Window } from '../models/window';
import { Wall } from '../models/wall';
import { Room } from '../models/room';
import { isPointInsidePolygon } from '../utils/room-geometry';

import { getWallPolygon } from '../utils/wall-geometry';
import {
  getClosestWall,
  snapAngle,
  snapPoint,
  getWallSide,
  getDrawingPoint,
} from '../utils/editor-geometry';
import {
  getDoorTransform,
  getWindowTransform,
  getPlacementTransform as buildPlacementTransform,
} from '../utils/element-transforms';
import { PlacementPreview, getPlacementPreview } from '../utils/placement-utils';
import { calculateZoom, getSvgPoint } from '../utils/viewport';
import { getCursorClass } from '../utils/editor-utils';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  // --------------------------------------------------
  // Dragging
  // --------------------------------------------------

  placingSide: 1 | -1 = 1;

  // --------------------------------------------------
  // Viewport stuff
  // --------------------------------------------------
  onWheel(event: WheelEvent) {
    event.preventDefault();

    const result = calculateZoom(
      event,
      event.currentTarget as SVGSVGElement,
      this.editorStateService.zoom,
      this.editorStateService.panX,
      this.editorStateService.panY,
    );

    this.editorStateService.zoom = result.zoom;
    this.editorStateService.panX = result.panX;
    this.editorStateService.panY = result.panY;
  }
  onCanvasMouseDown(event: MouseEvent) {
    // Middle mouse = always pan
    if (event.button === 1) {
      this.startPanning(event);
      return;
    }

    // Space + left mouse = pan
    if (event.button === 0 && this.editorStateService.spacePressed) {
      this.startPanning(event);
      return;
    }

    // Select tool + left mouse on empty canvas = pan
    if (
      event.button === 0 &&
      this.editorStateService.activeTool === 'select' &&
      event.target === event.currentTarget
    ) {
      this.startPanning(event);
    }
  }
  onCanvasMouseUp(event: MouseEvent) {
    if (this.editorStateService.isPanning) {
      this.editorStateService.isPanning = false;
      return;
    }

    this.stopDragging();
  }

  private startPanning(event: MouseEvent) {
    event.preventDefault();

    this.editorStateService.isPanning = true;

    this.editorStateService.panStart = {
      x: event.clientX,
      y: event.clientY,
    };

    this.editorStateService.panOrigin = {
      x: this.editorStateService.panX,
      y: this.editorStateService.panY,
    };
  }

  // --------------------------------------------------
  // Editor state
  // --------------------------------------------------

  constructor(
    public propertyService: PropertyService,
    public editorStateService: EditorStateService,
  ) {}

  ngOnInit() {
    this.propertyService.recalculateRooms();
  }

  // ==================================================
  // TOOL
  // ==================================================

  setTool(tool: EditorTool) {
    this.editorStateService.activeTool = tool;

    this.editorStateService.drawingStart = null;

    this.editorStateService.draggingWallId = null;
    this.editorStateService.draggingEndpoint = null;

    this.editorStateService.draggingDoorId = null;
    this.editorStateService.draggingWindowId = null;

    this.editorStateService.snapTarget = null;

    this.placementPreview = null;
  }

  getCursorClass(): string {
    return getCursorClass(this.editorStateService.activeTool);
  }

  getSelectedType(): 'wall' | 'door' | 'window' | 'room' | null {
    if (this.editorStateService.selectedWallId) {
      return 'wall';
    }

    if (this.editorStateService.selectedDoorId) {
      return 'door';
    }

    if (this.editorStateService.selectedWindowId) {
      return 'window';
    }

    if (this.editorStateService.selectedRoomId) {
      return 'room';
    }

    return null;
  }

  // ==================================================
  // WALL DISPLAY
  // ==================================================

  getWallPoints(wall: Wall): string {
    return getWallPolygon(wall)
      .map((point) => `${point.x},${point.y}`)
      .join(' ');
  }

  // ==================================================
  // SELECTION
  // ==================================================

  selectWall(wallId: string, event?: MouseEvent) {
    event?.stopPropagation();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    this.editorStateService.selectedWallId = wallId;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
    this.editorStateService.selectedRoomId = null;
  }

  selectDoor(doorId: string, event: MouseEvent) {
    event.stopPropagation();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    this.editorStateService.selectedDoorId = doorId;
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedWindowId = null;
    this.editorStateService.selectedRoomId = null;
  }

  selectWindow(windowId: string, event: MouseEvent) {
    event.stopPropagation();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    this.editorStateService.selectedWindowId = windowId;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedRoomId = null;
  }

  selectRoom(roomId: string, event?: MouseEvent) {
    event?.stopPropagation();

    if (
      this.editorStateService.activeTool !== 'select' &&
      this.editorStateService.activeTool !== 'room'
    ) {
      return;
    }

    this.editorStateService.selectedRoomId = roomId;
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
  }

  clearSelection() {
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedRoomId = null;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWindowId = null;
  }

  // ==================================================
  // DELETE
  // ==================================================

  deleteSelected() {
    if (this.editorStateService.selectedDoorId) {
      this.deleteSelectedDoor();
      return;
    }

    if (this.editorStateService.selectedWindowId) {
      this.deleteSelectedWindow();
      return;
    }

    if (this.editorStateService.selectedWallId) {
      this.deleteSelectedWall();
    }
  }

  deleteSelectedDoor() {
    if (!this.editorStateService.selectedDoorId) {
      return;
    }

    this.propertyService.removeDoor(this.editorStateService.selectedDoorId);
    this.editorStateService.selectedDoorId = null;
  }

  deleteSelectedWindow() {
    if (!this.editorStateService.selectedWindowId) {
      return;
    }

    this.propertyService.removeWindow(this.editorStateService.selectedWindowId);
    this.editorStateService.selectedWindowId = null;
  }

  deleteSelectedWall() {
    if (!this.editorStateService.selectedWallId) {
      return;
    }

    this.propertyService.removeWall(this.editorStateService.selectedWallId);
    this.editorStateService.selectedWallId = null;
  }

  // ==================================================
  // ROOM
  // ==================================================

  isPointInsideRoom(point: Point, room: Room): boolean {
    return isPointInsidePolygon(point, room.polygon);
  }

  getSelectedRoom() {
    return this.propertyService.property.rooms.find(
      (room) => room.id === this.editorStateService.selectedRoomId,
    );
  }

  renameSelectedRoom(event: Event) {
    const input = event.target as HTMLInputElement;
    const room = this.getSelectedRoom();

    if (!room) {
      return;
    }

    room.name = input.value;
  }

  // ==================================================
  // DOOR DRAGGING
  // ==================================================

  startDraggingDoor(event: MouseEvent, doorId: string) {
    event.stopPropagation();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    this.editorStateService.selectedDoorId = doorId;
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedRoomId = null;
    this.editorStateService.selectedWindowId = null;

    this.editorStateService.draggingDoorId = doorId;
  }

  dragDoor(point: Point) {
    const door = this.propertyService.property.doors.find(
      (door) => door.id === this.editorStateService.draggingDoorId,
    );

    if (!door) {
      return;
    }

    const result = getClosestWall(this.propertyService.property.walls, point);

    if (!result.wall) {
      return;
    }

    const attachDistance = 40;

    if (result.distance > attachDistance) {
      this.editorStateService.snapTarget = null;
      return;
    }

    door.wallId = result.wall.id;
    door.position = result.position;

    this.editorStateService.snapTarget = {
      x: result.wall.start.x + (result.wall.end.x - result.wall.start.x) * result.position,

      y: result.wall.start.y + (result.wall.end.y - result.wall.start.y) * result.position,
    };
  }

  // ==================================================
  // WINDOW DRAGGING
  // ==================================================

  startDraggingWindow(event: MouseEvent, windowId: string) {
    event.stopPropagation();

    if (this.editorStateService.activeTool !== 'select') {
      return;
    }

    this.editorStateService.selectedWindowId = windowId;
    this.editorStateService.selectedDoorId = null;
    this.editorStateService.selectedWallId = null;
    this.editorStateService.selectedRoomId = null;

    this.editorStateService.draggingWindowId = windowId;
  }

  dragWindow(point: Point) {
    const window = this.propertyService.property.windows.find(
      (window) => window.id === this.editorStateService.draggingWindowId,
    );

    if (!window) {
      return;
    }

    const result = getClosestWall(this.propertyService.property.walls, point);

    if (!result.wall) {
      return;
    }

    const attachDistance = 40;

    if (result.distance > attachDistance) {
      this.editorStateService.snapTarget = null;
      return;
    }

    window.wallId = result.wall.id;
    window.position = result.position;

    this.editorStateService.snapTarget = {
      x: result.wall.start.x + (result.wall.end.x - result.wall.start.x) * result.position,

      y: result.wall.start.y + (result.wall.end.y - result.wall.start.y) * result.position,
    };
  }

  // ==================================================
  // WALL DRAGGING
  // ==================================================

  startDragging(event: MouseEvent, wallId: string, endpoint: 'start' | 'end') {
    event.stopPropagation();

    this.editorStateService.draggingWallId = wallId;
    this.editorStateService.draggingEndpoint = endpoint;
  }

  dragWallEndpoint(point: Point) {
    if (!this.editorStateService.draggingWallId || !this.editorStateService.draggingEndpoint) {
      return;
    }

    const wall = this.propertyService.property.walls.find(
      (wall) => wall.id === this.editorStateService.draggingWallId,
    );

    if (!wall) {
      return;
    }

    let dragPoint = point;

    if (this.editorStateService.shiftPressed) {
      const fixedPoint =
        this.editorStateService.draggingEndpoint === 'start' ? wall.end : wall.start;

      dragPoint = snapAngle(fixedPoint, point, this.editorStateService.angleSnap);
    }

    const snappedPoint = snapPoint(
      this.propertyService.property.walls,
      dragPoint,
      this.editorStateService.snapDistance,
      this.editorStateService.draggingWallId,
    );

    if (snappedPoint.x !== point.x || snappedPoint.y !== point.y) {
      this.editorStateService.snapTarget = snappedPoint;
    } else {
      this.editorStateService.snapTarget = null;
    }

    wall[this.editorStateService.draggingEndpoint] = {
      x: snappedPoint.x,
      y: snappedPoint.y,
    };
  }

  // ==================================================
  // MOUSE
  // ==================================================

  onMouseMove(event: MouseEvent) {
    const point = this.getSvgPoint(event);
    const drawingPoint = getDrawingPoint(
      this.editorStateService.drawingStart ?? point,
      point,
      this.propertyService.property.walls,
      this.editorStateService.shiftPressed,
      this.editorStateService.angleSnap,
      this.editorStateService.snapDistance,
    );

    // --------------------------------
    // viewport panning
    // --------------------------------

    if (this.editorStateService.isPanning) {
      const dx = event.clientX - this.editorStateService.panStart.x;
      const dy = event.clientY - this.editorStateService.panStart.y;

      this.editorStateService.panX = this.editorStateService.panOrigin.x + dx;
      this.editorStateService.panY = this.editorStateService.panOrigin.y + dy;

      return;
    }

    // --------------------------------
    // Door / Window placement preview
    // --------------------------------

    if (
      this.editorStateService.activeTool === 'door' ||
      this.editorStateService.activeTool === 'window'
    ) {
      this.editorStateService.mousePosition = point;
      this.updatePlacementPreview(point);
      return;
    }

    // --------------------------------
    // Dragging a door
    // --------------------------------

    if (this.editorStateService.draggingDoorId) {
      this.dragDoor(point);
      return;
    }

    // --------------------------------
    // Dragging a window
    // --------------------------------

    if (this.editorStateService.draggingWindowId) {
      this.dragWindow(point);
      return;
    }

    // --------------------------------
    // Drawing a new wall
    // --------------------------------

    if (this.editorStateService.activeTool === 'wall' && this.editorStateService.drawingStart) {
      this.editorStateService.mousePosition = drawingPoint;

      if (drawingPoint.x !== point.x || drawingPoint.y !== point.y) {
        this.editorStateService.snapTarget = drawingPoint;
      } else {
        this.editorStateService.snapTarget = null;
      }

      return;
    }

    // --------------------------------
    // Normal mouse movement
    // --------------------------------

    this.editorStateService.mousePosition = point;

    // --------------------------------
    // Existing wall endpoint dragging
    // --------------------------------

    if (!this.editorStateService.draggingWallId || !this.editorStateService.draggingEndpoint) {
      this.editorStateService.snapTarget = null;
      return;
    }

    this.dragWallEndpoint(point);
  }

  getSvgPoint(event: MouseEvent): Point {
    return getSvgPoint(
      event,
      event.currentTarget as SVGSVGElement,
      this.editorStateService.panX,
      this.editorStateService.panY,
      this.editorStateService.zoom,
    );
  }

  // --------------------------------------------------
  // Placement preview
  // --------------------------------------------------

  placementPreview: PlacementPreview | null = null;

  getPlacementTransform(): string {
    if (!this.placementPreview) {
      return '';
    }

    return buildPlacementTransform(this.placementPreview, this.propertyService.property.walls);
  }

  updatePlacementPreview(point: Point) {
    if (
      this.editorStateService.activeTool !== 'door' &&
      this.editorStateService.activeTool !== 'window'
    ) {
      this.placementPreview = null;
      return;
    }

    this.placementPreview = getPlacementPreview(this.propertyService.property.walls, point);
  }

  // ==================================================
  // MOUSE CLICK
  // ==================================================

  onSvgClick(event: MouseEvent) {
    switch (this.editorStateService.activeTool) {
      case 'wall':
        this.handleWallClick(event);
        break;

      case 'room':
        this.handleRoomClick(event);
        break;

      case 'door':
        this.handleDoorClick(event);
        break;

      case 'window':
        this.handleWindowClick(event);
        break;

      case 'sensor':
        this.handleSensorClick(event);
        break;

      case 'select':
        this.clearSelection();
        break;
    }
  }

  // ==================================================
  // WALL CREATION
  // ==================================================

  handleWallClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    if (!this.editorStateService.drawingStart) {
      this.editorStateService.drawingStart = snapPoint(
        this.propertyService.property.walls,
        point,
        this.editorStateService.snapDistance,
      );

      return;
    }

    const finalPoint = getDrawingPoint(
      this.editorStateService.drawingStart,
      point,
      this.propertyService.property.walls,
      this.editorStateService.shiftPressed,
      this.editorStateService.angleSnap,
      this.editorStateService.snapDistance,
    );

    const newWall: Wall = {
      id: crypto.randomUUID(),
      start: this.editorStateService.drawingStart,
      end: finalPoint,
      thickness: 12,
      height: 96,
    };

    this.propertyService.addWall(newWall);

    this.editorStateService.drawingStart = null;
    this.editorStateService.snapTarget = null;
  }

  // ==================================================
  // DOOR CREATION
  // ==================================================

  getDoorTransform(door: Door): string {
    return getDoorTransform(door, this.propertyService.property.walls);
  }

  handleDoorClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    const result = getClosestWall(this.propertyService.property.walls, point);

    if (!result.wall) {
      return;
    }

    if (result.position < 0.1 || result.position > 0.9) {
      return;
    }

    const side = getWallSide(result.wall, point);

    const door: Door = {
      id: crypto.randomUUID(),
      wallId: result.wall.id,
      position: result.position,
      width: 80,
      swing: 'right',
      open: false,
      side,
    };

    this.propertyService.addDoor(door);
  }

  // ==================================================
  // WINDOW CREATION
  // ==================================================

  getWindowTransform(window: Window): string {
    return getWindowTransform(window, this.propertyService.property.walls);
  }

  handleWindowClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    const result = getClosestWall(this.propertyService.property.walls, point);

    if (!result.wall) {
      return;
    }

    if (result.position < 0.1 || result.position > 0.9) {
      return;
    }

    const side = getWallSide(result.wall, point);

    const window: Window = {
      id: crypto.randomUUID(),
      wallId: result.wall.id,
      position: result.position,
      width: 100,
      height: 48,
      side,
    };

    this.propertyService.addWindow(window);
  }

  // ==================================================
  // OTHER TOOLS
  // ==================================================

  handleRoomClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    const room = this.propertyService.property.rooms.find((room) =>
      this.isPointInsideRoom(point, room),
    );

    if (!room) {
      return;
    }

    this.selectRoom(room.id);
  }

  handleSensorClick(event: MouseEvent) {
    console.log('Sensor tool clicked');
  }

  // ==================================================
  // DRAG END
  // ==================================================

  stopDragging() {
    if (this.editorStateService.draggingWallId) {
      this.propertyService.wallChanged();
    }

    this.editorStateService.draggingWallId = null;
    this.editorStateService.draggingEndpoint = null;

    this.editorStateService.draggingDoorId = null;
    this.editorStateService.draggingWindowId = null;

    this.editorStateService.snapTarget = null;

    if (
      this.editorStateService.activeTool === 'door' ||
      this.editorStateService.activeTool === 'window'
    ) {
      this.placementPreview = null;
    }
  }

  // ==================================================
  // KEYBOARD
  // ==================================================

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.editorStateService.shiftPressed = true;
    }
    if (event.code === 'Space') {
      this.editorStateService.spacePressed = true;
    }

    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      this.editorStateService.activeTool === 'select'
    ) {
      this.deleteSelected();
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyboardUp(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.editorStateService.shiftPressed = false;
    }
    if (event.code === 'Space') {
      this.editorStateService.spacePressed = false;
    }
  }
}
