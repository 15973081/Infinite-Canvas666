import { createGraphModel } from '../domain/graph';
import type { CanvasDocument, CanvasNode } from '../domain/types';
import { requestJson, type Fetcher } from '../infrastructure/http';
import type { TaskClient } from '../infrastructure/task-client';
import { createSmartCanvasExecution } from './smart-canvas-execution';

export type RuntimeMode = 'cascade' | 'chat' | 'node';
export type RuntimeCommand = 'retry-execution' | 'stop-execution';
export type RuntimeUpdate = (document: CanvasDocument) => void | Promise<void>;

export interface RuntimeOption {
  label: string;
  meta?: Record<string, unknown>;
  value: string;
}

export interface CanvasRuntime {
  getComfyFields(workflow: string): Promise<Array<Record<string, unknown>>>;
  getNodeOptions(type: string, field: string, node?: CanvasNode): RuntimeOption[];
  initialize(): Promise<void>;
  normalizeLtxNode(node: CanvasNode): CanvasNode;
  prepareVideoMedia(nodeId: string, document: CanvasDocument, action: 'cloud' | 'manual', value?: string): Promise<CanvasDocument>;
  recoverDocument(document: CanvasDocument, onUpdate?: RuntimeUpdate): Promise<CanvasDocument>;
  runCommand(command: RuntimeCommand, nodeId: string, document: CanvasDocument, onUpdate?: RuntimeUpdate): Promise<CanvasDocument>;
  runNode(nodeId: string, document: CanvasDocument, mode?: RuntimeMode, onUpdate?: RuntimeUpdate): Promise<CanvasDocument>;
  uploadMedia(files: File[]): Promise<{ files: Array<{ kind?: string; name?: string; url?: string }> }>;
}

interface ProviderConfig extends Record<string, unknown> {
  chat_models?: string[];
  enabled?: boolean;
  id?: string;
  image_models?: string[];
  ms_loras?: Array<{ id?: string; model?: string; model_id?: string; name?: string; strength?: number }>;
  name?: string;
  video_models?: string[];
}

interface RuntimeConfig {
  api_providers?: ProviderConfig[];
  chat_models?: string[];
  image_models?: string[];
  ms_chat_models?: string[];
  video_models?: string[];
}

interface WorkflowRecord extends Record<string, unknown> {
  config?: { fields?: Array<Record<string, unknown>> };
  name?: string;
  title?: string;
}

const RUN_TYPES = new Set(['generator', 'msgen', 'comfy', 'ltxDirector', 'llm', 'video']);
const MEDIA_TYPES = new Set(['generator', 'msgen', 'comfy', 'ltxDirector', 'video']);

