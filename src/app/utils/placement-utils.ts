import { Point } from '../models/room';
import { Wall } from '../models/wall';
import { getClosestWall, getWallSide } from './editor-geometry';

export interface PlacementPreview {
  wallId: string;
  position: number;
  side: 1 | -1;
}

export function getPlacementPreview(
  walls: Wall[],
  point: Point,
  attachDistance = 40,
): PlacementPreview | null {
  const result = getClosestWall(walls, point);

  if (!result.wall) {
    return null;
  }

  if (result.distance > attachDistance) {
    return null;
  }

  if (result.position < 0.1 || result.position > 0.9) {
    return null;
  }

  return {
    wallId: result.wall.id,
    position: result.position,
    side: getWallSide(result.wall, point),
  };
}
