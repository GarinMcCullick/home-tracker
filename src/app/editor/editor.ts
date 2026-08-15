import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PropertyService } from '../services/property';
import { EditorStateService, EditorTool, Point } from '../services/editor-state';

import { Door } from '../models/door';
import { Window } from '../models/window';
import { Wall } from '../models/wall';
import { Room } from '../models/room';
import { isPointInsidePolygon } from '../utils/room-geometry';
import { connectWallEndpoint } from '../utils/wall-topology';
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
  imports: [CommonModule, FormsModule],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  // --------------------------------------------------
  // Dragging
  // --------------------------------------------------
  draggingOriginalPoint: Point | null = null;
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
  // WALL DIMENSIONS
  // ==================================================
  wallLengthInput = '';
  wallDimensionFocused = false;
  wallDimensionPosition: Point | null = null;
  onWallDimensionFocus() {
    this.wallDimensionFocused = true;
  }

  onWallDimensionBlur() {
    // Delay this slightly so clicking Apply Left/Right
    // doesn't immediately hide the buttons.
    setTimeout(() => {
      this.wallDimensionFocused = false;
    }, 100);
  }
  getSelectedWall(): Wall | undefined {
    const wallId = this.editorStateService.selectedWallId;

    if (!wallId) {
      return undefined;
    }

    return this.propertyService.property.walls.find((wall) => wall.id === wallId);
  }

  getWallLength(wall: Wall): number {
    return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  }

  formatWallLength(length: number): string {
    // Our editor units are inches.
    const totalInches = length;

    const feet = Math.floor(totalInches / 12);
    const inches = totalInches - feet * 12;

    if (Math.abs(inches) < 0.01) {
      return `${feet}'`;
    }

    return `${feet}' ${inches.toFixed(1)}"`;
  }

  parseWallLength(value: string): number | null {
    const input = value.trim();

    if (!input) {
      return null;
    }

    /*
     * Supports:
     *
     * 12
     * 12'
     * 12' 6"
     * 12'6"
     * 12' 6.5"
     * 150"
     */

    const feetMatch = input.match(/(\d+(?:\.\d+)?)\s*'/);
    const inchMatch = input.match(/(\d+(?:\.\d+)?)\s*"?$/);

    let feet = 0;
    let inches = 0;

    if (feetMatch) {
      feet = Number(feetMatch[1]);
    }

    if (inchMatch) {
      inches = Number(inchMatch[1]);
    }

    // Plain number = inches
    if (!feetMatch && !inchMatch) {
      const number = Number(input);

      return Number.isFinite(number) ? number : null;
    }

    return feet * 12 + inches;
  }

  applyWallLength(value: string, side: 'start' | 'end') {
    const wall = this.getSelectedWall();

    if (!wall) {
      return;
    }

    const newLength = this.parseWallLength(value);

    if (newLength === null || newLength <= 0) {
      return;
    }

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;

    const currentLength = Math.hypot(dx, dy);

    if (currentLength === 0) {
      return;
    }

    const directionX = dx / currentLength;
    const directionY = dy / currentLength;

    if (side === 'start') {
      wall.start = {
        x: wall.end.x - directionX * newLength,
        y: wall.end.y - directionY * newLength,
      };
    } else {
      wall.end = {
        x: wall.start.x + directionX * newLength,
        y: wall.start.y + directionY * newLength,
      };
    }

    this.propertyService.wallChanged();
  }

  getWallDimensionPosition(wall: Wall): Point {
    const centerX = (wall.start.x + wall.end.x) / 2;
    const centerY = (wall.start.y + wall.end.y) / 2;

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;

    const length = Math.hypot(dx, dy);

    if (length === 0) {
      return {
        x: centerX,
        y: centerY - 25,
      };
    }

    // Perpendicular offset
    const offset = 25;

    return {
      x: centerX - (dy / length) * offset,
      y: centerY + (dx / length) * offset,
    };
  }
  getWallDimensionTransform(wall: Wall): string {
    const position = this.getWallDimensionPosition(wall);

    return `translate(${position.x} ${position.y})`;
  }

  getWallDimensionRotation(wall: Wall): number {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;

    let angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Keep the text readable instead of upside down.
    if (angle > 90 || angle < -90) {
      angle += 180;
    }

    return angle;
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

    const wall = this.propertyService.property.walls.find((wall) => wall.id === wallId);

    if (wall) {
      this.wallLengthInput = this.formatWallLength(this.getWallLength(wall));
    }

    // Store the actual screen position where the wall was clicked.
    if (event) {
      const svg = (event.currentTarget as SVGElement).ownerSVGElement;

      if (svg) {
        const rect = svg.getBoundingClientRect();

        this.wallDimensionPosition = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }
    }
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

    this.wallLengthInput = '';
    this.wallDimensionFocused = false;
    this.wallDimensionPosition = null;
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
    this.wallLengthInput = '';
    this.wallDimensionFocused = false;
    this.wallDimensionPosition = null;
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

    const wall = this.propertyService.property.walls.find((wall) => wall.id === wallId);

    if (!wall) {
      return;
    }

    this.editorStateService.draggingWallId = wallId;

    this.editorStateService.draggingEndpoint = endpoint;

    this.draggingOriginalPoint = {
      ...wall[endpoint],
    };
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

    // --------------------------------
    // First click = drawing start
    // --------------------------------

    if (!this.editorStateService.drawingStart) {
      const result = connectWallEndpoint(
        this.propertyService.property.walls,
        point,
        this.editorStateService.snapDistance,
      );

      // If the first click landed in the middle of a wall,
      // split that wall immediately.
      if (result.split) {
        this.propertyService.splitWall(result.split.wall.id, result.split.point);
      }

      this.editorStateService.drawingStart = result.point;

      return;
    }

    // --------------------------------
    // Second click = drawing end
    // --------------------------------

    const drawingPoint = getDrawingPoint(
      this.editorStateService.drawingStart,
      point,
      this.propertyService.property.walls,
      this.editorStateService.shiftPressed,
      this.editorStateService.angleSnap,
      this.editorStateService.snapDistance,
    );

    const result = connectWallEndpoint(
      this.propertyService.property.walls,
      drawingPoint,
      this.editorStateService.snapDistance,
    );

    // If the endpoint landed inside an existing wall,
    // split that wall before creating the new wall.
    if (result.split) {
      this.propertyService.splitWall(result.split.wall.id, result.split.point);
    }

    const finalPoint = result.point;

    // Don't create zero-length walls.
    if (
      finalPoint.x === this.editorStateService.drawingStart.x &&
      finalPoint.y === this.editorStateService.drawingStart.y
    ) {
      return;
    }

    const newWall: Wall = {
      id: crypto.randomUUID(),
      start: {
        ...this.editorStateService.drawingStart,
      },
      end: {
        ...finalPoint,
      },
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
    if (this.editorStateService.draggingWallId && this.editorStateService.draggingEndpoint) {
      this.propertyService.resolveWallTopology(
        this.editorStateService.draggingWallId,
        this.editorStateService.draggingEndpoint,
      );
    }

    this.editorStateService.draggingWallId = null;
    this.editorStateService.draggingEndpoint = null;

    this.draggingOriginalPoint = null;

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

    // Don't let editor shortcuts fire while typing in an input.
    const target = event.target as HTMLElement;

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
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
