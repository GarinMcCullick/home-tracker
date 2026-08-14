import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PropertyService } from '../services/property';
import { RoomService } from '../services/room';
import { getWallPolygon } from '../utils/wall-geometry';

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
  draggingEndpoint: 'start' | 'end' | null = null;
  draggingWallId: string | null = null;
  angleSnap = 45;
  snapTarget: { x: number; y: number } | null = null;

  drawingWall = false;
  snapDistance = 20;
  shiftPressed = false;
  drawingStart: { x: number; y: number } | null = null;
  mousePosition: { x: number; y: number } | null = null;

  constructor(
    public propertyService: PropertyService,
    public roomService: RoomService,
  ) {}

  ngOnInit() {
    this.propertyService.recalculateRooms();
  }

  getWallPoints(wall: any): string {
    const polygon = getWallPolygon(wall);

    return polygon.points.map((point) => `${point.x},${point.y}`).join(' ');
  }

  selectWall(wallId: string, event?: MouseEvent) {
    event?.stopPropagation();

    if (this.drawingWall) {
      return;
    }

    this.selectedWallId = wallId;
  }

  selectRoom(roomId: string, event: MouseEvent) {
    event.stopPropagation();

    if (this.drawingWall) {
      return;
    }

    this.selectedRoomId = roomId;
    this.selectedWallId = null;
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

  startDrawingWall() {
    this.drawingWall = true;
    this.drawingStart = null;
    this.selectedWallId = null;
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

    if (event.key === 'Delete' || event.key === 'Backspace') {
      this.deleteSelectedWall();
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
    // Drawing a new wall
    // --------------------------------

    if (this.drawingWall && this.drawingStart) {
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
    if (!this.drawingWall) {
      return;
    }

    const svg = event.currentTarget as SVGSVGElement;

    const point = svg.createSVGPoint();

    point.x = event.clientX;
    point.y = event.clientY;

    const matrix = svg.getScreenCTM()?.inverse();
    if (!matrix) return;

    const svgPoint = point.matrixTransform(matrix);

    if (!this.drawingStart) {
      const snappedStart = this.snapPoint({
        x: svgPoint.x,
        y: svgPoint.y,
      });

      this.drawingStart = snappedStart;

      return;
    }

    const finalPoint = this.getDrawingPoint({
      x: svgPoint.x,
      y: svgPoint.y,
    });

    const newWall = {
      id: crypto.randomUUID(),

      start: this.drawingStart,

      end: finalPoint,

      thickness: 12,

      height: 96,
    };

    this.propertyService.addWall(newWall);

    this.selectedWallId = newWall.id;

    this.drawingStart = null;

    this.drawingWall = false;

    this.updateRooms();
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

  updateRooms() {
    this.propertyService.property.rooms = this.roomService.findRooms(
      this.propertyService.property.walls,
    );
  }
}
