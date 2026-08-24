import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isSupportedSmartCanvasClipboardFile, SmartCanvasShortcutPanel, smartCanvasShortcutItems } from './smart-canvas-shortcut-panel';

describe('SmartCanvasShortcutPanel', () => {
  it('preserves the complete legacy shortcut help DOM', () => {
    const html = renderToStaticMarkup(createElement(SmartCanvasShortcutPanel, { onClose: () => undefined, onToggleAssets: () => undefined, open: true }));
    expect(smartCanvasShortcutItems).toHaveLength(12);
    expect(html).toContain('id="smartShortcutModal"');
    expect(html).toContain('shortcut-modal open');
    expect(html).toContain('Ctrl</kbd><kbd>Shift</kbd><kbd>G');
    expect(html).toContain('粘贴节点或剪贴板图片');
    expect((html.match(/shortcut-item/g) || [])).toHaveLength(12);
  });

  it('keeps the legacy clipboard media allow-list', () => {
    expect(isSupportedSmartCanvasClipboardFile(new File([], 'image.png'))).toBe(true);
    expect(isSupportedSmartCanvasClipboardFile(new File([], 'clip', { type: 'video/mp4' }))).toBe(true);
    expect(isSupportedSmartCanvasClipboardFile(new File([], 'notes.txt', { type: 'text/plain' }))).toBe(false);
  });
});
