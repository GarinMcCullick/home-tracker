import { Injectable } from '@angular/core';

import { Wall } from '../models/wall';
import { Room, Point } from '../models/room';

interface DirectedEdge {
  id: string;
  wallId: string;
  start: Point;
  end: Point;
  angle: number;
}

interface DetectedFace {
  polygon: Point[];
  wallIds: string[];
}

@Injectable({
  providedIn: 'root',
})
export class RoomService {
  private readonly tolerance = 0.5;

  findRooms(walls: Wall[], existingRooms: Room[] = []): Room[] {
    if (walls.length < 3) {
      return [];
    }

    const edges = this.buildDirectedEdges(walls);

    const outgoing = new Map<string, DirectedEdge[]>();

    // Group edges by their starting point
    for (const edge of edges) {
      const key = this.pointKey(edge.start);

      if (!outgoing.has(key)) {
        outgoing.set(key, []);
      }

      outgoing.get(key)!.push(edge);
    }

    // Sort every junction's edges by angle
    for (const edgeList of outgoing.values()) {
      edgeList.sort((a, b) => a.angle - b.angle);
    }

    const visited = new Set<string>();
    const faces: DetectedFace[] = [];

    // Every directed edge can be the beginning of a face
    for (const edge of edges) {
      if (visited.has(edge.id)) {
        continue;
      }

      const face = this.traceFace(edge, outgoing, visited);

      if (!face || face.polygon.length < 3) {
        continue;
      }

      const signedArea = this.calculateSignedArea(face.polygon);

      /*
       * Positive area means the face is traversed
       * counter-clockwise.
       *
       * The outside face is traversed clockwise,
       * so this automatically removes the outside.
       */
      if (signedArea > 0.01) {
        faces.push(face);
      }
    }

    /*
     * Match each detected face to an existing room
     * based on the walls that make up its boundary.
     */
    const usedRoomIds = new Set<string>();

    return faces.map((face) => {
      const area = Math.abs(this.calculateSignedArea(face.polygon));

      const existingRoom = this.findMatchingRoom(face.wallIds, existingRooms, usedRoomIds);

      if (existingRoom) {
        usedRoomIds.add(existingRoom.id);

        return {
          id: existingRoom.id,
          name: existingRoom.name,
          polygon: face.polygon,
          area,
          wallIds: face.wallIds,
        };
      }

      return {
        id: crypto.randomUUID(),
        name: this.getNextRoomName(existingRooms),
        polygon: face.polygon,
        area,
        wallIds: face.wallIds,
      };
    });
  }

  // ==================================================
  // ROOM MATCHING
  // ==================================================

  private findMatchingRoom(
    wallIds: string[],
    existingRooms: Room[],
    usedRoomIds: Set<string>,
  ): Room | undefined {
    let bestMatch: Room | undefined;
    let bestScore = 0;

    const currentWalls = new Set(wallIds);

    for (const room of existingRooms) {
      // Never let one existing room match multiple faces
      if (usedRoomIds.has(room.id)) {
        continue;
      }

      const existingWalls = new Set(room.wallIds);

      let sharedWalls = 0;

      for (const wallId of currentWalls) {
        if (existingWalls.has(wallId)) {
          sharedWalls++;
        }
      }

      /*
       * Score is the percentage of the current room's
       * walls that are shared with the existing room.
       */
      const score = sharedWalls / Math.max(currentWalls.size, existingWalls.size);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = room;
      }
    }

    /*
     * Require at least one shared wall.
     *
     * This prevents completely unrelated rooms from
     * stealing an existing room's ID.
     */
    return bestScore > 0 ? bestMatch : undefined;
  }

  // ==================================================
  // ROOM NAMING
  // ==================================================

  private getNextRoomName(existingRooms: Room[]): string {
    const usedNumbers = new Set<number>();

    for (const room of existingRooms) {
      const match = room.name.match(/^Room (\d+)$/);

      if (match) {
        usedNumbers.add(Number(match[1]));
      }
    }

    let number = 1;

    while (usedNumbers.has(number)) {
      number++;
    }

    return `Room ${number}`;
  }

  // ==================================================
  // BUILD DIRECTED EDGES
  // ==================================================

  private buildDirectedEdges(walls: Wall[]): DirectedEdge[] {
    const edges: DirectedEdge[] = [];

    for (const wall of walls) {
      edges.push({
        id: `${wall.id}:forward`,
        wallId: wall.id,
        start: wall.start,
        end: wall.end,
        angle: Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x),
      });

      edges.push({
        id: `${wall.id}:reverse`,
        wallId: wall.id,
        start: wall.end,
        end: wall.start,
        angle: Math.atan2(wall.start.y - wall.end.y, wall.start.x - wall.end.x),
      });
    }

    return edges;
  }

  // ==================================================
  // TRACE FACE
  // ==================================================

  private traceFace(
    startEdge: DirectedEdge,
    outgoing: Map<string, DirectedEdge[]>,
    visited: Set<string>,
  ): DetectedFace | null {
    const points: Point[] = [];
    const wallIds: string[] = [];

    let current = startEdge;

    const localVisited = new Set<string>();

    while (true) {
      if (localVisited.has(current.id)) {
        return null;
      }

      localVisited.add(current.id);
      visited.add(current.id);

      points.push(current.start);
      wallIds.push(current.wallId);

      const next = this.getNextEdge(current, outgoing);

      if (!next) {
        return null;
      }

      current = next;

      // We returned to the starting directed edge
      if (current.id === startEdge.id) {
        return {
          polygon: points,
          wallIds,
        };
      }

      // Safety protection
      if (localVisited.size > outgoing.size * 2) {
        return null;
      }
    }
  }

  // ==================================================
  // GET NEXT EDGE
  // ==================================================

  private getNextEdge(
    current: DirectedEdge,
    outgoing: Map<string, DirectedEdge[]>,
  ): DirectedEdge | null {
    const vertexKey = this.pointKey(current.end);

    const candidates = outgoing.get(vertexKey);

    if (!candidates || candidates.length === 0) {
      return null;
    }

    /*
     * Find the edge pointing back where we came from.
     */
    const reverseIndex = candidates.findIndex((edge) => this.pointsEqual(edge.end, current.start));

    if (reverseIndex === -1) {
      return null;
    }

    /*
     * Take the edge immediately clockwise from
     * the reverse edge.
     *
     * This keeps the traced face on the left side
     * of the traversal.
     */
    let nextIndex = reverseIndex - 1;

    if (nextIndex < 0) {
      nextIndex = candidates.length - 1;
    }

    return candidates[nextIndex];
  }

  // ==================================================
  // POINT HELPERS
  // ==================================================

  private pointKey(point: Point): string {
    return `${Math.round(point.x)},${Math.round(point.y)}`;
  }

  pointsEqual(a: Point, b: Point): boolean {
    return Math.abs(a.x - b.x) < this.tolerance && Math.abs(a.y - b.y) < this.tolerance;
  }

  // ==================================================
  // AREA
  // ==================================================

  private calculateSignedArea(points: Point[]): number {
    let area = 0;

    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];

      area += current.x * next.y - next.x * current.y;
    }

    return area / 2;
  }

  calculateArea(points: Point[]): number {
    return Math.abs(this.calculateSignedArea(points));
  }
}
