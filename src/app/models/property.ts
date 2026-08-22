import { Wall } from './wall';
import { Room } from './room';
import { Door } from './door';
import { Window } from './window';
import { SmartDevice } from './smart-device';

export interface Property {
  id: string;
  name: string;

  width: number;
  height: number;

  walls: Wall[];
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  devices: SmartDevice[];
}