export function createModernCanvasRuntime(taskClient: TaskClient, fetcher: Fetcher = fetch): CanvasRuntime {
  let config: RuntimeConfig = {};
  let workflows: WorkflowRecord[] = [];
  const workflowDetails = new Map<string, WorkflowRecord>();
  const controllers = new Map<string, AbortController>();
  const taskEvidence = new Map<string, Record<string, unknown>>();

  const initialize = async () => {
    const [nextConfig, workflowEnvelope] = await Promise.all([
      safeRequest<RuntimeConfig>(fetcher, '/api/config', {}),
      safeRequest<{ workflows?: WorkflowRecord[] }>(fetcher, '/api/workflows', { workflows: [] }),
    ]);
    config = nextConfig;
    workflows = Array.isArray(workflowEnvelope.workflows) ? workflowEnvelope.workflows : [];
  };

  const getComfyFields = async (workflow: string) => {
    const name = String(workflow || '').trim();
    if (!name) return [];
    let detail = workflowDetails.get(name);
    if (!detail) {
      detail = await requestJson<WorkflowRecord>(fetcher, `/api/workflows/${encodeURIComponent(name)}`);
      workflowDetails.set(name, detail);
    }
    return structuredClone(detail.config?.fields ?? []);
  };

  const getNodeOptions: CanvasRuntime['getNodeOptions'] = (type, field, node = { id: '', type }) => {
    if (type === 'comfy' && field === 'workflow') {
      return workflows.map((item) => ({ value: String(item.name || ''), label: String(item.title || item.name || '') }));
    }
    if (type === 'msgen' && field === 'model') {
      return [
        { value: 'zimage', label: 'Z-Image Turbo' },
        { value: 'qwen_edit', label: 'Qwen Edit' },
        { value: 'custom', label: '自定义 ModelScope 模型' },
      ];
    }
    const providers = providersFor(type);
    if (field === 'provider') return providers.map((item) => ({ value: String(item.id || ''), label: String(item.name || item.id || '') }));
    if (field === 'model') {
      const provider = providers.find((item) => item.id === (type === 'llm' ? node.llmProvider : node.apiProvider)) ?? providers[0];
      const values = type === 'video' ? provider?.video_models : type === 'llm' ? provider?.chat_models : provider?.image_models;
      const fallback = type === 'video' ? config.video_models : type === 'llm' ? config.chat_models : config.image_models;
      return [...new Set((values ?? fallback ?? []).map(String).filter(Boolean))].map((value) => ({ value, label: value }));
    }
    if (type === 'msgen' && field === 'custom-model') {
      const provider = (config.api_providers ?? []).find((item) => item.id === 'modelscope');
      return [...new Set([...(provider?.image_models ?? []), String(node.msCustomModel || '')].filter(Boolean))].map((value) => ({ value, label: value }));
    }
    if (type === 'msgen' && field === 'lora') {
      const provider = (config.api_providers ?? []).find((item) => item.id === 'modelscope');
      const model = String(node.msCustomModel || node.msgenModel || '');
      return (provider?.ms_loras ?? []).filter((item) => !item.model && !item.model_id || [item.model, item.model_id].includes(model)).map((item) => ({
        value: String(item.id || ''), label: String(item.name || item.id || ''), meta: { strength: Number(item.strength ?? 0.8) },
      }));
    }
    return [];
  };

  const providersFor = (type: string) => (config.api_providers ?? []).filter((provider) => {
    const models = type === 'video' ? provider.video_models : type === 'llm' ? provider.chat_models : provider.image_models;
    return provider.enabled !== false && Array.isArray(models) && models.length > 0;
  });

  const uploadMedia: CanvasRuntime['uploadMedia'] = async (files) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    return requestJson(fetcher, '/api/ai/upload', { method: 'POST', body: form });
  };

  const normalizeLtxNode: CanvasRuntime['normalizeLtxNode'] = (node) => {
    const copy = structuredClone(node);
    const frameRate = Math.max(1, Number(copy.frameRate || 24));
    const durationFrames = Math.max(1, Number(copy.durationFrames || 120));
    copy.frameRate = frameRate;
    copy.durationFrames = durationFrames;
    copy.durationSeconds = Math.round(durationFrames / frameRate * 1000) / 1000;
    if (!copy.ltxTimelineData) {
      copy.ltxTimelineData = JSON.stringify({
        segments: [{ id: uniqueId('ltxseg'), start: 0, length: durationFrames, prompt: '', type: 'text' }],
        audioSegments: [],
      });
    }
    return copy;
  };

  const prepareVideoMedia: CanvasRuntime['prepareVideoMedia'] = async (nodeId, source, action, value = '') => {
    const document = structuredClone(source);
    const node = document.nodes.find((item) => item.id === nodeId && item.type === 'video');
    if (!node) throw new Error('Video node is missing from the active canvas');
    if (action === 'manual') {
      const url = value.trim();
      if (url && !/^(https?:\/\/|asset:\/\/)/i.test(url)) throw new Error('请输入 http/https 媒体网址或 asset:// 素材 URI');
      node.manualVideoUrl = url;
      return document;
    }
    const refs = collectInputs(document, node).media.filter((item) => item.kind === 'video' || item.kind === 'audio');
    const uploaded: Record<string, string> = { ...(node.uploadedMediaUrls as Record<string, string> ?? {}) };
    for (const ref of refs) {
      if (/^(https?:\/\/|asset:\/\/)/i.test(ref.url)) { uploaded[ref.url] = ref.url; continue; }
      const result = await requestJson<{ url?: string }>(fetcher, '/api/cloud-video/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: ref.url, service: 'auto' }),
      });
      if (!result.url) throw new Error('云端没有返回媒体链接');
      uploaded[ref.url] = result.url;
    }
    node.uploadedMediaUrls = uploaded;
    return document;
  };

  const smartExecution = createSmartCanvasExecution({
    fetcher,
    getConfig: () => config,
    getWorkflow: async (name) => {
      let detail = workflowDetails.get(name);
      if (!detail) {
        detail = await requestJson<WorkflowRecord>(fetcher, `/api/workflows/${encodeURIComponent(name)}`);
        workflowDetails.set(name, detail);
      }
      return detail;
    },
    taskClient,
  });

  const runNode: CanvasRuntime['runNode'] = async (nodeId, source, mode = 'node', onUpdate) => {
    if (source.kind === 'smart' && smartExecution.canHandle(source.nodes.find((node) => node.id === nodeId))) {
      return smartExecution.runNode(nodeId, source, mode, onUpdate);
    }
    const document = structuredClone(source);
    const order = mode === 'cascade' ? createGraphModel(document).cascadeOrder(nodeId) : [nodeId];
    if (!order.length) throw new Error('没有可执行的节点');
    const controller = new AbortController();
    controllers.get(nodeId)?.abort();
    controllers.set(nodeId, controller);
    try {
      for (const id of order) {
        if (controller.signal.aborted) throw new Error('执行已停止');
        await executeNode(document, id, mode === 'chat' && id === nodeId, controller.signal, onUpdate);
      }
      return document;
    } finally {
      if (controllers.get(nodeId) === controller) controllers.delete(nodeId);
    }
  };

  const runCommand: CanvasRuntime['runCommand'] = async (command, nodeId, source, onUpdate) => {
    if (source.kind === 'smart' && smartExecution.canHandle(source.nodes.find((node) => node.id === nodeId))) {
      return smartExecution.runCommand(command, nodeId, source, onUpdate);
    }
    if (command === 'stop-execution') {
      controllers.get(nodeId)?.abort();
      return structuredClone(source);
    }
    const document = structuredClone(source);
    const order = createGraphModel(document).retryCascadeOrder(nodeId);
    const controller = new AbortController();
    controllers.set(nodeId, controller);
    try {
      for (const id of order) await executeNode(document, id, false, controller.signal, onUpdate);
      return document;
    } finally {
      if (controllers.get(nodeId) === controller) controllers.delete(nodeId);
    }
  };

  const recoverDocument: CanvasRuntime['recoverDocument'] = async (source, onUpdate) => {
    const document = await smartExecution.recoverDocument(source, onUpdate);
    const recoveries: Promise<void>[] = [];
    for (const output of document.nodes.filter((node) => node.type === 'output')) {
      for (const pending of Array.isArray(output._pending) ? output._pending as Array<Record<string, unknown>> : []) {
        const taskId = String(pending.canvasTaskId || '');
        const kind = pending.canvasTaskType === 'video' ? 'video' : ['image', 'online-image'].includes(String(pending.canvasTaskType || '')) ? 'image' : null;
        if (!taskId || !kind) continue;
        pending.recoveryStatus = 'recovering';
        pending.failed = false;
        recoveries.push(taskClient.watch(kind, taskId).then(async (record) => {
          const generator = document.nodes.find((node) => node.id === String(pending.nodeId || ''));
          if (record.status === 'succeeded') {
            const outputs = extractOutputs(record.result);
            if (generator) { mergeGenerated(generator, outputs); generator.runStatus = 'done'; generator.runError = ''; }
            if (outputs.length) appendOutput(output, outputs);
            output._pending = (output._pending as Array<Record<string, unknown>>).filter((item) => item.id !== pending.id);
            appendLog(document, {
              id: uniqueId('log'), nodeId: generator?.id || pending.nodeId, nodeType: generator?.type || pending.type,
              recovered: true, status: 'done', outputs: outputs.map(outputUrl),
              ...taskLogEvidence(record, pending),
            });
          } else {
            pending.recoveryStatus = record.status;
            pending.recoveryError = record.error || `任务状态：${record.status}`;
            pending.failed = true;
            if (generator) { generator.runStatus = 'failed'; generator.runError = String(pending.recoveryError); }
          }
          await emit(document, onUpdate);
        }).catch(async (error) => {
          pending.recoveryStatus = 'interrupted';
          pending.recoveryError = error instanceof Error ? error.message : String(error);
          pending.failed = true;
          await emit(document, onUpdate);
        }));
      }
    }
    if (recoveries.length) {
      await emit(document, onUpdate);
      await Promise.all(recoveries);
    }
    return document;
  };

  const executeNode = async (document: CanvasDocument, nodeId: string, chat: boolean, signal: AbortSignal, onUpdate?: RuntimeUpdate) => {
    const node = document.nodes.find((item) => item.id === nodeId);
    if (!node || !RUN_TYPES.has(node.type)) throw new Error(`不支持执行节点：${node?.type || nodeId}`);
    node.running = true;
    node.runStatus = 'running';
    node.runError = '';
    await emit(document, onUpdate);
    const input = collectInputs(document, node);
    let pending: Record<string, unknown> | null = null;
    let output: CanvasNode | null = null;
    let outputs: unknown[] = [];
    let completed = false;
    const startedAt = Date.now();
    const evidenceKey = `${String(document.id || '')}:${nodeId}`;
    taskEvidence.delete(evidenceKey);
    try {
      if (node.type !== 'llm') {
        output = ensureOutput(document, node);
        if (output) {
          pending = { id: uniqueId('pending'), startedAt: Date.now(), nodeId, type: node.type };
          output._pending = [...(Array.isArray(output._pending) ? output._pending : []), pending];
          await emit(document, onUpdate);
        }
      }
      outputs = await executeByType(document, node, input, chat, signal, pending, onUpdate);
      if (outputs.length) {
        mergeGenerated(node, outputs);
        if (output) appendOutput(output, outputs, input.media[0]);
      }
      node.runStatus = 'done';
      node.runError = '';
      completed = true;
      appendLog(document, { id: uniqueId('log'), nodeId, nodeType: node.type, status: 'done', startedAt, finishedAt: Date.now(), outputs: outputs.map(outputUrl), ...taskEvidence.get(evidenceKey) });
    } catch (error) {
      node.runStatus = 'failed';
      node.runError = error instanceof Error ? error.message : String(error);
      if (pending?.canvasTaskId) {
        pending.failed = true;
        pending.recoveryStatus ||= 'interrupted';
        pending.recoveryError ||= node.runError;
      }
      appendLog(document, { id: uniqueId('log'), nodeId, nodeType: node.type, status: 'failed', startedAt, finishedAt: Date.now(), error: node.runError, ...taskEvidence.get(evidenceKey) });
      throw error;
    } finally {
      node.running = false;
      if (output && pending && (completed || !pending.canvasTaskId)) {
        output._pending = (Array.isArray(output._pending) ? output._pending : []).filter((item) => (item as Record<string, unknown>).id !== pending?.id);
      }
      taskEvidence.delete(evidenceKey);
      await emit(document, onUpdate);
    }
  };

  const executeByType = async (
    document: CanvasDocument,
    node: CanvasNode,
    input: InputBundle,
    chat: boolean,
    signal: AbortSignal,
    pending: Record<string, unknown> | null,
    onUpdate?: RuntimeUpdate,
  ): Promise<unknown[]> => {
    const prompt = input.prompts.join('\n\n').trim() || String(node.userInput || node.globalPrompt || '');
    if (node.type === 'llm') {
      const message = chat ? String(node.chatInput || prompt) : prompt;
      if (!message) throw new Error('LLM 缺少提示词输入');
      const messages = Array.isArray(node.messages) ? node.messages : [];
      const result = await post<{ text?: string }>('/api/canvas-llm', {
        message,
        model: node.model || node.llmMsModel || '',
        ms_model: node.llmProvider === 'modelscope' ? node.model || node.llmMsModel || '' : '',
        provider: node.llmProvider || '',
        system_prompt: node.systemPrompt || 'You are a helpful assistant.',
        messages,
        images: input.media.filter((item) => item.kind === 'image'),
        videos: input.media.filter((item) => item.kind === 'video'),
      }, signal);
      node.outputText = result.text || '';
      if (chat) {
        node.messages = [...messages, { role: 'user', content: message }, { role: 'assistant', content: result.text || '' }];
        node.chatInput = '';
      }
      return [];
    }
    if (!prompt && node.type !== 'comfy' && !(node.type === 'generator' && input.media.some((item) => item.kind === 'image'))) throw new Error('缺少提示词输入');
    if (node.type === 'video') {
      const payload = {
        prompt,
        provider_id: node.apiProvider || '', model: node.model || 'veo3-fast',
        duration: Number(node.duration || 5), aspect_ratio: node.aspectRatio || '16:9', resolution: node.resolution || '',
        images: input.media.filter((item) => item.kind === 'image'),
        videos: [String(node.manualVideoUrl || ''), ...input.media.filter((item) => item.kind === 'video').map((item) => uploadedUrl(node, item.url))].filter(Boolean),
        audios: input.media.filter((item) => item.kind === 'audio').map((item) => uploadedUrl(node, item.url)),
        enhance_prompt: Boolean(node.enhancePrompt), enable_upsample: Boolean(node.enableUpsample), watermark: Boolean(node.watermark),
        camerafixed: Boolean(node.cameraFixed), generate_audio: Boolean(node.generateAudio), multimodal: Boolean(node.multimodal), task_mode: node.taskMode || 'auto',
      };
      return runTask('video', document, node, payload, signal, pending, onUpdate);
    }
    if (node.type === 'generator') {
      const selection = resolveGeneratorSelection(node, config.api_providers ?? []);
      const references = input.media.filter((item) => item.kind === 'image');
      const requestPrompt = prompt || 'Edit the reference images.';
      const size = await generatorImageSize(node, references);
      validateGeneratorRequest(selection.providerId, selection.model, size, references.length);
      Object.assign(node, { apiProvider: selection.providerId, model: selection.model });
      const payload = {
        prompt: requestPrompt, provider_id: selection.providerId, model: selection.model,
        size,
        reference_images: references, quality: normalizeImageQuality(node.quality),
        n: Math.max(1, Math.min(8, Number(node.count || 1))),
      };
      return runTask('image', document, node, payload, signal, pending, onUpdate);
    }
    if (node.type === 'msgen') {
      const modelKey = String(node.msgenModel || 'zimage');
      const size = imageSize(node.msRatio, node.msResolution, node.msCustomSize, node.msWidth, node.msHeight);
      const endpoint = modelKey === 'qwen_edit' ? '/api/angle/generate' : '/generate';
      const payload: Record<string, unknown> = { prompt, resolution: size, client_id: clientId() };
      if (modelKey !== 'zimage') payload.image_urls = input.media.filter((item) => item.kind === 'image').map((item) => item.url);
      if (modelKey === 'custom') payload.model = node.msCustomModel || '';
      if (node.msLoraEnabled && node.msLoraId) payload.loras = { [String(node.msLoraId)]: Number(node.msLoraStrength ?? 0.8) };
      const count = Math.max(1, Math.min(8, Number(node.count || 1)));
      const results = await Promise.all(Array.from({ length: count }, () => post<Record<string, unknown>>(endpoint, payload, signal)));
      return results.flatMap(extractOutputs);
    }
    if (node.type === 'ltxDirector') {
      const normalized = normalizeLtxNode(node);
      Object.assign(node, normalized);
      const inputs = buildLtxInputs(node, prompt);
      const timeline = JSON.parse(String(inputs.timeline_data || '{}')) as { audioSegments?: unknown[]; segments?: Array<Record<string, unknown>> };
      for (const segment of timeline.segments ?? []) {
        if (segment.type !== 'image' || segment.imageFile || !segment.imageB64) continue;
        segment.imageFile = await uploadComfyRef({ kind: 'image', name: `ltx-${String(segment.id || 'segment')}.png`, url: String(segment.imageB64) }, signal);
        delete segment.imgObj;
      }
      inputs.timeline_data = JSON.stringify(timeline);
      node.ltxTimelineData = inputs.timeline_data;
      node.ltxLocalPrompts = inputs.local_prompts;
      node.ltxSegmentLengths = inputs.segment_lengths;
      node.ltxGuideStrength = inputs.guide_strength;
      const params = {
        '46': inputs,
        '94:28': { noise_seed: Number(node.noiseSeed ?? 12) },
      };
      const result = await post<Record<string, unknown>>('/api/generate', {
        prompt, workflow_json: 'LTXDirectorv2-API.json', params, type: 'ltx-director', client_id: clientId(),
      }, signal);
      return extractOutputs(result);
    }
    return executeComfy(node, input, prompt, signal);
  };

  const executeComfy = async (node: CanvasNode, input: InputBundle, prompt: string, signal: AbortSignal) => {
    const mode = String(node.mode || 'text');
    let payload: Record<string, unknown>;
    if (mode === 'text') {
      payload = { prompt, width: Number(node.width || 1024), height: Number(node.height || 1024), workflow_json: 'Z-Image.json', type: 'zimage', client_id: clientId() };
    } else if (mode === 'enhance') {
      const image = requireMedia(input, 'image', 1, 'Comfy 增强')[0];
      const result = await post<Record<string, unknown>>('/api/generate', {
        workflow_json: 'Z-Image-Enhance.json',
        params: {
          '15': { image: await uploadComfyRef(image, signal) },
          '204': { value: Number(node.enhanceStrength ?? 0.5) },
        },
        type: 'enhance',
        client_id: clientId(),
      }, signal);
      const outputs = requireOutputs(result, 'Comfy 增强');
      return node.enhanceUpscale
        ? upscaleComfyOutput(outputs[0], Number(node.enhanceUpscaleRes || 2048), signal)
        : outputs;
    } else if (mode === 'custom') {
      const workflow = String(node.comfyWorkflow || workflows[0]?.name || '');
      const fields = await getComfyFields(workflow);
      const params: Record<string, Record<string, unknown>> = {};
      const mediaQueues = new Map(['image', 'video', 'audio'].map((kind) => [kind, input.media.filter((item) => item.kind === kind)]));
      const mediaOffsets = new Map<string, number>();
      for (const kind of ['image', 'video', 'audio'] as const) {
        const required = fields.filter((field) => comfyFieldKind(field) === kind).length;
        if (required) requireMedia(input, kind, required, `Comfy 工作流 ${workflow || '未命名'}`);
      }
      for (const field of fields) {
        const target = String(field.node || '');
        const key = String(field.input || '');
        if (!target || !key) continue;
        params[target] ??= {};
        const kind = comfyFieldKind(field);
        if (kind === 'prompt') params[target][key] = prompt;
        else if (['image', 'video', 'audio'].includes(kind)) {
          const offset = mediaOffsets.get(kind) ?? 0;
          const ref = mediaQueues.get(kind)?.[offset];
          mediaOffsets.set(kind, offset + 1);
          params[target][key] = ref ? await uploadComfyRef(ref, signal) : '';
        } else {
          const id = String(field.id || '');
          const configured = (node.comfyParams as Record<string, unknown> ?? {})[id] ?? field.default;
          const randomActive = (node.comfyRandomActive as Record<string, unknown> ?? {})[id] !== false;
          params[target][key] = field.random_enabled && randomActive ? randomFieldValue(field) : configured;
        }
      }
      payload = { prompt, workflow_json: workflow, params, type: 'workflow-custom', client_id: clientId() };
    } else {
      const images = requireMedia(input, 'image', 1, 'Comfy 编辑').slice(0, 3);
      const names: string[] = [];
      for (const image of images) names.push(await uploadComfyRef(image, signal));
      const result = await post<Record<string, unknown>>('/api/generate', {
        prompt,
        workflow_json: 'Flux2-Klein.json',
        type: 'klein',
        params: {
          '168': { text: prompt },
          '158': { noise_seed: Math.floor(Math.random() * 1_000_000) },
          '278': { image: names[0] || '' },
          '270': { image: names[1] || '' },
          '292': { image: names[2] || '' },
          '313': { value: Boolean(names[1]) },
          '314': { value: Boolean(names[2]) },
        },
        client_id: clientId(),
      }, signal);
      const outputs = requireOutputs(result, 'Comfy 编辑');
      return node.editUpscale
        ? upscaleComfyOutput(outputs[0], Number(node.editUpscaleRes || 2048), signal)
        : outputs;
    }
    const result = await post<Record<string, unknown>>('/api/generate', payload, signal);
    return extractOutputs(result);
  };

  const upscaleComfyOutput = async (value: unknown, resolution: number, signal: AbortSignal): Promise<unknown[]> => {
    const url = outputUrl(value);
    if (!url) throw new Error('Comfy 超分辨率缺少输入图片');
    const image = await uploadComfyRef({ kind: 'image', name: 'canvas-upscale.png', url }, signal);
    const result = await post<Record<string, unknown>>('/api/generate', {
      workflow_json: 'upscale.json',
      params: {
        '15': { image },
        '172': { seed: Math.floor(Math.random() * 4_294_967_295), resolution: Math.max(64, resolution || 2048) },
      },
      type: 'enhance',
      client_id: clientId(),
    }, signal);
    return requireOutputs(result, 'Comfy 超分辨率');
  };

  const runTask = async (
    kind: 'image' | 'video', document: CanvasDocument, node: CanvasNode, payload: unknown, signal: AbortSignal,
    pending: Record<string, unknown> | null, onUpdate?: RuntimeUpdate,
  ) => {
    const idempotencyKey = `${document.id}:${node.id}:${uniqueId('submit')}`;
    const task = await taskClient.submit(kind, payload, { idempotencyKey, signal });
    const taskId = String(task.task_id || task.id || '');
    const evidenceKey = `${String(document.id || '')}:${node.id}`;
    taskEvidence.set(evidenceKey, taskLogEvidence(task, { canvasTaskId: taskId, idempotencyKey }));
    if (pending) Object.assign(pending, { canvasTaskId: taskId, canvasTaskType: kind, idempotencyKey });
    await emit(document, onUpdate);
    const record = await taskClient.wait(kind, taskId, { signal });
    taskEvidence.set(evidenceKey, taskLogEvidence(record, { canvasTaskId: taskId, idempotencyKey }));
    if (record.status !== 'succeeded') {
      if (pending) Object.assign(pending, { failed: true, recoveryStatus: record.status, recoveryError: record.error || `${kind} task failed` });
      throw new Error(record.error || `${kind} task failed`);
    }
    return extractOutputs(record.result);
  };

  const post = <T>(path: string, payload: unknown, signal: AbortSignal) => requestJson<T>(fetcher, path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, { signal });

  const uploadComfyRef = async (ref: MediaRef, signal: AbortSignal): Promise<string> => {
    const source = /^https?:\/\//i.test(ref.url)
      ? `/api/download-output?inline=1&url=${encodeURIComponent(ref.url)}&name=${encodeURIComponent(ref.name || 'media')}`
      : ref.url;
    const response = await fetcher(source, { signal });
    if (!response.ok) throw new Error(`读取 ComfyUI 输入媒体失败：${ref.name || ref.url}`);
    const blob = await response.blob();
    const form = new FormData();
    form.append('files', new File([blob], ref.name || `canvas-${ref.kind}`, { type: blob.type }));
    const uploaded = await requestJson<{ files?: Array<{ comfy_name?: string }> }>(fetcher, '/api/upload', { method: 'POST', body: form }, { signal });
    const name = String(uploaded.files?.[0]?.comfy_name || '');
    if (!name) throw new Error('ComfyUI 没有返回媒体文件名');
    return name;
  };

  return { getComfyFields, getNodeOptions, initialize, normalizeLtxNode, prepareVideoMedia, recoverDocument, runCommand, runNode, uploadMedia };
}

