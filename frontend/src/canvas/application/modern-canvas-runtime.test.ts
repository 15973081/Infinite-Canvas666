import { describe, expect, it } from 'vitest';
import type { CanvasDocument } from '../domain/types';
import { createTaskClient } from '../infrastructure/task-client';
import { createModernCanvasRuntime } from './modern-canvas-runtime';

function document(nodes: CanvasDocument['nodes'], connections: CanvasDocument['connections'] = []): CanvasDocument {
  return { id: 'runtime-test', schemaVersion: 1, nodes, connections };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

describe('modern Canvas runtime', () => {
  it('loads provider/workflow options without the Legacy bridge', async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/config') return json({ api_providers: [{ id: 'provider', name: 'Provider', image_models: ['image-v1'] }] });
      if (path === '/api/workflows') return json({ workflows: [{ name: 'custom.json', title: 'Custom' }] });
      if (path.endsWith('custom.json')) return json({ config: { fields: [{ id: 'prompt', type: 'prompt', node: '1', input: 'text' }] } });
      throw new Error(`unexpected ${path}`);
    };
    const runtime = createModernCanvasRuntime(createTaskClient(fetcher), fetcher);

    await runtime.initialize();

    expect(runtime.getNodeOptions('generator', 'provider')).toEqual([{ value: 'provider', label: 'Provider' }]);
    expect(runtime.getNodeOptions('generator', 'model', { id: 'g', type: 'generator', apiProvider: 'provider' })).toEqual([{ value: 'image-v1', label: 'image-v1' }]);
    expect(runtime.getNodeOptions('comfy', 'workflow')).toEqual([{ value: 'custom.json', label: 'Custom' }]);
    expect(await runtime.getComfyFields('custom.json')).toHaveLength(1);
  });

  it('runs image tasks with persisted pending state and projects outputs', async () => {
    const calls: string[] = [];
    let submitted: Record<string, unknown> = {};
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      calls.push(`${init?.method || 'GET'} ${path}`);
      if (path === '/api/config') return json({});
      if (path === '/api/workflows') return json({ workflows: [] });
      if (path === '/api/canvas-image-tasks') { submitted = JSON.parse(String(init?.body)); return json({ task_id: 'image-task', status: 'queued' }); }
      if (path === '/api/canvas-image-tasks/image-task') return json({ task_id: 'image-task', status: 'succeeded', result: { images: ['/output/generated.png'] } });
      throw new Error(`unexpected ${path}`);
    };
    const runtime = createModernCanvasRuntime(createTaskClient(fetcher), fetcher);
    await runtime.initialize();
    const updates: CanvasDocument[] = [];

    const result = await runtime.runNode('generator', document([
      { id: 'prompt', type: 'prompt', text: 'draw a cat' },
      { id: 'generator', type: 'generator', apiProvider: 'provider', count: 3, model: 'image-v1' },
    ], [{ from: 'prompt', to: 'generator' }]), 'node', (next) => { updates.push(next); });

    expect(calls).toContain('POST /api/canvas-image-tasks');
    expect(submitted).toMatchObject({ n: 3, prompt: 'draw a cat' });
    expect(updates.some((item) => item.nodes.some((node) => node.type === 'output' && Array.isArray(node._pending) && node._pending.length === 1))).toBe(true);
    expect(result.nodes.find((node) => node.id === 'generator')).toMatchObject({ runStatus: 'done', generatedOutputs: ['/output/generated.png'] });
    expect(result.nodes.find((node) => node.type === 'output')?.images).toMatchObject([{ url: '/output/generated.png', kind: 'image' }]);
  });

  it('builds the production LTX relay payload without the legacy timeline script', async () => {
    let submitted: Record<string, any> = {};
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/config') return json({});
      if (path === '/api/workflows') return json({ workflows: [] });
      if (path === '/api/generate') { submitted = JSON.parse(String(init?.body)); return json({ videos: ['/output/ltx.mp4'] }); }
      throw new Error(`unexpected ${path}`);
    };
    const runtime = createModernCanvasRuntime(createTaskClient(fetcher), fetcher);
    await runtime.initialize();
    const timeline = JSON.stringify({ segments: [
      { id: 'a', type: 'text', start: 0, length: 24, prompt: 'first' },
      { id: 'b', type: 'text', start: 36, length: 12, prompt: 'second' },
    ], audioSegments: [] });

    const result = await runtime.runNode('ltx', document([{ id: 'ltx', type: 'ltxDirector', durationFrames: 48, frameRate: 24, globalPrompt: 'global', ltxTimelineData: timeline }]));

    expect(submitted.params['46']).toMatchObject({ duration_frames: 48, frame_rate: 24, local_prompts: 'first | second', segment_lengths: '36,12', timeline_data: expect.any(String) });
    expect(result.nodes.find((node) => node.id === 'ltx')).toMatchObject({ generatedOutputs: [{ kind: 'video', url: '/output/ltx.mp4' }], ltxLocalPrompts: 'first | second' });
  });

  it('runs LLM chat and preserves the conversation in the document', async () => {
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/config') return json({});
      if (path === '/api/workflows') return json({ workflows: [] });
      if (path === '/api/canvas-llm') {
        expect(JSON.parse(String(init?.body))).toMatchObject({ message: 'hello', messages: [] });
        return json({ text: 'world' });
      }
      throw new Error(`unexpected ${path}`);
    };
    const runtime = createModernCanvasRuntime(createTaskClient(fetcher), fetcher);
    await runtime.initialize();

    const result = await runtime.runNode('llm', document([{ id: 'llm', type: 'llm', mode: 'chat', chatInput: 'hello', messages: [] }]), 'chat');

    expect(result.nodes[0]).toMatchObject({ outputText: 'world', chatInput: '', runStatus: 'done' });
    expect(result.nodes[0].messages).toEqual([{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'world' }]);
  });

  it('normalizes LTX and prepares manual/cloud video inputs in TypeScript', async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/config') return json({});
      if (path === '/api/workflows') return json({ workflows: [] });
      if (path === '/api/cloud-video/upload') return json({ url: 'https://cloud.example/video.mp4' });
      throw new Error(`unexpected ${path}`);
    };
    const runtime = createModernCanvasRuntime(createTaskClient(fetcher), fetcher);
    await runtime.initialize();
    const normalized = runtime.normalizeLtxNode({ id: 'ltx', type: 'ltxDirector', durationFrames: 48, frameRate: 24 });
    expect(normalized).toMatchObject({ durationSeconds: 2, durationFrames: 48 });
    expect(JSON.parse(String(normalized.ltxTimelineData)).segments).toHaveLength(1);

    const source = document([
      { id: 'media', type: 'image', mediaKind: 'video', url: '/local/video.mp4' },
      { id: 'video', type: 'video' },
    ], [{ from: 'media', to: 'video' }]);
    const manual = await runtime.prepareVideoMedia('video', source, 'manual', 'https://manual.example/video.mp4');
    expect(manual.nodes[1].manualVideoUrl).toBe('https://manual.example/video.mp4');
    const cloud = await runtime.prepareVideoMedia('video', source, 'cloud');
    expect(cloud.nodes[1].uploadedMediaUrls).toEqual({ '/local/video.mp4': 'https://cloud.example/video.mp4' });
  });

  it('recovers persisted pending tasks after refresh without resubmitting them', async () => {
    let submissions = 0;
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/config') return json({});
      if (path === '/api/workflows') return json({ workflows: [] });
      if (path === '/api/canvas-image-tasks/recovered-task') return json({ id: 'recovered-task', status: 'succeeded', recovered_after_restart: true, result: { images: ['/output/recovered.png'] } });
      if (path === '/api/canvas-image-tasks' && init?.method === 'POST') { submissions += 1; return json({}); }
      throw new Error(`unexpected ${path}`);
    };
    const runtime = createModernCanvasRuntime(createTaskClient(fetcher), fetcher);
    await runtime.initialize();
    const source = document([
      { id: 'generator', type: 'generator', runStatus: 'running' },
      { id: 'output', type: 'output', images: [], _pending: [{ id: 'pending', nodeId: 'generator', canvasTaskId: 'recovered-task', canvasTaskType: 'image' }] },
    ]);

    const recovered = await runtime.recoverDocument(source);

    expect(submissions).toBe(0);
    expect(recovered.nodes[0]).toMatchObject({ runStatus: 'done', generatedOutputs: ['/output/recovered.png'] });
    expect(recovered.nodes[1]).toMatchObject({ _pending: [], images: [{ url: '/output/recovered.png', kind: 'image' }] });
  });
});
