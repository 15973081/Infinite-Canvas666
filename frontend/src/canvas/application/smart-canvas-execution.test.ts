import { describe, expect, it, vi } from 'vitest';
import type { CanvasDocument } from '../domain/types';
import type { TaskClient } from '../infrastructure/task-client';
import { createSmartCanvasExecution } from './smart-canvas-execution';

function document(nodes: CanvasDocument['nodes'], connections: CanvasDocument['connections'] = []): CanvasDocument {
  return { id: 'smart-execution', kind: 'smart', schemaVersion: 1, nodes, connections };
}

function taskClient(overrides: Partial<TaskClient> = {}): TaskClient {
  return {
    cancel: vi.fn(() => true),
    get: vi.fn(),
    getDiagnostics: vi.fn(() => ({ activeSubmissions: 0, activeWatches: 0, cancelledWatches: 0, deduplicatedSubmissions: 0, deduplicatedWatches: 0, pollErrors: 0, polls: 0, recoveredTasks: 0, resumeRequests: 0, resumedTasks: 0, submissions: 0, submissionRetries: 0 })),
    resume: vi.fn(),
    submit: vi.fn(),
    wait: vi.fn(async (_kind, id) => ({ status: 'succeeded', result: { images: [`/${id}.png`] } })),
    waitForResult: vi.fn(),
    watch: vi.fn(async (_kind, id) => ({ status: 'succeeded', result: { images: [`/${id}.png`] } })),
    ...overrides,
  } as TaskClient;
}

function execution(fetcher: typeof fetch, tasks = taskClient(), config: { api_providers?: Array<Record<string, unknown>> } = {}) {
  return createSmartCanvasExecution({ fetcher, taskClient: tasks, getConfig: () => config, getWorkflow: async () => ({ config: { fields: [] } }) });
}

describe('SmartCanvasExecution payload parity', () => {
  it('submits one legacy canvas image task per requested API image', async () => {
    const payloads: unknown[] = [];
    let index = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/canvas-image-tasks');
      payloads.push(JSON.parse(String(init?.body)));
      return Response.json({ status: 'queued', task_id: `task-${++index}` });
    }) as typeof fetch;
    const result = await execution(fetcher).runNode('image', document([{ id: 'image', type: 'smart-image', runPrompt: 'draw a cat', runSettings: { engine: 'api', apiKind: 'image', apiProvider: 'provider-a', model: 'image-a', ratio: 'wide', resolution: '2k', quality: 'hd', count: 2 } }]));
    expect(payloads).toEqual([
      { prompt: 'draw a cat', provider_id: 'provider-a', model: 'image-a', size: '2048x1152', quality: 'hd', n: 1, reference_images: [] },
      { prompt: 'draw a cat', provider_id: 'provider-a', model: 'image-a', size: '2048x1152', quality: 'hd', n: 1, reference_images: [] },
    ]);
    expect(result.nodes.find((node) => node.id === 'image')).toMatchObject({ pending: 0, runStatus: 'done', type: 'smart-image', images: [{ url: '/task-1.png' }, { url: '/task-2.png' }] });
    expect(result.nodes.some((node) => node.type === 'output')).toBe(false);
  });

  it('keeps the legacy volcanic video payload including trusted assets', async () => {
    let payload: Record<string, unknown> = {};
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/canvas-video');
      payload = JSON.parse(String(init?.body));
      return Response.json({ videos: ['/movie.mp4'] });
    }) as typeof fetch;
    const source = document([
      { id: 'ref', type: 'smart-image', images: [{ url: '/face.png', name: 'face', asset_uris: { volcengine: 'asset://face-id' } }] },
      { id: 'video', type: 'smart-image', runPrompt: 'move', runSettings: { engine: 'volcengine', apiKind: 'video', apiProvider: 'volcengine', model: 'seedance-2-5-pro', duration: -1, aspectRatio: '16:9', resolution: '1080p', videoGenerateAudio: true, videoTaskMode: 'edit' } },
    ], [{ from: 'ref', to: 'video' }]);
    const result = await execution(fetcher, taskClient(), { api_providers: [{ id: 'volcengine', protocol: 'volcengine' }] }).runNode('video', source);
    expect(payload).toEqual({
      prompt: 'move', provider_id: 'volcengine', model: 'seedance-2-5-pro', duration: -1, aspect_ratio: '16:9', resolution: '1080p',
      images: [{ url: 'asset://face-id', name: 'face' }], videos: [], audios: [], enhance_prompt: false, enable_upsample: false,
      watermark: false, camerafixed: false, generate_audio: true, multimodal: false, trusted_asset: true, task_mode: 'edit',
    });
    expect(result.nodes.find((node) => node.id === 'video')?.images).toEqual([{ kind: 'video', name: 'output-1', url: '/movie.mp4' }]);
  });

  it('uses the original ModelScope and ComfyUI endpoints and bodies', async () => {
    const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      requests.push({ path, body: JSON.parse(String(init?.body)) });
      return path === '/generate' ? Response.json({ url: '/modelscope.png' }) : Response.json({ outputs: ['/comfy.png'] });
    }) as typeof fetch;
    const runtime = execution(fetcher);
    await runtime.runNode('ms', document([{ id: 'ms', type: 'smart-image', runPrompt: 'landscape', runSettings: { engine: 'modelscope', msgenModel: 'zimage', msRatio: 'portrait', msResolution: '1k', count: 1 } }]));
    await runtime.runNode('comfy', document([{ id: 'comfy', type: 'smart-image', runPrompt: 'portrait', runSettings: { engine: 'comfy', comfyMode: 'text', width: 768, height: 1024 } }]));
    expect(requests).toEqual([
      { path: '/generate', body: { prompt: 'landscape', resolution: '1024x1536' } },
      { path: '/api/generate', body: { prompt: 'portrait', width: 768, height: 1024, workflow_json: 'Z-Image.json', type: 'zimage' } },
    ]);
  });

  it('runs smart prompt LLM through the centralized execution payload', async () => {
    let payload: unknown;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body));
      return Response.json({ text: 'rewritten prompt' });
    }) as typeof fetch;
    const source = document([
      { id: 'media', type: 'smart-image', images: [{ url: '/image.png' }, { kind: 'video', url: '/video.mp4' }] },
      { id: 'prompt', type: 'prompt', llmEnabled: true, llmInstruction: 'rewrite this', llmProvider: 'modelscope', llmModel: 'Qwen', llmSystemEnabled: true, llmSystemPrompt: 'system' },
    ], [{ from: 'media', to: 'prompt' }]);
    const result = await execution(fetcher).runNode('prompt', source);
    expect(payload).toEqual({ message: 'rewrite this', messages: [], images: ['/image.png'], videos: ['/video.mp4'], model: 'Qwen', provider: 'modelscope', ms_model: 'Qwen', system_prompt: 'system' });
    expect(result.nodes.find((node) => node.id === 'prompt')).toMatchObject({ text: 'rewritten prompt', runStatus: 'done', running: false });
  });
});