interface MediaRef { kind: 'audio' | 'image' | 'video'; name: string; url: string }
interface InputBundle { media: MediaRef[]; prompts: string[] }

function collectInputs(document: CanvasDocument, target: CanvasNode): InputBundle {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const sources = document.connections.filter((edge) => edge.to === target.id).map((edge) => byId.get(edge.from)).filter(Boolean) as CanvasNode[];
  const prompts: string[] = [];
  const media: MediaRef[] = [];
  const addNode = (node: CanvasNode) => {
    if (node.type === 'prompt' && node.text) prompts.push(String(node.text));
    if (node.type === 'llm' && node.outputText) prompts.push(String(node.outputText));
    if (node.type === 'promptGroup' || node.type === 'group') {
      (Array.isArray(node.items) ? node.items : []).map(String).map((id) => byId.get(id)).filter(Boolean).forEach((item) => addNode(item!));
    }
    if (node.type === 'image' && node.url) media.push(mediaRef(node.url, node.mediaKind, node.name));
    if (node.type === 'output') (Array.isArray(node.images) ? node.images : []).slice(-1).forEach((item) => media.push(mediaRef(outputUrl(item), outputKind(item), 'output')));
    if (MEDIA_TYPES.has(node.type)) (Array.isArray(node.generatedOutputs) ? node.generatedOutputs : []).forEach((item) => media.push(mediaRef(outputUrl(item), outputKind(item), node.type)));
  };
  sources.forEach(addNode);
  return { prompts: prompts.filter(Boolean), media: dedupeMedia(media) };
}

