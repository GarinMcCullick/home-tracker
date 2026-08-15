import { Point } from '../models/room';
import { Wall } from '../models/wall';

export interface WallSplitResult {
  wall: Wall;
  first: Wall;
  second: Wall;
  point: Point;
}

const DEFAULT_TOLERANCE = 1;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function projectPointOntoWall(
  point: Point,
  wall: Wall,
): {
  point: Point;
  position: number;
  distance: number;
} {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;

  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return {
      point: wall.start,
      position: 0,
      distance: distance(point, wall.start),
    };
  }

  let position = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared;

  position = Math.max(0, Math.min(1, position));

  const projectedPoint: Point = {
    x: wall.start.x + dx * position,
    y: wall.start.y + dy * position,
  };

  return {
    point: projectedPoint,
    position,
    distance: distance(point, projectedPoint),
  };
}

export function findWallEndpointConnection(
  walls: Wall[],
  point: Point,
  tolerance = DEFAULT_TOLERANCE,
  excludeWallId?: string,
): Point | null {
  let closest: Point | null = null;
  let closestDistance = tolerance;

  for (const wall of walls) {
    if (wall.id === excludeWallId) {
      continue;
    }

    const startDistance = distance(point, wall.start);

    if (startDistance <= closestDistance) {
      closestDistance = startDistance;
      closest = wall.start;
    }

    const endDistance = distance(point, wall.end);

    if (endDistance <= closestDistance) {
      closestDistance = endDistance;
      closest = wall.end;
    }
  }

  return closest;
}

export function findWallSplitPoint(
  walls: Wall[],
  point: Point,
  tolerance: number,
  excludeWallId?: string,
): { wall: Wall; point: Point; position: number } | null {
  let closest: {
    wall: Wall;
    point: Point;
    position: number;
    distance: number;
  } | null = null;

  for (const wall of walls) {
    if (wall.id === excludeWallId) {
      continue;
    }

    const projection = projectPointOntoWall(point, wall);

    // Don't treat an existing endpoint as an interior split.
    const endpointTolerance = 0.0001;

    if (projection.position <= endpointTolerance || projection.position >= 1 - endpointTolerance) {
      continue;
    }

    if (projection.distance > tolerance) {
      continue;
    }

    if (!closest || projection.distance < closest.distance) {
      closest = {
        wall,
        point: projection.point,
        position: projection.position,
        distance: projection.distance,
      };
    }
  }

  if (!closest) {
    return null;
  }

  return {
    wall: closest.wall,
    point: closest.point,
    position: closest.position,
  };
}

export function splitWallAtPoint(wall: Wall, point: Point): WallSplitResult | null {
  const projection = projectPointOntoWall(point, wall);

  // Don't create zero-length walls.
  if (projection.position <= 0.0001 || projection.position >= 0.9999) {
    return null;
  }

  const splitPoint = projection.point;

  const first: Wall = {
    id: wall.id,
    start: { ...wall.start },
    end: { ...splitPoint },
    thickness: wall.thickness,
    height: wall.height,
  };

  const second: Wall = {
    id: crypto.randomUUID(),
    start: { ...splitPoint },
    end: { ...wall.end },
    thickness: wall.thickness,
    height: wall.height,
  };

  return {
    wall,
    first,
    second,
    point: splitPoint,
  };
}

export function connectWallEndpoint(
  walls: Wall[],
  point: Point,
  tolerance: number,
  excludeWallId?: string,
): {
  point: Point;
  split: WallSplitResult | null;
} {
  // First preference: an existing endpoint.
  const endpoint = findWallEndpointConnection(walls, point, tolerance, excludeWallId);

  if (endpoint) {
    return {
      point: { ...endpoint },
      split: null,
    };
  }

  // Otherwise see whether we're landing in the middle of a wall.
  const split = findWallSplitPoint(walls, point, tolerance, excludeWallId);

  if (split) {
    const result = splitWallAtPoint(split.wall, split.point);

    if (result) {
      return {
        point: result.point,
        split: result,
      };
    }
  }

  // Nothing to connect to.
  return {
    point: { ...point },
    split: null,
  };
}

