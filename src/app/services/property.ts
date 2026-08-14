import { Injectable, inject } from '@angular/core';
import { Property } from '../models/property';
import { RoomService } from './room';
import { Wall } from '../models/wall';

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
  };
  recalculateRooms() {
    this.property.rooms = this.roomService.findRooms(this.property.walls);
  }

  addWall(wall: Wall) {
    this.property.walls.push(wall);
    this.recalculateRooms();
  }

  removeWall(id: string) {
    this.property.walls = this.property.walls.filter((w) => w.id !== id);
    this.recalculateRooms();
  }

  wallChanged() {
    this.recalculateRooms();
  }
}