function requireMedia(input: InputBundle, kind: MediaRef['kind'], count: number, operation: string): MediaRef[] {
  const media = input.media.filter((item) => item.kind === kind);
  if (media.length < count) {
    const labels: Record<MediaRef['kind'], string> = { audio: '音频', image: '图片', video: '视频' };
    throw new Error(`${operation}需要连接 ${count} 个${labels[kind]}输入，当前只有 ${media.length} 个`);
  }
  return media;
}

function requireOutputs(result: unknown, operation: string): unknown[] {
  const outputs = extractOutputs(result);
  if (!outputs.length) throw new Error(`${operation}未返回任何媒体`);
  return outputs;
}

function ensureOutput(document: CanvasDocument, node: CanvasNode): CanvasNode | null {
  const byId = new Map(document.nodes.map((item) => [item.id, item]));
  let output = document.connections.filter((edge) => edge.from === node.id).map((edge) => byId.get(edge.to)).find((item) => item?.type === 'output');
  if (output) return output;
  const hasDownstreamGenerator = document.connections
    .filter((edge) => edge.from === node.id)
    .map((edge) => byId.get(edge.to))
    .some((item) => item && MEDIA_TYPES.has(item.type));
  if (hasDownstreamGenerator) return null;
  if (!output) {
    output = { id: uniqueId('out'), type: 'output', x: Number(node.x || 0) + 460, y: Number(node.y || 0), images: [] };
    document.nodes.push(output);
    document.connections.push({ id: uniqueId('edge'), from: node.id, to: output.id });
  }
  return output;
}

