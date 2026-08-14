import { Point } from '../models/room';
import { Wall } from '../models/wall';

export interface ClosestWallResult {
  wall: Wall | null;
  position: number;
  distance: number;
}

// ==================================================
// WALL PROXIMITY
// ==================================================

export function getClosestWall(walls: Wall[], point: Point): ClosestWallResult {
  let closestWall: Wall | null = null;
  let closestDistance = Infinity;
  let closestPosition = 0;

  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;

    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      continue;
    }

    let t = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared;

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

// ==================================================
// SNAPPING
// ==================================================

export function snapPoint(
  walls: Wall[],
  point: Point,
  snapDistance: number,
  ignoredWallId?: string,
): Point {
  for (const wall of walls) {
    if (wall.id === ignoredWallId) {
      continue;
    }

    for (const target of [wall.start, wall.end]) {
      const distance = Math.hypot(point.x - target.x, point.y - target.y);

      if (distance <= snapDistance) {
        return {
          x: target.x,
          y: target.y,
        };
      }
    }
  }

  return point;
}

export function snapAngle(start: Point, end: Point, angleSnap: number): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return end;
  }

  const angle = Math.atan2(dy, dx);

  const snapIncrement = (angleSnap * Math.PI) / 180;

  const snappedAngle = Math.round(angle / snapIncrement) * snapIncrement;

  return {
    x: start.x + Math.cos(snappedAngle) * distance,

    y: start.y + Math.sin(snappedAngle) * distance,
  };
}

// ==================================================
// WALL SIDE
// ==================================================

export function getWallSide(wall: Wall, point: Point): 1 | -1 {
  const wallX = wall.end.x - wall.start.x;

  const wallY = wall.end.y - wall.start.y;

  const pointX = point.x - wall.start.x;

  const pointY = point.y - wall.start.y;

  const cross = wallX * pointY - wallY * pointX;

  return cross >= 0 ? 1 : -1;
}

// ==================================================
// WALL POINT
// ==================================================

export function getPointOnWall(wall: Wall, position: number): Point {
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * position,

    y: wall.start.y + (wall.end.y - wall.start.y) * position,
  };
}

// ==================================================
// WALL ANGLE
// ==================================================

export function getWallAngle(wall: Wall): number {
  return (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI;
}

// ==================================================
// WALL LENGTH
// ==================================================

export function getWallLength(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

// ==================================================
// Drawing
// ==================================================

export function getDrawingPoint(
  start: Point,
  point: Point,
  walls: Wall[],
  shiftPressed: boolean,
  angleSnap: number,
  snapDistance: number,
): Point {
  let finalPoint = point;

  if (shiftPressed) {
    finalPoint = snapAngle(start, finalPoint, angleSnap);
  }

  return snapPoint(walls, finalPoint, snapDistance);
}
