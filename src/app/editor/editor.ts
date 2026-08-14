import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { EditorToolbar, EditorTool } from './components/editor-toolbar/editor-toolbar';

import { FloorPlan } from './components/floor-plan/floor-plan';

import { WallEditorService } from '../services/wall-editor';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, EditorToolbar, FloorPlan],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor {
  activeTool: EditorTool = 'select';

  selectedWallId: string | null = null;

  constructor(private wallEditorService: WallEditorService) {}

  setTool(tool: EditorTool) {
    this.activeTool = tool;
  }

  onWallSelected(wallId: string | null) {
    this.selectedWallId = wallId;
  }

  deleteSelected() {
    if (!this.selectedWallId) {
      return;
    }

    this.wallEditorService.deleteWall(this.selectedWallId);

    this.selectedWallId = null;
  }

  get canDelete(): boolean {
    return this.selectedWallId !== null;
  }
}
