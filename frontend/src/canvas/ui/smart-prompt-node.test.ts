import { describe, expect, it } from 'vitest';
import { smartPromptLlmPayload, smartPromptNodeLayout } from './smart-prompt-node';

describe('SmartPromptNode', () => {
  it('keeps the original collapsed and expanded dimensions', () => {
    expect(smartPromptNodeLayout({ id: 'p', type: 'prompt' })).toEqual({ width: 316, height: 194, instructionHeight: 58 });
    expect(smartPromptNodeLayout({ id: 'p', type: 'prompt', llmEnabled: true })).toMatchObject({ width: 316, height: 292 });
    expect(smartPromptNodeLayout({ id: 'p', type: 'prompt', llmEnabled: true, llmSystemEnabled: true }, 6)).toMatchObject({ width: 316, height: 446 });
  });

  it('builds the legacy canvas LLM request with connected images and videos', () => {
    expect(smartPromptLlmPayload({ id: 'p', type: 'prompt', llmInstruction: 'rewrite', llmProvider: 'modelscope', llmModel: 'qwen', llmSystemEnabled: true, llmSystemPrompt: 'system' }, [
      { url: '/a.png' }, { url: '/b.mp4', kind: 'video' }, { url: '/c.mp3', kind: 'audio' },
    ])).toEqual({ message: 'rewrite', messages: [], images: ['/a.png'], videos: ['/b.mp4'], model: 'qwen', provider: 'modelscope', ms_model: 'qwen', system_prompt: 'system' });
  });
});