function appendOutput(output: CanvasNode, values: unknown[], compare?: MediaRef) {
  const existing = new Set((Array.isArray(output.images) ? output.images : []).map(outputUrl));
  const items = values.map((value) => ({ url: outputUrl(value), kind: outputKind(value), viewed: false })).filter((item) => item.url && !existing.has(item.url));
  output.images = [...(Array.isArray(output.images) ? output.images : []), ...items];
  if (compare?.url) {
    const comparisons = { ...(output.imageComparisons as Record<string, unknown> ?? {}) };
    items.forEach((item) => { comparisons[item.url] = { url: compare.url, name: compare.name }; });
    output.imageComparisons = comparisons;
  }
}

function mergeGenerated(node: CanvasNode, values: unknown[]) {
  node.generatedOutputs = values.map((value) => outputKind(value) === 'image' ? outputUrl(value) : { url: outputUrl(value), kind: outputKind(value) }).filter((value) => typeof value === 'string' ? value : value.url);
}

function extractOutputs(value: unknown): unknown[] {
  const outputs: unknown[] = [];
  const visit = (item: unknown) => {
    if (!item) return;
    if (typeof item === 'string') { if (/^(https?:\/\/|\/|data:|blob:)/i.test(item)) outputs.push(item); return; }
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const direct = record.url || record.path || record.src || record.uri || record.output_url || record.video_url;
    if (typeof direct === 'string') outputs.push({ url: direct, kind: record.kind || record.type || '' });
    ['images', 'videos', 'audios', 'files', 'outputs', 'items', 'data', 'result', 'output'].forEach((key) => visit(record[key]));
  };
  visit(value);
  const seen = new Set<string>();
  return outputs.filter((item) => { const url = outputUrl(item); return Boolean(url && !seen.has(url) && seen.add(url)); });
}

