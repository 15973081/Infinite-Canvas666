import { describe, expect, it } from 'vitest';
import { smartLoopImagesForRound, smartLoopNodeLayout, smartLoopPromptFields, smartLoopPromptForRound } from './smart-loop-node';

describe('SmartLoopNode', () => {
  it('keeps legacy field fallback and layout dimensions', () => {
    expect(smartLoopPromptFields({ id: 'loop', type: 'loop', variablePrompt: 'one\ntwo' })).toEqual(['one', 'two']);
    expect(smartLoopNodeLayout({ id: 'loop', type: 'loop' })).toEqual({ width: 340, height: 168 });
    expect(smartLoopNodeLayout({ id: 'loop', type: 'loop', imageInput: true, showPrompt: true, variablePrompts: ['a', 'b'] }, 6, 1)).toEqual({ width: 340, height: 630 });
  });

  it('selects round prompts, replaces variables and batches images', () => {
    const node = { id: 'loop', type: 'loop', count: 3, loopStart: 1, showPrompt: true, imageInput: true, imageBatchSize: 2, variablePrompts: ['local 《计数》/《总数》', 'next 《进度》'] };
    expect(smartLoopPromptForRound(node, ['upstream A', 'upstream B'], 2)).toBe('upstream B\n\nnext 2/3');
    expect(smartLoopImagesForRound(node, [{ url: '/1.png' }, { url: '/2.png' }, { url: '/3.png' }], 2).map((item) => item.url)).toEqual(['/2.png', '/3.png']);
  });
});
