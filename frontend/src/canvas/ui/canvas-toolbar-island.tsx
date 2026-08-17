import { createRoot, type Root } from 'react-dom/client';

type ToolbarCommand = 'open-backups' | 'open-cost' | 'open-log';

const actions: Array<{ command: ToolbarCommand; label: string }> = [
  { command: 'open-cost', label: '费用' },
  { command: 'open-log', label: '日志' },
  { command: 'open-backups', label: '备份' },
];

export function mountCanvasToolbarIsland(
  element: HTMLElement,
  runCommand: (command: ToolbarCommand) => void,
): Root {
  const root = createRoot(element);
  root.render(actions.map(({ command, label }) => (
    <button
      aria-label={label === '日志' ? '生成日志' : label}
      className="tool-btn"
      key={command}
      onClick={() => runCommand(command)}
      type="button"
    >
      <span>{label}</span>
    </button>
  )));
  return root;
}
