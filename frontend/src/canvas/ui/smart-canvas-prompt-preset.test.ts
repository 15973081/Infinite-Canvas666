import { describe, expect, it } from 'vitest';
import { defaultSmartCanvasPromptPresetName, loadSmartCanvasPromptPresets, SMART_CANVAS_PROMPT_PRESET_STORAGE_KEY } from './smart-canvas-prompt-preset';

describe('SmartCanvasPromptPreset', () => {
  it('loads only legacy-compatible preset records', () => {
    const storage = {
      getItem(key: string) {
        expect(key).toBe(SMART_CANVAS_PROMPT_PRESET_STORAGE_KEY);
        return JSON.stringify([
          { id: 'preset-1', name: '保留', text: '提示词', createdAt: 10, updatedAt: 20 },
          { id: '', name: '无 id', text: '忽略' },
          { id: 'preset-2', name: '无文本' },
        ]);
      },
    };
    expect(loadSmartCanvasPromptPresets(storage)).toEqual([
      { id: 'preset-1', name: '保留', text: '提示词', createdAt: 10, updatedAt: 20 },
    ]);
  });

  it('uses the first trimmed line and preserves the legacy 28 character limit', () => {
    expect(defaultSmartCanvasPromptPresetName('  第一行名称  \n第二行')).toBe('第一行名称');
    expect(defaultSmartCanvasPromptPresetName('123456789012345678901234567890')).toBe('1234567890123456789012345678');
    expect(defaultSmartCanvasPromptPresetName('   ')).toBe('提示词预设');
  });

  it('falls back to an empty list for invalid storage data', () => {
    expect(loadSmartCanvasPromptPresets({ getItem: () => '{invalid' })).toEqual([]);
  });
});
