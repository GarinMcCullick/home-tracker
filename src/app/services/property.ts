import { Injectable, inject } from '@angular/core';

import { Property } from '../models/property';
import { Wall } from '../models/wall';
import { Door } from '../models/door';
import { Window } from '../models/window';
import { splitWallAtPoint } from '../utils/wall-topology';
import { RoomService } from './room';
import { Point } from '../models/room';
import { connectWallEndpoint, mergeCollinearWalls } from '../utils/wall-topology';
import { SmartDevice } from '../models/smart-device';

@Injectable({
  providedIn: 'root',
})
export class PropertyService {
  private roomService = inject(RoomService);

  property: Property = {
    id: 'home-1',
    name: 'Springfield House',

    width: 1000,
    height: 700,

    walls: [
      {
        id: 'wall-1',
        start: { x: 200, y: 150 },
        end: { x: 700, y: 150 },
        thickness: 4,
        height: 96,
      },
      {
        id: 'wall-2',
        start: { x: 700, y: 150 },
        end: { x: 700, y: 450 },
        thickness: 4,
        height: 96,
      },
      {
        id: 'wall-3',
        start: { x: 700, y: 450 },
        end: { x: 200, y: 450 },
        thickness: 4,
        height: 96,
      },
      {
        id: 'wall-4',
        start: { x: 200, y: 450 },
        end: { x: 200, y: 150 },
        thickness: 4,
        height: 96,
      },
    ],

    rooms: [],
    doors: [],
    windows: [],
    devices: [],
  };

  recalculateRooms() {
    this.property.rooms = this.roomService.findRooms(this.property.walls, this.property.rooms);
  }

  addWall(wall: Wall) {
    this.property.walls.push(wall);
    this.recalculateRooms();
  }

  removeWall(wallId: string) {
    this.property.walls = this.property.walls.filter((wall) => wall.id !== wallId);

    this.property.doors = this.property.doors.filter((door) => door.wallId !== wallId);

    this.property.windows = this.property.windows.filter((window) => window.wallId !== wallId);

    this.recalculateRooms();
  }

  wallChanged() {
    this.recalculateRooms();
  }

  addDoor(door: Door) {
    this.property.doors.push(door);
  }

  removeDoor(doorId: string) {
    this.property.doors = this.property.doors.filter((door) => door.id !== doorId);
  }

  addWindow(window: Window) {
    this.property.windows.push(window);
  }

  removeWindow(windowId: string) {
    this.property.windows = this.property.windows.filter((window) => window.id !== windowId);
  }
  splitWall(wallId: string, point: Point): boolean {
    const wallIndex = this.property.walls.findIndex((wall) => wall.id === wallId);

    if (wallIndex === -1) {
      return false;
    }

    const wall = this.property.walls[wallIndex];

    const result = splitWallAtPoint(wall, point);

    if (!result) {
      return false;
    }

    const { first, second } = result;

    // Replace the original wall with the two new segments.
    this.property.walls.splice(wallIndex, 1, first, second);

    // Move doors attached to the original wall.
    for (const door of this.property.doors) {
      if (door.wallId !== wallId) {
        continue;
      }

      if (door.position <= 0.5) {
        door.wallId = first.id;
        door.position = door.position / 0.5;
      } else {
        door.wallId = second.id;
        door.position = (door.position - 0.5) / 0.5;
      }
    }

    // Move windows attached to the original wall.
    for (const window of this.property.windows) {
      if (window.wallId !== wallId) {
        continue;
      }

      if (window.position <= 0.5) {
        window.wallId = first.id;
        window.position = window.position / 0.5;
      } else {
        window.wallId = second.id;
        window.position = (window.position - 0.5) / 0.5;
      }
    }

    this.recalculateRooms();

    return true;
  }
  resolveWallTopology(wallId: string, endpoint: 'start' | 'end') {
    const wall = this.property.walls.find((wall) => wall.id === wallId);

    if (!wall) {
      return;
    }

    const point = wall[endpoint];

    // --------------------------------
    // Connect to an existing endpoint
    // or split another wall
    // --------------------------------

    const connection = connectWallEndpoint(this.property.walls, point, 10, wallId);

    if (connection.split) {
      const split = connection.split;

      const targetIndex = this.property.walls.findIndex(
        (candidate) => candidate.id === split.wall.id,
      );

      if (targetIndex !== -1) {
        this.property.walls.splice(targetIndex, 1, split.first, split.second);

        // Make the dragged endpoint use the exact
        // split coordinate.
        wall[endpoint] = {
          ...split.point,
        };

        this.remapWallElementsAfterSplit(split.wall, split.first, split.second);
      }
    } else {
      // If we found an existing endpoint, use the
      // exact same coordinate.
      wall[endpoint] = {
        ...connection.point,
      };
    }

    // --------------------------------
    // Remove unnecessary splits
    // --------------------------------

    this.mergeUnnecessaryWallSplits();

    // --------------------------------
    // Rooms
    // --------------------------------

    this.recalculateRooms();
  }
  private remapWallElementsAfterSplit(original: Wall, first: Wall, second: Wall) {
    for (const door of this.property.doors) {
      if (door.wallId !== original.id) {
        continue;
      }

      const wallLength = this.getWallLength(original);

      if (wallLength === 0) {
        continue;
      }

      const distanceAlongWall = door.position * wallLength;

      const firstLength = this.getWallLength(first);

      if (distanceAlongWall <= firstLength) {
        door.wallId = first.id;

        door.position = firstLength === 0 ? 0 : distanceAlongWall / firstLength;
      } else {
        door.wallId = second.id;

        const secondLength = this.getWallLength(second);

        door.position = secondLength === 0 ? 0 : (distanceAlongWall - firstLength) / secondLength;
      }
    }

    for (const window of this.property.windows) {
      if (window.wallId !== original.id) {
        continue;
      }

      const wallLength = this.getWallLength(original);

      if (wallLength === 0) {
        continue;
      }

      const distanceAlongWall = window.position * wallLength;

      const firstLength = this.getWallLength(first);

      if (distanceAlongWall <= firstLength) {
        window.wallId = first.id;

        window.position = firstLength === 0 ? 0 : distanceAlongWall / firstLength;
      } else {
        window.wallId = second.id;

        const secondLength = this.getWallLength(second);

        window.position = secondLength === 0 ? 0 : (distanceAlongWall - firstLength) / secondLength;
      }
    }
  }

