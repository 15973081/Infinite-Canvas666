import { describe, expect, it } from 'vitest';
import { smartCanvasPromptTemplateMatches, smartCanvasPromptTemplateText } from './smart-canvas-prompt-template';

const template = {
  builtin: true,
  category: 'view',
  id: 'template-1',
  name: '低机位镜头',
  negative: '模糊',
  params: { ratio: '16:9', quality: 'high' },
  positive: '电影感低机位',
  scene: '建筑外景',
};

describe('SmartCanvasPromptTemplate', () => {
  it('searches the same name, scene, positive and negative fields as the legacy library', () => {
    expect(smartCanvasPromptTemplateMatches(template, '低机位')).toBe(true);
    expect(smartCanvasPromptTemplateMatches(template, '建筑')).toBe(true);
    expect(smartCanvasPromptTemplateMatches(template, '模糊')).toBe(true);
    expect(smartCanvasPromptTemplateMatches(template, '人像')).toBe(false);
  });

  it('builds full builtin text with negative prompt and parameter sections', () => {
    expect(smartCanvasPromptTemplateText(template, 'positive')).toBe('电影感低机位');
    expect(smartCanvasPromptTemplateText(template, 'full')).toBe('电影感低机位\n\nNegative prompt:\n模糊\n\nParams:\nratio: 16:9\nquality: high');
  });

  it('keeps custom library application positive-only', () => {
    expect(smartCanvasPromptTemplateText({ ...template, builtin: false }, 'full')).toBe('电影感低机位');
  });
});
