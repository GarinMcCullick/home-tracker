import { Door } from '../models/door';
import { Window } from '../models/window';
import { Wall } from '../models/wall';
import { getPointOnWall, getWallAngle } from './editor-geometry';

export interface ElementPlacement {
  wallId: string;
  position: number;
  side: 1 | -1;
}

function getWallElementTransform(wall: Wall, position: number, side: 1 | -1): string {
  const point = getPointOnWall(wall, position);
  const angle = getWallAngle(wall);

  const flip = side === -1 ? 'scale(1 -1)' : '';

  return `
    translate(${point.x} ${point.y})
    rotate(${angle})
    ${flip}
  `;
}

export function getDoorTransform(door: Door, walls: Wall[]): string {
  const wall = walls.find((wall) => wall.id === door.wallId);

  if (!wall) {
    return '';
  }

  return getWallElementTransform(wall, door.position, door.side);
}

export function getWindowTransform(window: Window, walls: Wall[]): string {
  const wall = walls.find((wall) => wall.id === window.wallId);

  if (!wall) {
    return '';
  }

  return getWallElementTransform(wall, window.position, window.side);
}

export function getPlacementTransform(placement: ElementPlacement, walls: Wall[]): string {
  const wall = walls.find((wall) => wall.id === placement.wallId);

  if (!wall) {
    return '';
  }

  return getWallElementTransform(wall, placement.position, placement.side);
}
