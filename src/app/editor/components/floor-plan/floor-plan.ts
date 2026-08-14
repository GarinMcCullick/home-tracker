import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';

import { PropertyService } from '../../../services/property';
import { WallEditorService } from '../../../services/wall-editor';

import { getWallPolygon } from '../../../utils/wall-geometry';

import { EditorTool } from '../editor-toolbar/editor-toolbar';

import { Wall } from '../../../models/wall';
import { Door } from '../../../models/door';
import { Window } from '../../../models/window';

@Component({
  selector: 'app-floor-plan',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './floor-plan.html',
  styleUrl: './floor-plan.scss',
})
export class FloorPlan {
  @Input() activeTool: EditorTool = 'select';
  @Input() selectedWallId: string | null = null;
  @Input() shiftPressed = false;

  @Output() wallSelected = new EventEmitter<string | null>();

  draggingEndpoint: 'start' | 'end' | null = null;
  draggingWallId: string | null = null;

  angleSnap = 45;
  snapDistance = 20;

  snapTarget: { x: number; y: number } | null = null;
  drawingStart: { x: number; y: number } | null = null;
  mousePosition: { x: number; y: number } | null = null;

  constructor(
    public propertyService: PropertyService,
    public wallEditorService: WallEditorService,
  ) {}

  get walls(): Wall[] {
    return this.propertyService.property.walls;
  }

  get rooms() {
    return this.propertyService.property.rooms;
  }

  get doors(): Door[] {
    return this.propertyService.property.doors;
  }

  get windows(): Window[] {
    return this.propertyService.property.windows;
  }

  // --------------------------------------------------
  // WALL GEOMETRY
  // --------------------------------------------------

  getWallPoints(wall: Wall): string {
    const polygon = getWallPolygon(wall);

    return polygon.points.map((point) => `${point.x},${point.y}`).join(' ');
  }

  getWall(wallId: string): Wall | undefined {
    return this.walls.find((wall) => wall.id === wallId);
  }

  getWallAngle(wall: Wall): number {
    return (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI;
  }

  // --------------------------------------------------
  // DOORS / WINDOWS
  // --------------------------------------------------

  getPointOnWall(wall: Wall, position: number): { x: number; y: number } {
    return {
      x: wall.start.x + (wall.end.x - wall.start.x) * position,

      y: wall.start.y + (wall.end.y - wall.start.y) * position,
    };
  }

  getDoorPosition(door: Door) {
    const wall = this.getWall(door.wallId);

    if (!wall) {
      return null;
    }

    return this.getPointOnWall(wall, door.position);
  }

  getWindowPosition(window: Window) {
    const wall = this.getWall(window.wallId);

    if (!wall) {
      return null;
    }

    return this.getPointOnWall(wall, window.position);
  }

  // --------------------------------------------------
  // SELECTION
  // --------------------------------------------------

  selectWall(wallId: string, event?: MouseEvent) {
    event?.stopPropagation();

    if (this.activeTool !== 'select') {
      return;
    }

    this.selectedWallId = wallId;

    this.wallSelected.emit(wallId);
  }

  clearSelection() {
    this.selectedWallId = null;

    this.wallSelected.emit(null);
  }

  // --------------------------------------------------
  // DRAGGING WALL ENDPOINTS
  // --------------------------------------------------

  startDragging(event: MouseEvent, wallId: string, endpoint: 'start' | 'end') {
    event.stopPropagation();

    if (this.activeTool !== 'select') {
      return;
    }

    this.draggingWallId = wallId;
    this.draggingEndpoint = endpoint;
  }

  stopDragging() {
    if (this.draggingWallId) {
      this.wallEditorService.wallChanged();
    }

    this.draggingWallId = null;
    this.draggingEndpoint = null;
  }

  // --------------------------------------------------
  // MOUSE MOVE
  // --------------------------------------------------

  onMouseMove(event: MouseEvent) {
    const svg = event.currentTarget as SVGSVGElement;

    const point = svg.createSVGPoint();

    point.x = event.clientX;
    point.y = event.clientY;

    const matrix = svg.getScreenCTM()?.inverse();

    if (!matrix) {
      return;
    }

    const svgPoint = point.matrixTransform(matrix);

    const rawPoint = {
      x: svgPoint.x,
      y: svgPoint.y,
    };

    // Drawing a new wall
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

    this.mousePosition = rawPoint;

    // Dragging existing wall
    if (!this.draggingWallId || !this.draggingEndpoint) {
      this.snapTarget = null;
      return;
    }

    let dragPoint = rawPoint;

    if (this.shiftPressed) {
      const wall = this.getWall(this.draggingWallId);

      if (wall) {
        const fixedPoint = this.draggingEndpoint === 'start' ? wall.end : wall.start;

        dragPoint = this.snapAngle(fixedPoint, rawPoint);
      }
    }

    const snappedPoint = this.snapPoint(dragPoint, this.draggingWallId, this.draggingEndpoint);

    this.snapTarget = snappedPoint;

    this.wallEditorService.updateWallEndpoint(
      this.draggingWallId,
      this.draggingEndpoint,
      snappedPoint,
    );
  }

  // --------------------------------------------------
  // SVG COORDINATES
  // --------------------------------------------------

  getSvgPoint(event: MouseEvent) {
    const svg = event.currentTarget as SVGSVGElement;

    const point = svg.createSVGPoint();

    point.x = event.clientX;
    point.y = event.clientY;

    const matrix = svg.getScreenCTM();

    if (!matrix) {
      return {
        x: 0,
        y: 0,
      };
    }

    const svgPoint = point.matrixTransform(matrix.inverse());

    return {
      x: svgPoint.x,
      y: svgPoint.y,
    };
  }

  // --------------------------------------------------
  // CANVAS CLICK
  // --------------------------------------------------

  handleCanvasClick(event: MouseEvent) {
    // SELECT
    if (this.activeTool === 'select') {
      this.clearSelection();
      return;
    }

    // WALL
    if (this.activeTool === 'wall') {
      const point = this.getSvgPoint(event);

      if (!this.drawingStart) {
        this.drawingStart = this.snapPoint(point);

        this.mousePosition = this.drawingStart;

        return;
      }

      const finalPoint = this.getDrawingPoint(point);

      this.wallEditorService.addWall({
        id: crypto.randomUUID(),
        start: this.drawingStart,
        end: finalPoint,
        thickness: 12,
        height: 96,
      });

      this.drawingStart = null;
      this.mousePosition = null;
      this.snapTarget = null;

      return;
    }

    // Other tools will be implemented next.
  }

  // --------------------------------------------------
  // SNAP TO WALL ENDPOINT
  // --------------------------------------------------

  snapPoint(
    point: { x: number; y: number },
    wallId?: string,
    endpoint?: 'start' | 'end',
  ): { x: number; y: number } {
    for (const wall of this.walls) {
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

  // --------------------------------------------------
  // ANGLE SNAP
  // --------------------------------------------------

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

  // --------------------------------------------------
  // DRAWING POINT
  // --------------------------------------------------

  getDrawingPoint(point: { x: number; y: number }): { x: number; y: number } {
    if (!this.drawingStart) {
      return point;
    }

    let finalPoint = point;

    if (this.shiftPressed) {
      finalPoint = this.snapAngle(this.drawingStart, finalPoint);
    }

    finalPoint = this.snapPoint(finalPoint);

    return finalPoint;
  }
}
