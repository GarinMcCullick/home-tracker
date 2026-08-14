import { Point } from './room';

export interface Wall {
  id: string;
  start: Point;
  end: Point;

  thickness: number;
  height: number;
}
