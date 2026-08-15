import { Injectable } from '@angular/core';

export type EditorTool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'sensor';

export type Point = {
  x: number;
  y: number;
};

@Injectable({
  providedIn: 'root',
})
export class EditorStateService {
  // --------------------------------------------------
  // Tool
  // --------------------------------------------------

  activeTool: EditorTool = 'select';

  // --------------------------------------------------
  // Selection
  // --------------------------------------------------

  selectedWallId: string | null = null;
  selectedRoomId: string | null = null;
  selectedDoorId: string | null = null;
  selectedWindowId: string | null = null;

  // --------------------------------------------------
  // Dragging
  // --------------------------------------------------

  draggingWallId: string | null = null;
  draggingEndpoint: 'start' | 'end' | null = null;

  draggingDoorId: string | null = null;
  draggingWindowId: string | null = null;

  // --------------------------------------------------
  // Viewport
  // --------------------------------------------------

  zoom = 1;
  panX = 0;
  panY = 0;

  isPanning = false;

  panStart: Point = {
    x: 0,
    y: 0,
  };

  panOrigin: Point = {
    x: 0,
    y: 0,
  };

  // --------------------------------------------------
  // Keyboard
  // --------------------------------------------------

  spacePressed = false;
  shiftPressed = false;

  // --------------------------------------------------
  // Drawing
  // --------------------------------------------------

  drawingStart: Point | null = null;
  mousePosition: Point | null = null;
  snapTarget: Point | null = null;

  // --------------------------------------------------
  // Editor settings
  // --------------------------------------------------

  angleSnap = 45;
  snapDistance = 20;
}
