import { Injectable, inject } from '@angular/core';

import { Property } from '../models/property';
import { Wall } from '../models/wall';
import { Door } from '../models/door';
import { Window } from '../models/window';

import { RoomService } from './room';

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
        thickness: 12,
        height: 96,
      },
      {
        id: 'wall-2',
        start: { x: 700, y: 150 },
        end: { x: 700, y: 450 },
        thickness: 12,
        height: 96,
      },
      {
        id: 'wall-3',
        start: { x: 700, y: 450 },
        end: { x: 200, y: 450 },
        thickness: 12,
        height: 96,
      },
      {
        id: 'wall-4',
        start: { x: 200, y: 450 },
        end: { x: 200, y: 150 },
        thickness: 12,
        height: 96,
      },
    ],

    rooms: [],
    doors: [],
    windows: [],
  };

  recalculateRooms() {
    this.property.rooms = this.roomService.findRooms(this.property.walls);
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
}
