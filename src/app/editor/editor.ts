import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PropertyService } from '../services/property';

import { Door } from '../models/door';
import { Window } from '../models/window';
import { Wall } from '../models/wall';

import { getWallPolygon } from '../utils/wall-geometry';
import { getClosestWall, snapAngle, snapPoint, getWallSide } from '../utils/editor-geometry';

type EditorTool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'sensor';

type Point = {
  x: number;
  y: number;
};

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  // --------------------------------------------------
  // Selection
  // --------------------------------------------------

  selectedWallId: string | null = null;
  selectedRoomId: string | null = null;
  selectedDoorId: string | null = null;
  selectedWindowId: string | null = null;

  // --------------------------------------------------
  // Dragging
  // --------------------------------------------------

  draggingWallId: string | null = null;
  draggingEndpoint: 'start' | 'end' | null = null;

  draggingDoorId: string | null = null;
  draggingWindowId: string | null = null;
  placingSide: 1 | -1 = 1;

  // --------------------------------------------------
  // Editor state
  // --------------------------------------------------

  activeTool: EditorTool = 'select';

  angleSnap = 45;
  snapDistance = 20;

  shiftPressed = false;

  drawingStart: Point | null = null;
  mousePosition: Point | null = null;
  snapTarget: Point | null = null;

  constructor(public propertyService: PropertyService) {}

  ngOnInit() {
    this.propertyService.recalculateRooms();
  }

  // ==================================================
  // TOOL
  // ==================================================

  setTool(tool: EditorTool) {
    this.activeTool = tool;

    this.drawingStart = null;

    this.draggingWallId = null;
    this.draggingEndpoint = null;

    this.draggingDoorId = null;
    this.draggingWindowId = null;

    this.snapTarget = null;

    this.placementPreview = null;
  }

  getCursorClass(): string {
    switch (this.activeTool) {
      case 'wall':
        return 'cursor-wall';

      case 'door':
        return 'cursor-door';

      case 'window':
        return 'cursor-window';

      case 'room':
        return 'cursor-room';

      case 'sensor':
        return 'cursor-sensor';

      case 'select':
      default:
        return 'cursor-select';
    }
  }

  getSelectedType(): 'wall' | 'door' | 'window' | 'room' | null {
    if (this.selectedWallId) {
      return 'wall';
    }

    if (this.selectedDoorId) {
      return 'door';
    }

    if (this.selectedWindowId) {
      return 'window';
    }

    if (this.selectedRoomId) {
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

    if (this.activeTool !== 'select') {
      return;
    }

    this.selectedWallId = wallId;
    this.selectedDoorId = null;
    this.selectedWindowId = null;
    this.selectedRoomId = null;
  }

  selectDoor(doorId: string, event: MouseEvent) {
    event.stopPropagation();

    if (this.activeTool !== 'select') {
      return;
    }

    this.selectedDoorId = doorId;
    this.selectedWallId = null;
    this.selectedWindowId = null;
    this.selectedRoomId = null;
  }

  selectWindow(windowId: string, event: MouseEvent) {
    event.stopPropagation();

    if (this.activeTool !== 'select') {
      return;
    }

    this.selectedWindowId = windowId;
    this.selectedDoorId = null;
    this.selectedWallId = null;
    this.selectedRoomId = null;
  }

  selectRoom(roomId: string, event: MouseEvent) {
    event.stopPropagation();

    if (this.activeTool !== 'select') {
      return;
    }

    this.selectedRoomId = roomId;
    this.selectedWallId = null;
    this.selectedDoorId = null;
    this.selectedWindowId = null;
  }

  clearSelection() {
    this.selectedWallId = null;
    this.selectedRoomId = null;
    this.selectedDoorId = null;
    this.selectedWindowId = null;
  }

  // ==================================================
  // DELETE
  // ==================================================

  deleteSelected() {
    if (this.selectedDoorId) {
      this.deleteSelectedDoor();
      return;
    }

    if (this.selectedWindowId) {
      this.deleteSelectedWindow();
      return;
    }

    if (this.selectedWallId) {
      this.deleteSelectedWall();
    }
  }

  deleteSelectedDoor() {
    if (!this.selectedDoorId) {
      return;
    }

    this.propertyService.removeDoor(this.selectedDoorId);
    this.selectedDoorId = null;
  }

  deleteSelectedWindow() {
    if (!this.selectedWindowId) {
      return;
    }

    this.propertyService.removeWindow(this.selectedWindowId);
    this.selectedWindowId = null;
  }

  deleteSelectedWall() {
    if (!this.selectedWallId) {
      return;
    }

    this.propertyService.removeWall(this.selectedWallId);
    this.selectedWallId = null;
  }

  // ==================================================
  // ROOM
  // ==================================================

  getSelectedRoom() {
    return this.propertyService.property.rooms.find((room) => room.id === this.selectedRoomId);
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

    if (this.activeTool !== 'select') {
      return;
    }

    this.selectedDoorId = doorId;
    this.selectedWallId = null;
    this.selectedRoomId = null;
    this.selectedWindowId = null;

    this.draggingDoorId = doorId;
  }

  dragDoor(point: Point) {
    const door = this.propertyService.property.doors.find(
      (door) => door.id === this.draggingDoorId,
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
      this.snapTarget = null;
      return;
    }

    door.wallId = result.wall.id;
    door.position = result.position;

    this.snapTarget = {
      x: result.wall.start.x + (result.wall.end.x - result.wall.start.x) * result.position,

      y: result.wall.start.y + (result.wall.end.y - result.wall.start.y) * result.position,
    };
  }

  // ==================================================
  // WINDOW DRAGGING
  // ==================================================

  startDraggingWindow(event: MouseEvent, windowId: string) {
    event.stopPropagation();

    if (this.activeTool !== 'select') {
      return;
    }

    this.selectedWindowId = windowId;
    this.selectedDoorId = null;
    this.selectedWallId = null;
    this.selectedRoomId = null;

    this.draggingWindowId = windowId;
  }

  dragWindow(point: Point) {
    const window = this.propertyService.property.windows.find(
      (window) => window.id === this.draggingWindowId,
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
      this.snapTarget = null;
      return;
    }

    window.wallId = result.wall.id;
    window.position = result.position;

    this.snapTarget = {
      x: result.wall.start.x + (result.wall.end.x - result.wall.start.x) * result.position,

      y: result.wall.start.y + (result.wall.end.y - result.wall.start.y) * result.position,
    };
  }

  // ==================================================
  // WALL DRAGGING
  // ==================================================

  startDragging(event: MouseEvent, wallId: string, endpoint: 'start' | 'end') {
    event.stopPropagation();

    this.draggingWallId = wallId;
    this.draggingEndpoint = endpoint;
  }

  dragWallEndpoint(point: Point) {
    if (!this.draggingWallId || !this.draggingEndpoint) {
      return;
    }

    const wall = this.propertyService.property.walls.find(
      (wall) => wall.id === this.draggingWallId,
    );

    if (!wall) {
      return;
    }

    let dragPoint = point;

    if (this.shiftPressed) {
      const fixedPoint = this.draggingEndpoint === 'start' ? wall.end : wall.start;

      dragPoint = snapAngle(fixedPoint, point, this.angleSnap);
    }

    const snappedPoint = snapPoint(
      this.propertyService.property.walls,
      dragPoint,
      this.snapDistance,
      this.draggingWallId,
    );

    if (snappedPoint.x !== point.x || snappedPoint.y !== point.y) {
      this.snapTarget = snappedPoint;
    } else {
      this.snapTarget = null;
    }

    wall[this.draggingEndpoint] = {
      x: snappedPoint.x,
      y: snappedPoint.y,
    };
  }

  // ==================================================
  // MOUSE
  // ==================================================

  onMouseMove(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    // --------------------------------
    // Door / Window placement preview
    // --------------------------------

    if (this.activeTool === 'door' || this.activeTool === 'window') {
      this.mousePosition = point;
      this.updatePlacementPreview(point);
      return;
    }

    // --------------------------------
    // Dragging a door
    // --------------------------------

    if (this.draggingDoorId) {
      this.dragDoor(point);
      return;
    }

    // --------------------------------
    // Dragging a window
    // --------------------------------

    if (this.draggingWindowId) {
      this.dragWindow(point);
      return;
    }

    // --------------------------------
    // Drawing a new wall
    // --------------------------------

    if (this.activeTool === 'wall' && this.drawingStart) {
      const drawingPoint = this.getDrawingPoint(point);

      this.mousePosition = drawingPoint;

      if (drawingPoint.x !== point.x || drawingPoint.y !== point.y) {
        this.snapTarget = drawingPoint;
      } else {
        this.snapTarget = null;
      }

      return;
    }

    // --------------------------------
    // Normal mouse movement
    // --------------------------------

    this.mousePosition = point;

    // --------------------------------
    // Existing wall endpoint dragging
    // --------------------------------

    if (!this.draggingWallId || !this.draggingEndpoint) {
      this.snapTarget = null;
      return;
    }

    this.dragWallEndpoint(point);
  }

  getSvgPoint(event: MouseEvent): Point {
    const svg = event.currentTarget as SVGSVGElement;

    const point = svg.createSVGPoint();

    point.x = event.clientX;
    point.y = event.clientY;

    const matrix = svg.getScreenCTM();

    if (!matrix) {
      return { x: 0, y: 0 };
    }

    const svgPoint = point.matrixTransform(matrix.inverse());

    return {
      x: svgPoint.x,
      y: svgPoint.y,
    };
  }

  // --------------------------------------------------
  // Placement preview
  // --------------------------------------------------

  placementPreview: {
    wallId: string;
    position: number;
    side: 1 | -1;
  } | null = null;

  updatePlacementPreview(point: Point) {
    if (this.activeTool !== 'door' && this.activeTool !== 'window') {
      this.placementPreview = null;
      return;
    }

    const result = getClosestWall(this.propertyService.property.walls, point);

    if (!result.wall) {
      this.placementPreview = null;
      return;
    }

    const attachDistance = 40;

    if (result.distance > attachDistance) {
      this.placementPreview = null;
      return;
    }

    if (result.position < 0.1 || result.position > 0.9) {
      this.placementPreview = null;
      return;
    }

    this.placementPreview = {
      wallId: result.wall.id,
      position: result.position,
      side: getWallSide(result.wall, point),
    };
  }

  getPlacementTransform(): string {
    if (!this.placementPreview) {
      return '';
    }

    const wall = this.propertyService.property.walls.find(
      (wall) => wall.id === this.placementPreview!.wallId,
    );

    if (!wall) {
      return '';
    }

    const x = wall.start.x + (wall.end.x - wall.start.x) * this.placementPreview.position;

    const y = wall.start.y + (wall.end.y - wall.start.y) * this.placementPreview.position;

    const angle =
      (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI;

    const flip = this.placementPreview.side === -1 ? 'scale(1 -1)' : '';

    return `
    translate(${x} ${y})
    rotate(${angle})
    ${flip}
  `;
  }

  // ==================================================
  // MOUSE CLICK
  // ==================================================

  onSvgClick(event: MouseEvent) {
    switch (this.activeTool) {
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

    if (!this.drawingStart) {
      this.drawingStart = snapPoint(this.propertyService.property.walls, point, this.snapDistance);

      return;
    }

    const finalPoint = this.getDrawingPoint(point);

    const newWall: Wall = {
      id: crypto.randomUUID(),
      start: this.drawingStart,
      end: finalPoint,
      thickness: 12,
      height: 96,
    };

    this.propertyService.addWall(newWall);

    this.drawingStart = null;
    this.snapTarget = null;
  }

  getDrawingPoint(point: Point): Point {
    if (!this.drawingStart) {
      return point;
    }

    let finalPoint = point;

    if (this.shiftPressed) {
      finalPoint = snapAngle(this.drawingStart, finalPoint, this.angleSnap);
    }

    return snapPoint(this.propertyService.property.walls, finalPoint, this.snapDistance);
  }

  // ==================================================
  // DOOR CREATION
  // ==================================================

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

  getDoorTransform(door: Door): string {
    const wall = this.propertyService.property.walls.find((wall) => wall.id === door.wallId);

    if (!wall) {
      return '';
    }

    const x = wall.start.x + (wall.end.x - wall.start.x) * door.position;

    const y = wall.start.y + (wall.end.y - wall.start.y) * door.position;

    const angle =
      (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI;

    const flip = door.side === -1 ? 'scale(1 -1)' : '';

    return `
    translate(${x} ${y})
    rotate(${angle})
    ${flip}
  `;
  }

  // ==================================================
  // WINDOW CREATION
  // ==================================================

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

  getWindowTransform(window: Window): string {
    const wall = this.propertyService.property.walls.find((wall) => wall.id === window.wallId);

    if (!wall) {
      return '';
    }

    const x = wall.start.x + (wall.end.x - wall.start.x) * window.position;

    const y = wall.start.y + (wall.end.y - wall.start.y) * window.position;

    const angle =
      (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI;

    const flip = window.side === -1 ? 'scale(1 -1)' : '';

    return `
    translate(${x} ${y})
    rotate(${angle})
    ${flip}
  `;
  }

  // ==================================================
  // OTHER TOOLS
  // ==================================================

  handleRoomClick(event: MouseEvent) {
    console.log('Room tool clicked');
  }

  handleSensorClick(event: MouseEvent) {
    console.log('Sensor tool clicked');
  }

  // ==================================================
  // DRAG END
  // ==================================================

  stopDragging() {
    if (this.draggingWallId) {
      this.propertyService.wallChanged();
    }

    this.draggingWallId = null;
    this.draggingEndpoint = null;

    this.draggingDoorId = null;
    this.draggingWindowId = null;

    this.snapTarget = null;

    if (this.activeTool === 'door' || this.activeTool === 'window') {
      this.placementPreview = null;
    }
  }

  // ==================================================
  // KEYBOARD
  // ==================================================

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.shiftPressed = true;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && this.activeTool === 'select') {
      this.deleteSelected();
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyboardUp(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.shiftPressed = false;
    }
  }
}