function buildLtxInputs(node: CanvasNode, prompt: string) {
  let timeline: { audioSegments: unknown[]; segments: Array<Record<string, unknown>> } = { audioSegments: [], segments: [] };
  try {
    const parsed = JSON.parse(String(node.ltxTimelineData || '{}')) as Partial<typeof timeline>;
    timeline = { audioSegments: Array.isArray(parsed.audioSegments) ? parsed.audioSegments : [], segments: Array.isArray(parsed.segments) ? parsed.segments : [] };
  } catch { /* use an empty timeline */ }
  const duration = Math.max(1, Number(node.durationFrames || 120));
  const fallback = prompt.trim() || String(node.globalPrompt || '').trim() || '.';
  const segments = timeline.segments.slice().sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
  const lengths: number[] = [];
  const prompts: string[] = [];
  let cursor = 0;
  let gap = 0;
  for (const segment of segments) {
    const start = Math.max(0, Number(segment.start || 0));
    if (start >= duration) break;
    const length = Math.max(1, Number(segment.length || 1));
    if (start > cursor) {
      const missing = Math.min(start, duration) - cursor;
      if (lengths.length) lengths[lengths.length - 1] += missing;
      else gap += missing;
    }
    const clipped = Math.max(0, Math.min(start + length, duration) - start);
    lengths.push(clipped + gap);
    const localPrompt = String(segment.prompt || '').trim();
    prompts.push(localPrompt || fallback);
    if (!localPrompt) segment.prompt = fallback;
    gap = 0;
    cursor = start + length;
  }
  if (lengths.length && Math.min(cursor, duration) < duration) lengths[lengths.length - 1] += duration - Math.min(cursor, duration);
  if (!lengths.length) { lengths.push(duration); prompts.push(fallback); }
  const guideStrength = segments.filter((segment) => segment.type !== 'text').map((segment) => Number(segment.guideStrength ?? 1).toFixed(2)).join(',');
  const timelineData = JSON.stringify({ segments, audioSegments: timeline.audioSegments });
  return {
    global_prompt: fallback, duration_frames: duration, duration_seconds: Number(node.durationSeconds || duration / Number(node.frameRate || 24)),
    timeline_data: timelineData, local_prompts: prompts.join(' | '), segment_lengths: lengths.join(','), guide_strength: guideStrength,
    epsilon: Number(node.epsilon ?? 0.001), frame_rate: Number(node.frameRate || 24), use_custom_audio: Boolean(node.useCustomAudio),
    display_mode: String(node.displayMode || 'seconds'), custom_width: Math.max(0, Number(node.customWidth || 0)), custom_height: Math.max(0, Number(node.customHeight || 0)),
    resize_method: 'maintain aspect ratio', divisible_by: Math.max(1, Number(node.divisibleBy || 32)), img_compression: Number(node.imgCompression ?? 18), timeline_ui: '',
  };
}

