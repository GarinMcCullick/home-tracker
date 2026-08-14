import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PropertyService } from '../services/property';
import { getWallPolygon } from '../utils/wall-geometry';
import { Door } from '../models/door';
import { Window } from '../models/window';

type EditorTool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'sensor';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit {
  selectedWallId: string | null = null;
  selectedRoomId: string | null = null;
  selectedDoorId: string | null = null;
  draggingDoorId: string | null = null;
  selectedWindowId: string | null = null;
  draggingWindowId: string | null = null;

  draggingEndpoint: 'start' | 'end' | null = null;
  draggingWallId: string | null = null;
  angleSnap = 45;
  snapTarget: { x: number; y: number } | null = null;

  activeTool: EditorTool = 'select';
  snapDistance = 20;
  shiftPressed = false;
  drawingStart: { x: number; y: number } | null = null;
  mousePosition: { x: number; y: number } | null = null;

  constructor(public propertyService: PropertyService) {}

  ngOnInit() {
    this.propertyService.recalculateRooms();
  }

  setTool(tool: EditorTool) {
    this.activeTool = tool;

    // Cancel any unfinished wall
    this.drawingStart = null;

    // Stop dragging
    this.draggingWallId = null;
    this.draggingEndpoint = null;

    // Clear snapping
    this.snapTarget = null;
  }

  getWallPoints(wall: any): string {
    const polygon = getWallPolygon(wall);

    return polygon.points.map((point) => `${point.x},${point.y}`).join(' ');
  }

  selectWall(wallId: string, event?: MouseEvent) {
    event?.stopPropagation();

    if (this.activeTool !== 'select') {
      return;
    }

    this.selectedWallId = wallId;
    this.selectedDoorId = null;
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

  selectDoor(doorId: string, event: MouseEvent) {
    event.stopPropagation();

    if (this.activeTool !== 'select') {
      return;
    }

    this.selectedDoorId = doorId;
    this.selectedWallId = null;
    this.selectedRoomId = null;
  }

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
      return;
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

  startDraggingDoor(event: MouseEvent, doorId: string) {
    event.stopPropagation();

    if (this.activeTool !== 'select') {
      return;
    }

    this.selectedDoorId = doorId;
    this.selectedWallId = null;
    this.selectedRoomId = null;

    this.draggingDoorId = doorId;
  }

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

  selectRoom(roomId: string, event: MouseEvent) {
    event.stopPropagation();

    if (this.activeTool !== 'select') {
      return;
    }

    this.selectedRoomId = roomId;
    this.selectedWallId = null;
    this.selectedDoorId = null;
  }

  dragDoor(point: { x: number; y: number }) {
    const door = this.propertyService.property.doors.find((d) => d.id === this.draggingDoorId);

    if (!door) {
      return;
    }

    const result = this.getClosestWall(point);

    if (!result.wall) {
      return;
    }

    // Only attach when reasonably close to a wall
    const attachDistance = 40;

    if (result.distance > attachDistance) {
      this.snapTarget = null;
      return;
    }

    // Attach door to this wall
    door.wallId = result.wall.id;

    // Position along wall
    door.position = result.position;

    // Show where we're snapping
    this.snapTarget = {
      x: result.wall.start.x + (result.wall.end.x - result.wall.start.x) * result.position,

      y: result.wall.start.y + (result.wall.end.y - result.wall.start.y) * result.position,
    };
  }

  dragWindow(point: { x: number; y: number }) {
    const window = this.propertyService.property.windows.find(
      (w) => w.id === this.draggingWindowId,
    );

    if (!window) {
      return;
    }

    const result = this.getClosestWall(point);

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

  getClosestWall(point: { x: number; y: number }) {
    let closestWall = null;
    let closestDistance = Infinity;
    let closestPosition = 0;

    for (const wall of this.propertyService.property.walls) {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;

      const lengthSquared = dx * dx + dy * dy;

      if (lengthSquared === 0) {
        continue;
      }

      let t = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared;

      // Keep position between 0 and 1
      t = Math.max(0, Math.min(1, t));

      const closestPoint = {
        x: wall.start.x + t * dx,
        y: wall.start.y + t * dy,
      };

      const distance = Math.hypot(point.x - closestPoint.x, point.y - closestPoint.y);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestWall = wall;
        closestPosition = t;
      }
    }

    return {
      wall: closestWall,
      position: closestPosition,
      distance: closestDistance,
    };
  }

  deleteSelectedWall() {
    if (!this.selectedWallId) {
      return;
    }

    this.propertyService.removeWall(this.selectedWallId);

    this.selectedWallId = null;
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.shiftPressed = true;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && this.activeTool === 'select') {
      if (this.selectedDoorId) {
        this.deleteSelectedDoor();
        return;
      }

      if (this.selectedWallId) {
        this.deleteSelectedWall();
        return;
      }
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyboardUp(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.shiftPressed = false;
    }
  }

  startDragging(event: MouseEvent, wallId: string, endpoint: 'start' | 'end') {
    event.stopPropagation();

    this.draggingWallId = wallId;
    this.draggingEndpoint = endpoint;
  }

  stopDragging() {
    if (this.draggingWallId) {
      this.propertyService.wallChanged();
    }

    this.draggingWallId = null;
    this.draggingEndpoint = null;
    this.draggingDoorId = null;
    this.draggingWindowId = null;
    this.snapTarget = null;
  }

  onMouseMove(event: MouseEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    if (!svg) return;

    // Convert browser coordinates → SVG coordinates
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;

    const matrix = svg.getScreenCTM()?.inverse();
    if (!matrix) return;

    const svgPoint = point.matrixTransform(matrix);

    const rawPoint = {
      x: svgPoint.x,
      y: svgPoint.y,
    };

    // --------------------------------
    // Dragging a door
    // --------------------------------

    if (this.draggingDoorId) {
      this.dragDoor(rawPoint);
      return;
    }

    // --------------------------------
    // Dragging a door
    // --------------------------------

    if (this.draggingWindowId) {
      this.dragWindow(rawPoint);
      return;
    }

    // --------------------------------
    // Drawing a new wall
    // --------------------------------

    if (this.activeTool === 'wall' && this.drawingStart) {
      const drawingPoint = this.getDrawingPoint(rawPoint);

      this.mousePosition = drawingPoint;

      if (drawingPoint.x !== rawPoint.x || drawingPoint.y !== rawPoint.y) {
        this.snapTarget = drawingPoint;
      } else {
        this.snapTarget = null;
      }

      return;
    }

    // --------------------------------
    // Normal mouse movement
    // --------------------------------

    this.mousePosition = rawPoint;

    // --------------------------------
    // Existing wall endpoint dragging
    // --------------------------------

    if (!this.draggingWallId || !this.draggingEndpoint) {
      this.snapTarget = null;
      return;
    }

    let dragPoint = rawPoint;

    if (this.shiftPressed) {
      const wall = this.propertyService.property.walls.find((w) => w.id === this.draggingWallId);

      if (wall) {
        const fixedPoint = this.draggingEndpoint === 'start' ? wall.end : wall.start;

        dragPoint = this.snapAngle(fixedPoint, rawPoint);
      }
    }

    const snappedPoint = this.snapPoint(dragPoint, this.draggingWallId, this.draggingEndpoint);

    // Show snap indicator
    if (snappedPoint.x !== rawPoint.x || snappedPoint.y !== rawPoint.y) {
      this.snapTarget = snappedPoint;
    } else {
      this.snapTarget = null;
    }

    // Find the wall
    const wall = this.propertyService.property.walls.find((w) => w.id === this.draggingWallId);

    if (!wall) return;

    // Move the endpoint
    wall[this.draggingEndpoint] = {
      x: snappedPoint.x,
      y: snappedPoint.y,
    };
  }

  getSvgPoint(event: MouseEvent): { x: number; y: number } {
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

  handleWallClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    if (!this.drawingStart) {
      this.drawingStart = this.snapPoint(point);

      return;
    }

    const finalPoint = this.getDrawingPoint(point);

    const newWall = {
      id: crypto.randomUUID(),

      start: this.drawingStart,

      end: finalPoint,

      thickness: 12,

      height: 96,
    };

    this.propertyService.addWall(newWall);

    this.drawingStart = null;
  }

  handleRoomClick(event: MouseEvent) {
    console.log('Room tool clicked');
  }

  handleDoorClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    const result = this.getClosestWall(point);

    if (!result.wall) {
      return;
    }

    // Don't allow doors too close to the ends
    if (result.position < 0.1 || result.position > 0.9) {
      return;
    }

    const door = {
      id: crypto.randomUUID(),

      wallId: result.wall.id,

      position: result.position,

      width: 80,

      swing: 'right' as const,

      open: false,
    };

    this.propertyService.addDoor(door);

    console.log('Door created:', door);
  }

  getDoorTransform(door: Door): string {
    const wall = this.propertyService.property.walls.find((w) => w.id === door.wallId);

    if (!wall) {
      return '';
    }

    const x = wall.start.x + (wall.end.x - wall.start.x) * door.position;

    const y = wall.start.y + (wall.end.y - wall.start.y) * door.position;

    const angle =
      (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI;

    return `
    translate(${x} ${y})
    rotate(${angle})
  `;
  }

  handleWindowClick(event: MouseEvent) {
    const point = this.getSvgPoint(event);

    const result = this.getClosestWall(point);

    if (!result.wall) {
      return;
    }

    // Don't allow windows right at the corners
    if (result.position < 0.1 || result.position > 0.9) {
      return;
    }

    const window = {
      id: crypto.randomUUID(),

      wallId: result.wall.id,

      position: result.position,

      width: 100,

      height: 48,
    };

    this.propertyService.addWindow(window);

    console.log('Window created:', window);
  }

  getWindowTransform(window: Window): string {
    const wall = this.propertyService.property.walls.find((w) => w.id === window.wallId);

    if (!wall) {
      return '';
    }

    const x = wall.start.x + (wall.end.x - wall.start.x) * window.position;

    const y = wall.start.y + (wall.end.y - wall.start.y) * window.position;

    const angle =
      (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI;

    return `translate(${x} ${y}) rotate(${angle})`;
  }

  handleSensorClick(event: MouseEvent) {
    console.log('Sensor tool clicked');
  }

  clearSelection() {
    this.selectedWallId = null;
    this.selectedRoomId = null;
    this.selectedDoorId = null;
    this.selectedWindowId = null;
  }

  snapPoint(
    point: { x: number; y: number },
    wallId?: string,
    endpoint?: 'start' | 'end',
  ): { x: number; y: number } {
    for (const wall of this.propertyService.property.walls) {
      // Don't snap to the endpoint we're currently dragging
      if (wall.id === wallId) {
        continue;
      }

      const endpoints = [wall.start, wall.end];

      for (const target of endpoints) {
        const dx = point.x - target.x;
        const dy = point.y - target.y;

        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= this.snapDistance) {
          return {
            x: target.x,
            y: target.y,
          };
        }
      }
    }

    return point;
  }

  snapAngle(
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): { x: number; y: number } {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) {
      return end;
    }

    const angle = Math.atan2(dy, dx);

    const snapIncrement = (this.angleSnap * Math.PI) / 180;

    const snappedAngle = Math.round(angle / snapIncrement) * snapIncrement;

    return {
      x: start.x + Math.cos(snappedAngle) * distance,
      y: start.y + Math.sin(snappedAngle) * distance,
    };
  }

  getDrawingPoint(point: { x: number; y: number }): { x: number; y: number } {
    if (!this.drawingStart) {
      return point;
    }

    let finalPoint = point;

    // Only constrain the angle while Shift is held
    if (this.shiftPressed) {
      finalPoint = this.snapAngle(this.drawingStart, finalPoint);
    }

    // Endpoint snapping is always active
    finalPoint = this.snapPoint(finalPoint);

    return finalPoint;
  }
}
