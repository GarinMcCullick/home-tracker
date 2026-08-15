export interface Room {
  id: string;
  name: string;
  polygon: Point[];
  area: number;
  wallIds: string[];
}

export interface Point {
  x: number;
  y: number;
}