function comfyFieldKind(field: Record<string, unknown>): string {
  const value = String(field.type || field.kind || field.input_type || '').toLowerCase();
  if (value.includes('image')) return 'image';
  if (value.includes('video')) return 'video';
  if (value.includes('audio')) return 'audio';
  if (value.includes('prompt') || value.includes('text')) return 'prompt';
  return 'setting';
}

function imageSize(ratio: unknown, resolution: unknown, custom: unknown, width: unknown, height: unknown, customRatio: unknown = ''): string {
  const resolutionKey = ['1k', '2k', '4k'].includes(String(resolution || '').toLowerCase()) ? String(resolution).toLowerCase() : '1k';
  if (String(resolution || '') === 'custom' && custom) return String(custom).trim();
  if (String(resolution || '') === 'custom' && Number(width) > 0 && Number(height) > 0) return `${Math.round(Number(width))}x${Math.round(Number(height))}`;
  const sizes: Record<string, Record<string, string>> = {
    square: { '1k': '1024x1024', '2k': '2048x2048', '4k': '4096x4096' },
    landscape: { '1k': '1536x1024', '2k': '2048x1360', '4k': '3520x2336' },
    portrait: { '1k': '1024x1536', '2k': '1360x2048', '4k': '2336x3520' },
    landscape43: { '1k': '1024x768', '2k': '2048x1536', '4k': '3312x2480' },
    portrait43: { '1k': '768x1024', '2k': '1536x2048', '4k': '2480x3312' },
    wide: { '1k': '1536x864', '2k': '2048x1152', '4k': '3840x2160' },
    story: { '1k': '864x1536', '2k': '1152x2048', '4k': '2160x3840' },
    ultrawide: { '1k': '1536x656', '2k': '2048x880', '4k': '3840x1648' },
    ultratall: { '1k': '656x1536', '2k': '880x2048', '4k': '1648x3840' },
  };
  const aliases: Record<string, string> = { '1:1': 'square', '2:3': 'portrait', '3:2': 'landscape', '3:4': 'portrait43', '4:3': 'landscape43', '9:16': 'story', '16:9': 'wide', '21:9': 'ultrawide', '9:21': 'ultratall' };
  const ratioKey = aliases[String(ratio || '')] || String(ratio || 'square');
  if ((ratioKey === 'custom' || ratioKey === 'source') && parseRatio(customRatio)) {
    const parsed = parseRatio(customRatio)!;
    const longSides: Record<string, number> = { '1k': 1024, '2k': 2048, '4k': 3840 };
    const pixelLimits: Record<string, number> = { '1k': 2_359_296, '2k': 4_194_304, '4k': 8_294_400 };
    const longSide = longSides[resolutionKey] ?? 1024;
    const pixelLimit = pixelLimits[resolutionKey] ?? 1_048_576;
    const rawWidth = parsed >= 1 ? longSide : Math.min(longSide * parsed, Math.sqrt(pixelLimit * parsed));
    const rawHeight = parsed >= 1 ? Math.min(longSide / parsed, Math.sqrt(pixelLimit / parsed)) : longSide;
    return `${Math.max(64, Math.floor(rawWidth / 16) * 16)}x${Math.max(64, Math.floor(rawHeight / 16) * 16)}`;
  }
  return sizes[ratioKey]?.[resolutionKey] || sizes.square[resolutionKey];
}

async function generatorImageSize(node: CanvasNode, references: MediaRef[]): Promise<string> {
  let customRatio = node.customRatio;
  if (String(node.ratio || '') === 'source' && !parseRatio(customRatio)) {
    const reference = references[0];
    if (!reference) throw new Error('自适应比例需要至少一张参考图');
    if (typeof Image === 'undefined') throw new Error('当前环境无法读取参考图尺寸，请改用自定义比例');
    const dimensions = await new Promise<{ height: number; width: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ height: image.naturalHeight, width: image.naturalWidth });
      image.onerror = () => reject(new Error('无法读取参考图尺寸，请改用自定义比例'));
      image.src = reference.url;
    });
    customRatio = `${dimensions.width}:${dimensions.height}`;
    node.customRatio = customRatio;
    node.customRatioWidth = dimensions.width;
    node.customRatioHeight = dimensions.height;
  }
  return imageSize(node.ratio, node.resolution, node.customSize, node.width, node.height, customRatio);
}

