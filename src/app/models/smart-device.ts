import { Point } from '../services/editor-state';

export type SmartDeviceType =
  | 'mmwave'
  | 'camera'
  | 'motion'
  | 'presence'
  | 'light'
  | 'switch'
  | 'thermostat'
  | 'speaker'
  | 'sensor'
  | 'other';

export interface SmartDevice {
  id: string;

  type: SmartDeviceType;

  name: string;

  position: Point;

  rotation: number;

  /**
   * Optional Home Assistant entity this physical device
   * is associated with.
   */
  entityId?: string;

  enabled: boolean;
  color?: string;
}
