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

@Injectable({
  providedIn: 'root',
})
export class RoomService {
  private readonly tolerance = 0.5;

  findRooms(walls: Wall[]): Room[] {
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
    const faces: Point[][] = [];

    // Every directed edge can be the beginning of a face
    for (const edge of edges) {
      if (visited.has(edge.id)) {
        continue;
      }

      const face = this.traceFace(edge, outgoing, visited);

      if (!face || face.length < 3) {
        continue;
      }

      const signedArea = this.calculateSignedArea(face);

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

    return faces.map((polygon, index) => {
      const area = Math.abs(this.calculateSignedArea(polygon));

      return {
        id: this.getRoomId(polygon),
        name: `Room ${index + 1}`,
        polygon,
        area,
      };
    });
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
  ): Point[] | null {
    const points: Point[] = [];

    let current = startEdge;

    const localVisited = new Set<string>();

    while (true) {
      if (localVisited.has(current.id)) {
        return null;
      }

      localVisited.add(current.id);
      visited.add(current.id);

      points.push(current.start);

      const next = this.getNextEdge(current, outgoing);

      if (!next) {
        return null;
      }

      current = next;

      // We returned to the starting directed edge.
      if (current.id === startEdge.id) {
        return points;
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
  // ROOM ID
  // ==================================================

  getRoomId(points: Point[]): string {
    return points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
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