function parseRatio(value: unknown): number | null {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)\s*[:x*]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : null;
}

function resolveGeneratorSelection(node: CanvasNode, providers: ProviderConfig[]): { model: string; providerId: string } {
  const available = providers.filter((provider) => provider.enabled !== false && Array.isArray(provider.image_models) && provider.image_models.length > 0);
  if (!available.length) {
    const providerId = String(node.apiProvider || '').trim();
    const model = String(node.model || '').trim();
    if (providerId && model) return { providerId, model };
  }
  const provider = available.find((item) => item.id === node.apiProvider) ?? available[0];
  if (!provider?.id) throw new Error('没有可用的图片生成平台，请先完成 API 设置');
  const models = [...new Set((provider.image_models ?? []).map(String).filter(Boolean))];
  const requested = String(node.model || '');
  const model = models.includes(requested) ? requested : models[0];
  if (!model) throw new Error(`图片生成平台 ${provider.name || provider.id} 没有可用模型`);
  return { providerId: String(provider.id), model };
}

function validateGeneratorRequest(providerId: string, model: string, size: string, referenceCount: number): void {
  const normalizedModel = model.toLowerCase();
  const maxReferences = providerId === 'modelscope' ? 4 : /seedream|doubao/.test(normalizedModel) || providerId === 'volcengine' ? 10 : 16;
  if (referenceCount > maxReferences) throw new Error(`${model} 最多支持 ${maxReferences} 张参考图，当前连接了 ${referenceCount} 张`);
  const dimensions = String(size || '').match(/^(\d+)x(\d+)$/i);
  if (!dimensions) throw new Error('图片尺寸无效，请选择预设尺寸或填写完整的自定义宽高');
  const width = Number(dimensions[1]);
  const height = Number(dimensions[2]);
  if (width < 64 || height < 64 || width % 16 || height % 16) throw new Error('图片宽高必须不小于 64，且为 16 的倍数');
  if (/gpt[^a-z0-9]*image[^a-z0-9]*2/i.test(model) && (Math.max(width, height) > 3840 || width * height > 8_294_400)) {
    throw new Error(`GPT-Image-2 不支持尺寸 ${size}：最长边不能超过 3840，且总像素不能超过 8294400`);
  }
}

function normalizeImageQuality(value: unknown): 'high' | 'low' | 'medium' | undefined {
  const quality = String(value || '').trim().toLowerCase();
  return quality === 'low' || quality === 'medium' || quality === 'high' ? quality : undefined;
}

function mediaRef(url: unknown, kind: unknown, name: unknown): MediaRef {
  return { url: String(url || ''), kind: normalizeKind(String(kind || ''), String(url || '')), name: String(name || 'media') };
}
function outputUrl(value: unknown): string { return typeof value === 'string' ? value : value && typeof value === 'object' ? String((value as Record<string, unknown>).url || '') : ''; }
function outputKind(value: unknown): 'audio' | 'image' | 'video' { return normalizeKind(value && typeof value === 'object' ? String((value as Record<string, unknown>).kind || '') : '', outputUrl(value)); }
function normalizeKind(kind: string, url: string): 'audio' | 'image' | 'video' {
  if (kind === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
  if (kind === 'audio' || /\.(mp3|wav|m4a|ogg)(\?|$)/i.test(url)) return 'audio';
  return 'image';
}
function randomFieldValue(field: Record<string, unknown>): number {
  const min = Number.isFinite(Number(field.min)) ? Number(field.min) : 0;
  const max = Number.isFinite(Number(field.max)) ? Number(field.max) : Math.max(min + 1, 1_000_000);
  const step = Math.max(Number(field.step) || 1, Number.EPSILON);
  const slots = Math.max(0, Math.floor((max - min) / step));
  const value = min + Math.floor(Math.random() * (slots + 1)) * step;
  return Number(value.toFixed(Math.min(12, Math.max(0, String(step).split('.')[1]?.length || 0))));
}
function dedupeMedia(items: MediaRef[]): MediaRef[] { const seen = new Set<string>(); return items.filter((item) => Boolean(item.url && !seen.has(item.url) && seen.add(item.url))); }
function uploadedUrl(node: CanvasNode, url: string): string { return String((node.uploadedMediaUrls as Record<string, string> ?? {})[url] || url); }
function uniqueId(prefix: string): string { return `${prefix}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`; }
function clientId(): string {
  try { return typeof sessionStorage === 'undefined' ? 'canvas-modern' : sessionStorage.getItem('canvasClientId') || 'canvas-modern'; }
  catch { return 'canvas-modern'; }
}
async function emit(document: CanvasDocument, onUpdate?: RuntimeUpdate) { if (onUpdate) await onUpdate(structuredClone(document)); }
async function safeRequest<T>(fetcher: Fetcher, path: string, fallback: T): Promise<T> { try { return await requestJson<T>(fetcher, path); } catch { return fallback; } }
function appendLog(document: CanvasDocument, entry: Record<string, unknown>) {
  const logs = Array.isArray(document.logs) ? document.logs : [];
  document.logs = [...logs, entry].slice(-500);
}

function taskLogEvidence(task: Record<string, unknown>, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  const result = task.result && typeof task.result === 'object' ? task.result as Record<string, unknown> : {};
  const cost = task.cost ?? result.cost;
  return {
    canvasTaskId: String(task.task_id || task.id || fallback.canvasTaskId || ''),
    upstreamTaskId: String(task.upstream_task_id || result.upstream_task_id || fallback.upstreamTaskId || ''),
    idempotencyKey: String(task.idempotency_key || fallback.idempotencyKey || ''),
    ...(cost !== undefined ? { cost: structuredClone(cost) } : {}),
  };
}