  private mergeUnnecessaryWallSplits() {
    let changed = true;

    while (changed) {
      const before = this.property.walls.length;

      const merged = mergeCollinearWalls(this.property.walls, 0.5);

      changed = merged.length !== before;

      if (!changed) {
        break;
      }

      // Figure out which walls disappeared.
      const oldWalls = this.property.walls;

      const oldIds = new Set(oldWalls.map((wall) => wall.id));

      const newIds = new Set(merged.map((wall) => wall.id));

      const removedWalls = oldWalls.filter((wall) => oldIds.has(wall.id) && !newIds.has(wall.id));

      this.property.walls = merged;

      // Elements attached to a removed wall need
      // to be moved onto the merged wall.
      for (const removed of removedWalls) {
        this.remapElementsFromRemovedWall(removed);
      }
    }
  }

  private remapElementsFromRemovedWall(removedWall: Wall) {
    const replacement = this.property.walls.find(
      (wall) => wall.id !== removedWall.id && this.wallTouchesWall(wall, removedWall),
    );

    if (!replacement) {
      return;
    }

    const oldLength = this.getWallLength(removedWall);

    if (oldLength === 0) {
      return;
    }

    for (const door of this.property.doors) {
      if (door.wallId !== removedWall.id) {
        continue;
      }

      const point = this.getPointOnWall(removedWall, door.position);

      door.wallId = replacement.id;

      door.position = this.getPositionOnWall(replacement, point);
    }

    for (const window of this.property.windows) {
      if (window.wallId !== removedWall.id) {
        continue;
      }

      const point = this.getPointOnWall(removedWall, window.position);

      window.wallId = replacement.id;

      window.position = this.getPositionOnWall(replacement, point);
    }
  }

  private getWallLength(wall: Wall): number {
    return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  }

  private getPointOnWall(wall: Wall, position: number): Point {
    return {
      x: wall.start.x + (wall.end.x - wall.start.x) * position,

      y: wall.start.y + (wall.end.y - wall.start.y) * position,
    };
  }

  private getPositionOnWall(wall: Wall, point: Point): number {
    const dx = wall.end.x - wall.start.x;

    const dy = wall.end.y - wall.start.y;

    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(1, ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared),
    );
  }

  private wallTouchesWall(a: Wall, b: Wall): boolean {
    const tolerance = 0.5;

    const points = [a.start, a.end];

    return points.some(
      (point) =>
        Math.hypot(point.x - b.start.x, point.y - b.start.y) <= tolerance ||
        Math.hypot(point.x - b.end.x, point.y - b.end.y) <= tolerance,
    );
  }
  addDevice(device: SmartDevice) {
    this.property.devices.push(device);
  }

  removeDevice(deviceId: string) {
    this.property.devices = this.property.devices.filter((device) => device.id !== deviceId);
  }

  deviceChanged() {
    this.recalculateRooms();
  }
}
