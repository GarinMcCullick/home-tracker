export interface Door {
  id: string;
  wallId: string;
  position: number;
  width: number;
  swing: 'left' | 'right';
  open: boolean;
}
