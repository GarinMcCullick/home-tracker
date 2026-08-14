import { Component, EventEmitter, Input, Output } from '@angular/core';

export type EditorTool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'sensor';

@Component({
  selector: 'app-editor-toolbar',
  standalone: true,
  templateUrl: './editor-toolbar.html',
  styleUrl: './editor-toolbar.scss',
})
export class EditorToolbar {
  @Input() activeTool: EditorTool = 'select';

  @Input() canDelete = false;

  @Output() toolSelected = new EventEmitter<EditorTool>();

  @Output() deleteClicked = new EventEmitter<void>();

  setTool(tool: EditorTool) {
    this.toolSelected.emit(tool);
  }

  delete() {
    this.deleteClicked.emit();
  }
}
