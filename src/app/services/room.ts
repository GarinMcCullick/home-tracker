import { Injectable } from '@angular/core';

import { Wall } from '../models/wall';
import { Room } from '../models/room';
import { Point } from '../models/room';

@Injectable({
  providedIn: 'root',
})
export class RoomService {
  findRooms(walls: Wall[]): Room[] {
    const rooms: Room[] = [];

    const processed = new Set<string>();

    for (const wall of walls) {
      if (processed.has(wall.id)) {
        continue;
      }

      const loop = this.findLoop(wall, walls);

      if (!loop || loop.length < 3) {
        processed.add(wall.id);
        continue;
      }

      const roomId = this.getRoomId(loop);

      processed.add(wall.id);

      const area = this.calculateArea(loop);

      if (area <= 0) {
        continue;
      }

      rooms.push({
        id: roomId,

        name: `Room ${rooms.length + 1}`,

        polygon: loop,

        area,
      });
    }

    return rooms;
  }

  getRoomId(points: Point[]): string {
    return points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
  }

  pointsEqual(a: Point, b: Point): boolean {
    const tolerance = 0.5;

    return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance;
  }

  findConnectedWalls(current: Wall, walls: Wall[]): Wall[] {
    return walls.filter((wall) => this.pointsEqual(wall.start, current.end));
  }

  findLoop(startWall: Wall, walls: Wall[]): Point[] | null {
    const points: Point[] = [startWall.start, startWall.end];

    let currentPoint = startWall.end;

    const usedWalls = new Set<string>();

    usedWalls.add(startWall.id);

    while (true) {
      const nextWall = walls.find((wall) => {
        if (usedWalls.has(wall.id)) {
          return false;
        }

        return (
          this.pointsEqual(wall.start, currentPoint) || this.pointsEqual(wall.end, currentPoint)
        );
      });

      if (!nextWall) {
        return null;
      }

      usedWalls.add(nextWall.id);

      // Determine which end we're currently touching
      if (this.pointsEqual(nextWall.start, currentPoint)) {
        currentPoint = nextWall.end;
      } else {
        currentPoint = nextWall.start;
      }

      // Closed loop
      if (this.pointsEqual(currentPoint, startWall.start)) {
        return points;
      }

      points.push(currentPoint);

      if (points.length > walls.length + 1) {
        return null;
      }
    }
  }

  calculateArea(points: Point[]): number {
    let area = 0;

    for (let i = 0; i < points.length; i++) {
      const current = points[i];

      const next = points[(i + 1) % points.length];

      area += current.x * next.y - next.x * current.y;
    }

    return Math.abs(area) / 2;
  }
}
