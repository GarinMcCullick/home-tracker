import { Injectable } from '@angular/core';
import { PropertyService } from './property';

@Injectable({
  providedIn: 'root',
})
export class WallEditorService {
  constructor(private propertyService: PropertyService) {}

  get walls() {
    return this.propertyService.property.walls;
  }

  deleteWall(wallId: string) {
    this.propertyService.removeWall(wallId);
  }

  addWall(wall: any) {
    this.propertyService.addWall(wall);
  }

  findWall(wallId: string) {
    return this.walls.find((wall) => wall.id === wallId);
  }

  updateWallEndpoint(wallId: string, endpoint: 'start' | 'end', point: { x: number; y: number }) {
    const wall = this.findWall(wallId);

    if (!wall) {
      return;
    }

    wall[endpoint] = {
      x: point.x,
      y: point.y,
    };
  }

  wallChanged() {
    this.propertyService.wallChanged();
  }
}
