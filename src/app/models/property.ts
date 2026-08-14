import { Wall } from './wall';
import { Room } from './room';

export interface Property {
  id: string;
  name: string;

  width: number;
  height: number;

  walls: Wall[];
  rooms: Room[];
}
