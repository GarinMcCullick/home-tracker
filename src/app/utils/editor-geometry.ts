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
// DRAWING
// ==================================================

function normalizeAngle(angle: number): number {
  while (angle > 180) {
    angle -= 360;
  }

  while (angle < -180) {
    angle += 360;
  }

  return angle;
}

function angleDifference(a: number, b: number): number {
  return Math.abs(normalizeAngle(a - b));
}

function getWallDirection(wall: Wall): number {
  return getWallAngle(wall);
}

/**
 * Finds a nearby wall endpoint to use as a drawing reference.
 */
function findNearbyEndpoint(
  walls: Wall[],
  point: Point,
  snapDistance: number,
): {
  point: Point;
  wall: Wall;
} | null {
  let closest: {
    point: Point;
    wall: Wall;
    distance: number;
  } | null = null;

  for (const wall of walls) {
    for (const endpoint of [wall.start, wall.end]) {
      const distance = Math.hypot(point.x - endpoint.x, point.y - endpoint.y);

      if (distance > snapDistance) {
        continue;
      }

      if (!closest || distance < closest.distance) {
        closest = {
          point: endpoint,
          wall,
          distance,
        };
      }
    }
  }

  return closest
    ? {
        point: { ...closest.point },
        wall: closest.wall,
      }
    : null;
}
// ==================================================
// DRAWING ALIGNMENT GUIDE
// ==================================================

export interface DrawingGuide {
  horizontal: number | null;
  vertical: number | null;
}

export function getDrawingGuide(
  point: Point,
  walls: Wall[],
  snapDistance: number,
  drawingStart?: Point | null,
  ignoredWallId?: string,
): DrawingGuide | null {
  let horizontal: number | null = null;
  let vertical: number | null = null;

  let closestHorizontalDistance = Infinity;
  let closestVerticalDistance = Infinity;

  for (const wall of walls) {
    // Don't guide against the wall currently being edited.
    if (wall.id === ignoredWallId) {
      continue;
    }

    for (const endpoint of [wall.start, wall.end]) {
      // Don't guide against the drawing start / fixed endpoint.
      if (
        drawingStart &&
        Math.abs(endpoint.x - drawingStart.x) < 0.001 &&
        Math.abs(endpoint.y - drawingStart.y) < 0.001
      ) {
        continue;
      }

      // --------------------------------
      // Horizontal alignment
      // --------------------------------

      const horizontalDistance = Math.abs(point.y - endpoint.y);

      if (horizontalDistance <= snapDistance && horizontalDistance < closestHorizontalDistance) {
        closestHorizontalDistance = horizontalDistance;
        horizontal = endpoint.y;
      }

      // --------------------------------
      // Vertical alignment
      // --------------------------------

      const verticalDistance = Math.abs(point.x - endpoint.x);

      if (verticalDistance <= snapDistance && verticalDistance < closestVerticalDistance) {
        closestVerticalDistance = verticalDistance;
        vertical = endpoint.x;
      }
    }
  }

  if (horizontal === null && vertical === null) {
    return null;
  }

  return {
    horizontal,
    vertical,
  };
}

/**
 * Returns a point projected from start at a specific angle
 * while preserving the cursor distance.
 */
function projectAtAngle(start: Point, point: Point, angle: number): Point {
  const distance = Math.hypot(point.x - start.x, point.y - start.y);

  const radians = (angle * Math.PI) / 180;

  return {
    x: start.x + Math.cos(radians) * distance,
    y: start.y + Math.sin(radians) * distance,
  };
}

/**
 * Finds the best architectural angle for a new wall.
 *
 * Priority:
 *
 * 1. Perpendicular to a nearby wall
 * 2. Parallel to a nearby wall
 * 3. Horizontal / vertical
 * 4. 45° increments
 */
function getPreferredDrawingAngle(
  start: Point,
  point: Point,
  walls: Wall[],
  snapDistance: number,
): number | null {
  const dx = point.x - start.x;
  const dy = point.y - start.y;

  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return null;
  }

  const currentAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

  // --------------------------------------------------
  // Distance-based snap tolerance
  //
  // Short walls = forgiving
  // Long walls = progressively harder to accidentally snap
  // --------------------------------------------------

  const minTolerance = 1.5;
  const maxTolerance = 6;

  const distanceScale = Math.min(distance / 400, 1);

  const angleTolerance = maxTolerance - (maxTolerance - minTolerance) * distanceScale;

  // --------------------------------------------------
  // Nearby wall reference
  // --------------------------------------------------

  const nearby = findNearbyEndpoint(walls, start, snapDistance * 1.5);

  if (nearby) {
    const wallAngle = getWallDirection(nearby.wall);

    const candidates = [wallAngle, wallAngle + 90, wallAngle + 180, wallAngle + 270];

    let bestAngle: number | null = null;
    let bestDifference = Infinity;

    for (const candidate of candidates) {
      const difference = angleDifference(currentAngle, candidate);

      if (difference < bestDifference) {
        bestDifference = difference;
        bestAngle = candidate;
      }
    }

    // Stronger architectural snapping near an existing wall,
    // but still respects the distance-based tolerance.
    if (bestAngle !== null && bestDifference <= angleTolerance) {
      return bestAngle;
    }
  }

  // --------------------------------------------------
  // General architectural snapping
  // --------------------------------------------------

  const architecturalAngles = [0, 45, 90, 135, 180, -45, -90, -135];

  let bestAngle: number | null = null;
  let bestDifference = Infinity;

  for (const candidate of architecturalAngles) {
    const difference = angleDifference(currentAngle, candidate);

    if (difference < bestDifference) {
      bestDifference = difference;
      bestAngle = candidate;
    }
  }

  if (bestAngle !== null && bestDifference <= angleTolerance) {
    return bestAngle;
  }

  return null;
}

export function getDrawingPoint(
  start: Point,
  point: Point,
  walls: Wall[],
  shiftPressed: boolean,
  angleSnap: number,
  snapDistance: number,
): Point {
  let finalPoint = { ...point };

  // --------------------------------------------------
  // SHIFT = strong/manual angle snapping
  // --------------------------------------------------

  if (shiftPressed) {
    finalPoint = snapAngle(start, finalPoint, angleSnap);
  } else {
    // --------------------------------------------------
    // Normal architectural snapping
    // --------------------------------------------------

    const preferredAngle = getPreferredDrawingAngle(start, finalPoint, walls, snapDistance);

    if (preferredAngle !== null) {
      finalPoint = projectAtAngle(start, finalPoint, preferredAngle);
    }
  }

  // --------------------------------------------------
  // Endpoint snapping happens last
  // --------------------------------------------------

  finalPoint = snapPoint(walls, finalPoint, snapDistance);

  return finalPoint;
}
