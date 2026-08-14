import { Point } from '../models/room';
import { Wall } from '../models/wall';

export interface ClosestWallResult {
  wall: Wall | null;
  position: number;
  distance: number;
}

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

export function getWallSide(wall: Wall, point: Point): 1 | -1 {
  const wallX = wall.end.x - wall.start.x;
  const wallY = wall.end.y - wall.start.y;

  const pointX = point.x - wall.start.x;
  const pointY = point.y - wall.start.y;

  const cross = wallX * pointY - wallY * pointX;

  return cross >= 0 ? 1 : -1;
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
