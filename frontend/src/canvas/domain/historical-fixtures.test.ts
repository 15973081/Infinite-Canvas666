import { describe, expect, it } from 'vitest';
import { decodeCanvasDocument, encodeCanvasDocument } from './document-codec';
import { createDocumentStore } from '../stores/document-store';

const historicalCanvas = {
  id: 'historical-production-canvas',
  schemaVersion: 1,
  title: 'legacy fixture',
  futureTopLevel: { retained: true },
  updated_at: 17,
  nodes: [
    { id: 'prompt', type: 'prompt', text: 'cinematic city', legacyPromptFlag: 'keep' },
    { id: 'image', type: 'image', url: '/uploads/reference.png', mediaKind: 'image', asset_uri: 'asset://reference', originalLocalUrl: '/uploads/original.png' },
    { id: 'generator', type: 'generator', apiProvider: 'volcengine', model: 'image-model', ratio: 'custom', resolution: 'custom', customRatio: '4:5', customWidth: 1024, customHeight: 1280, quality: 'high', count: 2, futureGeneratorField: 9 },
    { id: 'msgen', type: 'msgen', msgenModel: 'custom', msCustomModel: 'custom/model', msResolution: 'custom', msCustomWidth: 768, msCustomHeight: 1024, msLoraEnabled: true, msLoraId: 'portrait-lora', msLoraStrength: 0.65 },
    { id: 'video', type: 'video', taskMode: 'extend_forward', manualVideoUrls: ['https://cdn.example/video.mp4'], tempShLinks: [{ source: '/uploads/local.mp4', url: 'https://temp.example/video.mp4' }], pendingTaskId: 'video-task-1' },
    { id: 'comfy', type: 'comfy', mode: 'custom', comfyWorkflow: 'workflow.json', comfyParams: { seed: 123, sampler: 'euler' }, comfyRandomActive: { seed: false } },
    { id: 'llm', type: 'llm', mode: 'chat', messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'world' }], outputText: 'world', visionState: { images: 1 } },
    { id: 'ltx', type: 'ltxDirector', durationFrames: 240, frameRate: 24, useCustomAudio: true, ltxTimelineData: JSON.stringify({ segments: [{ id: 's1', type: 'image', start: 0, length: 120, imageRef: { url: '/frame.png' } }], audioSegments: [{ id: 'a1', start: 0, length: 240, url: '/audio.wav' }] }) },
    { id: 'output', type: 'output', images: [{ url: '/output/result.png', run: { taskId: 'task-1' }, futureOutputField: true }], imageComparisons: { '/output/result.png': { url: '/uploads/reference.png' } }, _pending: [{ id: 'pending-1', taskId: 'task-2', startedAt: 1 }] },
    { id: 'plugin-node', type: 'third-party-node', extensionPayload: { version: 3 } },
  ],
  connections: [
    { from: 'prompt', to: 'generator', futureEdgeField: 'keep' },
    { from: 'image', to: 'generator' },
    { from: 'generator', to: 'output' },
  ],
};

describe('historical canvas fixtures', () => {
  it('round-trips every known and unknown production field without loss', () => {
    const decoded = decodeCanvasDocument(historicalCanvas);
    const encoded = encodeCanvasDocument(decoded);
    expect(encoded).toEqual(historicalCanvas);
  });

  it('preserves pending tasks, extension nodes and media metadata after a V2 edit', () => {
    const store = createDocumentStore(historicalCanvas);
    store.getState().updateNode('generator', { quality: 'medium' });
    const document = store.getState().document!;
    expect(document.futureTopLevel).toEqual({ retained: true });
    expect(document.connections[0]).toMatchObject({ futureEdgeField: 'keep' });
    expect(document.nodes.find((node) => node.id === 'plugin-node')).toMatchObject({ extensionPayload: { version: 3 } });
    expect(document.nodes.find((node) => node.id === 'output')).toMatchObject({
      _pending: [{ id: 'pending-1', taskId: 'task-2', startedAt: 1 }],
      imageComparisons: { '/output/result.png': { url: '/uploads/reference.png' } },
    });
    expect(document.nodes.find((node) => node.id === 'generator')).toMatchObject({ quality: 'medium', futureGeneratorField: 9 });
  });
});
