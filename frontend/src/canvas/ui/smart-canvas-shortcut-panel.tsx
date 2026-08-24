import { useEffect } from 'react';

export const smartCanvasShortcutItems = [
  { keys: ['Ctrl'], text: '按住并拖拽框选节点' },
  { keys: ['Ctrl', 'G'], text: '合并选中的图片为组' },
  { keys: ['Ctrl', 'Shift', 'G'], text: '释放选中的分组' },
  { keys: ['Ctrl', 'Z'], text: '撤销上一步操作' },
  { keys: ['Ctrl', 'C'], text: '复制选中的节点' },
  { keys: ['Ctrl', 'V'], text: '粘贴节点或剪贴板图片' },
  { keys: ['A'], text: '打开/关闭资源库' },
  { keys: ['Z'], text: '缩小画布视图' },
  { keys: ['双击'], text: '打开快捷菜单' },
  { keys: ['空白处'], text: '拖动画布' },
  { keys: ['滚轮'], text: '缩放画布或预览图片' },
  { keys: ['Del'], text: '删除选中节点' },
] as const;

export function isSmartCanvasEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : document.activeElement;
  return Boolean(element?.closest('input, textarea, select, option, [contenteditable="true"], .prompt-node-control, .prompt-input'));
}

export function isSupportedSmartCanvasClipboardFile(file: File): boolean {
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')
    || /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(name);
}

export function SmartCanvasShortcutPanel({ onClose, onToggleAssets, open }: { onClose(): void; onToggleAssets(): void; open: boolean }) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (String(event.key || '').toLowerCase() !== 'a' || event.ctrlKey || event.metaKey || event.altKey || event.repeat || isSmartCanvasEditableTarget(event.target)) return;
      event.preventDefault();
      onToggleAssets();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onClose, onToggleAssets]);

  return <div className={`shortcut-modal ${open ? 'open' : ''}`} id="smartShortcutModal" onClick={onClose}>
    <div className="shortcut-panel" onClick={(event) => event.stopPropagation()}>
      <div className="shortcut-head">
        <div className="shortcut-title"><i data-lucide="keyboard" /><span>快捷键</span></div>
        <button className="preview-icon-btn" onClick={onClose} title="关闭" type="button"><i className="w-4 h-4" data-lucide="x" /></button>
      </div>
      <div className="shortcut-list">
        {smartCanvasShortcutItems.map((item) => <div className="shortcut-item" key={item.text}>
          <span className="shortcut-keys">{item.keys.map((key) => <kbd key={key}>{key}</kbd>)}</span><span>{item.text}</span>
        </div>)}
      </div>
    </div>
  </div>;
}
