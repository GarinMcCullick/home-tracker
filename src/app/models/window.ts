export interface Window {
  id: string;

  wallId: string;

  // 0 → 1 position along the wall
  position: number;

  width: number;

  // Distance from floor
  height: number;
}
