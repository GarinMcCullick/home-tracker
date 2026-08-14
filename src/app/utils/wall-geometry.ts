import { Point } from '../models/room';
import { Wall } from '../models/wall';

export function getWallPolygon(wall: Wall): Point[] {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;

  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) {
    return [];
  }

  // Unit perpendicular vector
  const nx = -dy / length;
  const ny = dx / length;

  const half = wall.thickness / 2;

  return [
    {
      x: wall.start.x + nx * half,
      y: wall.start.y + ny * half,
    },
    {
      x: wall.end.x + nx * half,
      y: wall.end.y + ny * half,
    },
    {
      x: wall.end.x - nx * half,
      y: wall.end.y - ny * half,
    },
    {
      x: wall.start.x - nx * half,
      y: wall.start.y - ny * half,
    },
  ];
}