describe('SmartCanvasExecution state orchestration', () => {
  it('runs loop cascade rounds while keeping results in smart-image nodes', async () => {
    const prompts: string[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      prompts.push(body.prompt);
      return Response.json({ outputs: [`/${prompts.length}.png`] });
    }) as typeof fetch;
    const source = document([
      { id: 'loop', type: 'loop', count: 2, loopStart: 1, mode: 'serial', showPrompt: true, variablePrompts: ['round 《计数》', 'round 《计数》'] },
      { id: 'target', type: 'smart-image', images: [], runSettings: { engine: 'comfy', comfyMode: 'text' } },
    ], [{ from: 'loop', to: 'target' }]);
    const result = await execution(fetcher).runNode('loop', source, 'cascade');
    expect(prompts).toEqual(['round 1', 'round 2']);
    expect(result.nodes.find((node) => node.id === 'loop')).toMatchObject({ running: false, runStatus: 'done' });
    expect(result.nodes.find((node) => node.id === 'target')).toMatchObject({ type: 'smart-image', images: [{ url: '/1.png' }, { url: '/2.png' }] });
  });

  it('keeps each parallel loop round prompt isolated while requests overlap', async () => {
    const prompts: string[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const prompt = String(JSON.parse(String(init?.body)).prompt);
      prompts.push(prompt);
      await new Promise((resolve) => setTimeout(resolve, prompt === 'parallel 1' ? 10 : 1));
      return Response.json({ outputs: [`/${prompt.replace(' ', '-')}.png`] });
    }) as typeof fetch;
    const source = document([
      { id: 'loop', type: 'loop', count: 2, loopStart: 1, mode: 'parallel', variablePrompts: ['parallel 《计数》', 'parallel 《计数》'] },
      { id: 'target', type: 'smart-image', images: [], runSettings: { engine: 'comfy', comfyMode: 'text' } },
    ], [{ from: 'loop', to: 'target' }]);
    const result = await execution(fetcher).runNode('loop', source, 'cascade');
    expect(prompts).toEqual(['parallel 1', 'parallel 2']);
    expect(result.nodes.find((node) => node.id === 'target')?.images).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: '/parallel-1.png' }),
      expect.objectContaining({ url: '/parallel-2.png' }),
    ]));
  });

  it('stops active execution and restores persisted image tasks', async () => {
    const waitingFetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })) as typeof fetch;
    const source = document([{ id: 'video', type: 'smart-image', runPrompt: 'move', runSettings: { engine: 'api', apiKind: 'video', apiProvider: 'p', model: 'v' } }]);
    const runtime = execution(waitingFetcher);
    const running = runtime.runNode('video', source);
    await vi.waitFor(() => expect(waitingFetcher).toHaveBeenCalled());
    const stopped = await runtime.runCommand('stop-execution', 'video', source);
    await expect(running).rejects.toThrow();
    expect(stopped.nodes[0]).toMatchObject({ running: false, runStatus: 'stopped' });

    const recovery = document([{ id: 'pending', type: 'smart-image', pending: 1, pendingTasks: [{ taskId: 'recover-me', kind: 'image' }], images: [] }]);
    const recovered = await execution(vi.fn() as typeof fetch).recoverDocument(recovery);
    expect(recovered.nodes[0]).toMatchObject({ pending: 0, runStatus: 'done', images: [{ url: '/recover-me.png' }] });
  });
});
