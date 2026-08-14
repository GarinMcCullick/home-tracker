import { Point } from '../models/room';
import { Wall } from '../models/wall';

export interface WallPolygon {
  points: Point[];
}

export function getWallPolygon(wall: Wall): WallPolygon {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;

  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) {
    return {
      points: [],
    };
  }

  // Unit perpendicular vector
  const nx = -dy / length;
  const ny = dx / length;

  const half = wall.thickness / 2;

  return {
    points: [
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
    ],
  };
}