export function arePointsEqual(a: Point, b: Point, tolerance = 0.5): boolean {
  return distance(a, b) <= tolerance;
}

function isCollinear(a: Wall, b: Wall, tolerance: number): boolean {
  const ax = a.end.x - a.start.x;
  const ay = a.end.y - a.start.y;

  const bx = b.end.x - b.start.x;
  const by = b.end.y - b.start.y;

  const cross = Math.abs(ax * by - ay * bx);

  return cross <= tolerance;
}

function getSharedPoint(a: Wall, b: Wall, tolerance: number): Point | null {
  if (arePointsEqual(a.start, b.start, tolerance)) {
    return { ...a.start };
  }

  if (arePointsEqual(a.start, b.end, tolerance)) {
    return { ...a.start };
  }

  if (arePointsEqual(a.end, b.start, tolerance)) {
    return { ...a.end };
  }

  if (arePointsEqual(a.end, b.end, tolerance)) {
    return { ...a.end };
  }

  return null;
}

function getWallOtherEndpoint(wall: Wall, sharedPoint: Point, tolerance: number): Point | null {
  if (arePointsEqual(wall.start, sharedPoint, tolerance)) {
    return { ...wall.end };
  }

  if (arePointsEqual(wall.end, sharedPoint, tolerance)) {
    return { ...wall.start };
  }

  return null;
}

/**
 * Returns the number of wall segments connected to a point.
 */
export function getWallConnectionCount(walls: Wall[], point: Point, tolerance = 0.5): number {
  let count = 0;

  for (const wall of walls) {
    if (arePointsEqual(wall.start, point, tolerance)) {
      count++;
    }

    if (arePointsEqual(wall.end, point, tolerance)) {
      count++;
    }
  }

  return count;
}

/**
 * Finds two collinear walls that meet at a point which is
 * no longer a real junction.
 *
 * A real junction has 3+ wall connections.
 * Two collinear segments meeting at a point with only
 * 2 connections can safely become one wall.
 */
export function findMergeCandidate(
  walls: Wall[],
  tolerance = 0.5,
): {
  first: Wall;
  second: Wall;
  junction: Point;
} | null {
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const first = walls[i];
      const second = walls[j];

      if (first.thickness !== second.thickness || first.height !== second.height) {
        continue;
      }

      const junction = getSharedPoint(first, second, tolerance);

      if (!junction) {
        continue;
      }

      // They must actually be on the same line.
      if (!isCollinear(first, second, tolerance)) {
        continue;
      }

      // If another wall is still connected here, this is
      // a real junction and must remain split.
      const connectionCount = getWallConnectionCount(walls, junction, tolerance);

      if (connectionCount !== 2) {
        continue;
      }

      return {
        first,
        second,
        junction,
      };
    }
  }

  return null;
}

/**
 * Merge two collinear wall segments.
 */
export function mergeWalls(
  first: Wall,
  second: Wall,
  junction: Point,
  tolerance = 0.5,
): Wall | null {
  const firstOther = getWallOtherEndpoint(first, junction, tolerance);

  const secondOther = getWallOtherEndpoint(second, junction, tolerance);

  if (!firstOther || !secondOther) {
    return null;
  }

  return {
    // Keep the first wall's ID.
    id: first.id,

    start: firstOther,
    end: secondOther,

    thickness: first.thickness,
    height: first.height,
  };
}

/**
 * Repeatedly removes unnecessary collinear splits.
 *
 * Example:
 *
 * A ─── B ─── C
 *
 * becomes:
 *
 * A ───────── C
 *
 * But:
 *
 * A ─── B ─── C
 *       │
 *
 * remains split because B is a real junction.
 */
export function mergeCollinearWalls(walls: Wall[], tolerance = 0.5): Wall[] {
  let result = [...walls];

  while (true) {
    const candidate = findMergeCandidate(result, tolerance);

    if (!candidate) {
      break;
    }

    const merged = mergeWalls(candidate.first, candidate.second, candidate.junction, tolerance);

    if (!merged) {
      break;
    }

    result = result.filter(
      (wall) => wall.id !== candidate.first.id && wall.id !== candidate.second.id,
    );

    result.push(merged);
  }

  return result;
}
