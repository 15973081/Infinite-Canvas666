import { describe, expect, it } from 'vitest';
import { smartComposerWorkflow } from './composer';

describe('smartComposerWorkflow', () => {
  it('builds a reusable prompt, generator and output chain', () => {
    const workflow = smartComposerWorkflow('a glass city', {
      comfyWorkflow: '', count: 2, duration: 5, engine: 'generator', model: 'image-v1', msCustomModel: '',
      msgenModel: 'zimage', provider: 'provider', ratio: 'wide', resolution: '2k',
    });

    expect(workflow.connections).toEqual([
      { from: 'smart_prompt', to: 'smart_generator' },
      { from: 'smart_generator', to: 'smart_output' },
    ]);
    expect(workflow.nodes[0]).toMatchObject({ type: 'prompt', text: 'a glass city' });
    expect(workflow.nodes[1]).toMatchObject({
      type: 'generator', apiProvider: 'provider', model: 'image-v1', ratio: 'wide', resolution: '2k', count: 2,
    });
    expect(workflow.nodes[2]).toMatchObject({ type: 'output', images: [] });
  });

  it('maps video and Comfy composer settings to V2 node fields', () => {
    const common = { count: 1, msCustomModel: '', msgenModel: 'zimage', provider: 'video-provider', ratio: 'story', resolution: '1k' };
    expect(smartComposerWorkflow('motion', { ...common, comfyWorkflow: '', duration: 8, engine: 'video', model: 'video-v1' }).nodes[1]).toMatchObject({
      type: 'video', apiProvider: 'video-provider', model: 'video-v1', duration: 8, aspectRatio: '9:16',
    });
    expect(smartComposerWorkflow('render', { ...common, comfyWorkflow: 'custom.json', duration: 5, engine: 'comfy', model: '' }).nodes[1]).toMatchObject({
      type: 'comfy', mode: 'custom', comfyWorkflow: 'custom.json', width: 1024, height: 1024,
    });
  });
});
