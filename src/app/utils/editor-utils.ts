export type EditorTool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'sensor';

export function getCursorClass(tool: EditorTool): string {
  switch (tool) {
    case 'wall':
      return 'cursor-wall';

    case 'door':
      return 'cursor-door';

    case 'window':
      return 'cursor-window';

    case 'room':
      return 'cursor-room';

    case 'sensor':
      return 'cursor-sensor';

    case 'select':
    default:
      return 'cursor-select';
  }
}
