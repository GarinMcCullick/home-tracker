export interface Room {
  id: string;
  name: string;
  polygon: Point[];
  area: number;
}

export interface Point {
  x: number;
  y: number;
}
