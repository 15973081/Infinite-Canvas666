import { describe, expect, it } from 'vitest';
import { smartCanvasGroupExportItems, smartCanvasWorkflowPayload } from './smart-canvas-workflow-panel';

describe('SmartCanvasWorkflowPanel', () => {
  it('preserves the legacy Smart workflow envelope and clears transient execution state', () => {
    const payload = smartCanvasWorkflowPayload({
      connections: [{ from: 'prompt', to: 'image' }],
      nodes: [{ id: 'image', type: 'smart-image', running: true, pending: 2, queued: true, pendingTasks: [{ taskId: 'task' }], images: [{ url: '/result.png' }] }],
    }, 1234);
    expect(payload).toEqual({
      format: 'infinite-smart-canvas-workflow', version: 1, canvas_type: 'smart', exported_at: 1234,
      connections: [{ from: 'prompt', to: 'image' }],
      nodes: [{ id: 'image', type: 'smart-image', running: false, pending: 0, queued: false, images: [{ url: '/result.png' }] }],
    });
  });

  it('collects unique media and prompt/LLM text for batch result export', () => {
    expect(smartCanvasGroupExportItems([
      { title: 'Group', type: 'smart-image', images: [{ name: 'a.png', url: '/a.png' }, { name: 'again.png', url: '/a.png' }, { kind: 'video', url: '/b.mp4' }] },
      { title: 'Prompt', type: 'prompt', text: 'draw a cat' },
      { title: 'LLM', type: 'prompt', outputText: 'expanded prompt' },
    ])).toEqual([
      { kind: 'image', name: 'a.png', url: '/a.png' },
      { kind: 'video', name: 'Group-3', url: '/b.mp4' },
      { kind: 'text', name: 'Prompt.txt', text: 'draw a cat' },
      { kind: 'text', name: 'LLM.txt', text: 'expanded prompt' },
    ]);
  });
});
