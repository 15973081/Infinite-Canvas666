import type { CanvasDocument, CanvasEdge, CanvasNode } from '../domain/types';
import { requestJson, type Fetcher } from '../infrastructure/http';
import type { CanvasTaskRecord, TaskClient } from '../infrastructure/task-client';

type RuntimeUpdate = (document: CanvasDocument) => void | Promise<void>;
type SmartCommand = 'retry-execution' | 'stop-execution';
type SmartMode = 'cascade' | 'chat' | 'node';
type MediaKind = 'audio' | 'image' | 'text' | 'video';
interface SmartMedia extends Record<string, unknown> { kind: MediaKind; name: string; url: string }
interface LoopExecutionContext { images: SmartMedia[]; loopId: string; prompt: string }
interface SmartExecutionOptions {
  fetcher: Fetcher;
  getConfig(): { api_providers?: Array<Record<string, unknown>> };
  getWorkflow(name: string): Promise<Record<string, unknown>>;
  taskClient: TaskClient;
}

const SIZE_MAP: Record<string, Record<string, string>> = {
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

export interface SmartCanvasExecution {
  canHandle(node: CanvasNode | undefined): boolean;
  recoverDocument(source: CanvasDocument, onUpdate?: RuntimeUpdate): Promise<CanvasDocument>;
  runCommand(command: SmartCommand, nodeId: string, source: CanvasDocument, onUpdate?: RuntimeUpdate): Promise<CanvasDocument>;
  runNode(nodeId: string, source: CanvasDocument, mode?: SmartMode, onUpdate?: RuntimeUpdate): Promise<CanvasDocument>;
}

export function createSmartCanvasExecution({ fetcher, getConfig, getWorkflow, taskClient }: SmartExecutionOptions): SmartCanvasExecution {
  const controllers = new Map<string, AbortController>();
  const activeImageRuns = new WeakMap<CanvasNode, number>();

  const canHandle = (node: CanvasNode | undefined) => Boolean(node && (node.type === 'smart-image' || node.type === 'loop' || (node.type === 'prompt' && node.llmEnabled)));
  const emit = async (document: CanvasDocument, onUpdate?: RuntimeUpdate) => { if (onUpdate) await onUpdate(structuredClone(document)); };
  const post = <T>(path: string, payload: unknown, signal?: AbortSignal) => requestJson<T>(fetcher, path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, { signal });

  const runNode: SmartCanvasExecution['runNode'] = async (nodeId, source, mode = 'node', onUpdate) => {
    const document = structuredClone(source);
    const root = document.nodes.find((node) => node.id === nodeId);
    if (!canHandle(root)) throw new Error(`不支持执行节点：${root?.type || nodeId}`);
    controllers.get(nodeId)?.abort();
    const controller = new AbortController();
    controllers.set(nodeId, controller);
    try {
      if (root?.type === 'loop') await executeLoop(document, root, controller.signal, onUpdate);
      else if (root?.type === 'prompt') await executePrompt(document, root, controller.signal, onUpdate);
      else {
        const order = mode === 'cascade' ? smartCascadeOrder(document, nodeId) : [nodeId];
        for (const id of order) {
          throwIfAborted(controller.signal);
          const node = document.nodes.find((item) => item.id === id);
          if (node?.type === 'prompt' && node.llmEnabled) await executePrompt(document, node, controller.signal, onUpdate);
          else if (node?.type === 'smart-image') await executeImage(document, node, controller.signal, onUpdate);
        }
      }
      return document;
    } finally {
      if (controllers.get(nodeId) === controller) controllers.delete(nodeId);
    }
  };

  const runCommand: SmartCanvasExecution['runCommand'] = async (command, nodeId, source, onUpdate) => {
    if (command === 'stop-execution') {
      controllers.get(nodeId)?.abort();
      const stopped = structuredClone(source);
      stopped.nodes.filter((node) => node.id === nodeId || node.running).forEach((node) => {
        node.running = false;
        node.queued = false;
        node.runStatus = 'stopped';
      });
      await emit(stopped, onUpdate);
      return stopped;
    }
    const node = source.nodes.find((item) => item.id === nodeId);
    if (!node) return structuredClone(source);
    const retry = structuredClone(source);
    const target = retry.nodes.find((item) => item.id === nodeId)!;
    target.runError = '';
    target.runStatus = undefined;
    return runNode(nodeId, retry, node.type === 'loop' ? 'cascade' : 'node', onUpdate);
  };

  const recoverDocument: SmartCanvasExecution['recoverDocument'] = async (source, onUpdate) => {
    const document = structuredClone(source);
    const recoveries: Promise<void>[] = [];
    document.nodes.filter((node) => node.type === 'smart-image').forEach((node) => {
      smartPendingTasks(node).filter((task) => !task.failed || !task.recoverTaskId).forEach((task) => {
        const taskId = String(task.taskId || '');
        const kind = task.kind === 'video' ? 'video' : 'image';
        if (!taskId) return;
        task.recoveryStatus = 'recovering';
        recoveries.push(taskClient.watch(kind, taskId).then(async (record) => {
          const outputs = applyTaskRecord(node, task, record);
          if (outputs.length) finishSmartNode(document, node, outputs, true);
          await emit(document, onUpdate);
        }).catch(async (error) => {
          task.failed = true;
          task.recoveryStatus = 'interrupted';
          task.error = error instanceof Error ? error.message : String(error);
          node.running = false;
          await emit(document, onUpdate);
        }));
      });
    });
    if (recoveries.length) {
      await emit(document, onUpdate);
      await Promise.all(recoveries);
    }
    return document;
  };

  const executePrompt = async (document: CanvasDocument, node: CanvasNode, signal: AbortSignal, onUpdate?: RuntimeUpdate, context?: LoopExecutionContext) => {
    const message = String(node.llmInstruction || node.text || '').trim();
    if (!message) throw new Error('请输入要处理的提示词或 LLM 指令');
    const refs = collectSmartInputs(document, node, context).media;
    const provider = String(node.llmProvider || '');
    const model = String(node.llmModel || node.model || '');
    const payload = {
      message,
      messages: [],
      images: refs.filter((item) => item.kind === 'image').map((item) => item.url),
      videos: refs.filter((item) => item.kind === 'video').map((item) => item.url),
      model,
      provider,
      ms_model: provider === 'modelscope' ? model : '',
      system_prompt: node.llmSystemEnabled ? String(node.llmSystemPrompt || 'You are a helpful prompt assistant.') : '',
    };
    node.running = true;
    node.runStatus = 'running';
    node.runError = '';
    await emit(document, onUpdate);
    try {
      const result = await post<{ text?: string }>('/api/canvas-llm', payload, signal);
      node.text = String(result.text || '').trim();
      node.runStatus = 'done';
      appendLog(document, node, payload, [], '');
    } catch (error) {
      failNode(document, node, error, payload);
      throw error;
    } finally {
      node.running = false;
      await emit(document, onUpdate);
    }
  };

  const executeLoop = async (document: CanvasDocument, loop: CanvasNode, signal: AbortSignal, onUpdate?: RuntimeUpdate) => {
    const target = downstreamSmartTarget(document, loop.id);
    if (!target) throw new Error('请把循环节点连接到下游图片链路');
    const start = Math.max(1, Number(loop.loopStart || 1));
    const count = Math.max(1, Math.min(100, Number(loop.count || 1)));
    const rounds = Array.from({ length: count }, (_, index) => start + index);
    loop.running = true;
    loop.runStatus = 'running';
    loop.runStartedAt = Date.now();
    loop.runTotal = count;
    await emit(document, onUpdate);
    const runRound = async (round: number) => {
      throwIfAborted(signal);
      const context: LoopExecutionContext = {
        images: loopImagesForRound(document, loop, round),
        loopId: loop.id,
        prompt: loopPromptForRound(loop, round),
      };
      loop.activeRound = round;
      loop.currentPrompt = context.prompt;
      loop.currentImages = context.images;
      await emit(document, onUpdate);
      for (const id of smartCascadeOrder(document, target.id)) {
        throwIfAborted(signal);
        const node = document.nodes.find((item) => item.id === id);
        if (node?.type === 'prompt' && node.llmEnabled) await executePrompt(document, node, signal, onUpdate, context);
        else if (node?.type === 'smart-image') await executeImage(document, node, signal, onUpdate, true, context);
      }
    };
    try {
      if (loop.mode === 'parallel') await Promise.all(rounds.map(runRound));
      else for (const round of rounds) await runRound(round);
      loop.runStatus = 'done';
    } catch (error) {
      loop.runStatus = signal.aborted ? 'stopped' : 'failed';
      loop.runError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      loop.running = false;
      loop.activeRound = undefined;
      loop.currentImages = undefined;
      loop.currentPrompt = undefined;
      loop.runFinishedAt = Date.now();
      await emit(document, onUpdate);
    }
  };

  const executeImage = async (document: CanvasDocument, node: CanvasNode, signal: AbortSignal, onUpdate?: RuntimeUpdate, append = false, context?: LoopExecutionContext) => {
    const settings = smartSettings(node);
    const input = collectSmartInputs(document, node, context);
    const prompt = input.prompts.join('\n\n').trim() || String(node.runModelPrompt || node.runPrompt || node.promptDraftText || '');
    const engine = String(settings.engine || 'api');
    const video = (engine === 'api' || engine === 'volcengine') && String(settings.apiKind || 'image') === 'video';
    if (!prompt && !(engine === 'comfy' && String(settings.comfyMode || settings.mode || 'text') !== 'text') && !input.media.some((item) => item.kind === 'image')) throw new Error('缺少提示词输入');
    const expected = engine === 'api' || engine === 'volcengine' || engine === 'modelscope' ? Math.max(1, Math.min(8, Number(settings.count || 1))) : 1;
    activeImageRuns.set(node, (activeImageRuns.get(node) || 0) + 1);
    node.running = true;
    node.pending = video ? 1 : expected;
    node.runStartedAt = Date.now();
    node.runStatus = 'running';
    node.runError = '';
    await emit(document, onUpdate);
    let request: unknown = {};
    try {
      let outputs: SmartMedia[] = [];
      if (engine === 'comfy') {
        const result = await executeComfy(settings, prompt, input.media, signal);
        request = result.request;
        outputs = result.outputs;
      } else if (engine === 'modelscope') {
        const result = await executeModelScope(settings, prompt, input.media, signal);
        request = result.request;
        outputs = result.outputs;
      } else if (video) {
        const payload = videoPayload(settings, prompt, input.media, getConfig());
        request = payload;
        const result = await post<Record<string, unknown>>('/api/canvas-video', payload, signal);
        outputs = extractSmartOutputs(result, 'video');
      } else {
        const payload = imagePayload(settings, prompt, input.media);
        request = payload;
        outputs = await executeImageTasks(document, node, settings, payload, signal, onUpdate);
        if (smartPendingTasks(node).some((task) => task.failed && task.recoverTaskId)) return;
      }
      if (!outputs.length) throw new Error(video ? '没有返回视频' : '没有返回图片');
      finishSmartNode(document, node, outputs, append);
      appendLog(document, node, request, outputs, '');
    } catch (error) {
      if (signal.aborted) {
        node.runStatus = 'stopped';
        node.runError = '执行已停止';
      } else failNode(document, node, error, request);
      throw error;
    } finally {
      const remainingRuns = Math.max(0, (activeImageRuns.get(node) || 1) - 1);
      if (remainingRuns) activeImageRuns.set(node, remainingRuns);
      else activeImageRuns.delete(node);
      node.running = remainingRuns > 0;
      if (!smartPendingTasks(node).length) node.pending = 0;
      await emit(document, onUpdate);
    }
  };

  const executeImageTasks = async (document: CanvasDocument, node: CanvasNode, settings: Record<string, unknown>, payload: Record<string, unknown>, signal: AbortSignal, onUpdate?: RuntimeUpdate) => {
    const count = Math.max(1, Math.min(8, Number(settings.count || 1)));
    const submissions = await Promise.all(Array.from({ length: count }, () => post<CanvasTaskRecord>('/api/canvas-image-tasks', payload, signal)));
    const pendingTasks = submissions.map((task) => ({
      taskId: String(task.task_id || task.id || ''), kind: 'image', providerId: payload.provider_id, model: payload.model, startedAt: Date.now(),
    })).filter((task) => task.taskId);
    node.pendingTasks = [...smartPendingTasks(node), ...pendingTasks];
    node.pending = smartPendingTasks(node).length;
    node.running = false;
    await emit(document, onUpdate);
    const outputs: SmartMedia[] = [];
    for (const task of [...smartPendingTasks(node)]) {
      throwIfAborted(signal);
      const record = await taskClient.wait('image', String(task.taskId), { signal });
      const applied = applyTaskRecord(node, task, record);
      outputs.push(...applied);
      await emit(document, onUpdate);
    }
    return outputs;
  };

  const executeModelScope = async (settings: Record<string, unknown>, prompt: string, refs: SmartMedia[], signal: AbortSignal) => {
    const modelKey = String(settings.msgenModel || 'zimage');
    const spec = modelKey === 'qwen_edit'
      ? { accepts: true, endpoint: '/api/angle/generate', model: 'Qwen/Qwen-Image-Edit-2511', needs: true }
      : modelKey === 'klein_edit'
        ? { accepts: true, endpoint: '/api/ms/generate', model: 'black-forest-labs/FLUX.2-klein-9B', needs: true }
        : modelKey === 'custom'
          ? { accepts: true, endpoint: '/api/ms/generate', model: String(settings.msCustomModel || ''), needs: false }
          : { accepts: false, endpoint: '/generate', model: 'Tongyi-MAI/Z-Image-Turbo', needs: false };
    const images = refs.filter((item) => item.kind === 'image').slice(0, 3);
    if (spec.needs && !images.length) throw new Error('当前 ModelScope 模型需要图片输入');
    const size = smartImageSize(settings, 'ms');
    const [width, height] = size.split('x').map(Number);
    const imageUrls: string[] = [];
    if (spec.accepts) for (const image of images) imageUrls.push(await urlToDataUrl(fetcher, image.url, signal).catch(() => image.url));
    const body: Record<string, unknown> = modelKey === 'zimage' ? { prompt, resolution: size }
      : modelKey === 'qwen_edit' ? { prompt, image_urls: imageUrls, resolution: size }
        : { prompt, model: spec.model, image_urls: imageUrls, width, height, size };
    const count = Math.max(1, Math.min(8, Number(settings.count || 1)));
    const results = await Promise.all(Array.from({ length: count }, () => post<Record<string, unknown>>(spec.endpoint, body, signal)));
    return { request: body, outputs: results.flatMap((result) => extractSmartOutputs(result, 'image')) };
  };

  const executeComfy = async (settings: Record<string, unknown>, prompt: string, refs: SmartMedia[], signal: AbortSignal) => {
    const mode = String(settings.comfyMode || settings.mode || 'text');
    if (mode === 'text') {
      const request = { prompt, width: Number(settings.width || 1024), height: Number(settings.height || 1024), workflow_json: 'Z-Image.json', type: 'zimage' };
      return { request, outputs: extractSmartOutputs(await post('/api/generate', request, signal), 'image') };
    }
    if (mode === 'enhance') {
      const image = requireSmartMedia(refs, 'image', 'Comfy 增强');
      const request = { workflow_json: 'Z-Image-Enhance.json', type: 'enhance', params: { '15': { image: await comfyName(image, signal) }, '204': { value: Number(settings.enhanceStrength ?? 0.5) } } };
      return { request, outputs: extractSmartOutputs(await post('/api/generate', request, signal), 'image') };
    }
    if (mode === 'edit') {
      const images = refs.filter((item) => item.kind === 'image').slice(0, 3);
      if (!images.length) throw new Error('Comfy 编辑需要图片输入');
      const names = await Promise.all(images.map((image) => comfyName(image, signal)));
      const request = { prompt, workflow_json: 'Flux2-Klein.json', type: 'klein', params: { '168': { text: prompt }, '158': { noise_seed: Math.floor(Math.random() * 1_000_000) }, '278': { image: names[0] || '' }, '270': { image: names[1] || '' }, '292': { image: names[2] || '' }, '313': { value: Boolean(names[1]) }, '314': { value: Boolean(names[2]) } } };
      return { request, outputs: extractSmartOutputs(await post('/api/generate', request, signal), 'image') };
    }
    const workflow = String(settings.comfyWorkflow || '');
    if (!workflow) throw new Error('请选择 ComfyUI 工作流');
    const detail = await getWorkflow(workflow);
    const config = detail.config && typeof detail.config === 'object' ? detail.config as Record<string, unknown> : { fields: [] };
    const fields = Array.isArray(config.fields) ? config.fields as Array<Record<string, unknown>> : [];
    const values: Record<string, unknown> = {};
    const queues = new Map<MediaKind, SmartMedia[]>(['image', 'video', 'audio'].map((kind) => [kind as MediaKind, refs.filter((item) => item.kind === kind)]));
    const offsets = new Map<MediaKind, number>();
    for (const field of fields) {
      const id = String(field.id || '');
      if (!id) continue;
      const kind = comfyFieldKind(field);
      if (kind === 'prompt') values[id] = prompt;
      else if (kind === 'image' || kind === 'video' || kind === 'audio') {
        const offset = offsets.get(kind) || 0;
        const ref = queues.get(kind)?.[offset];
        offsets.set(kind, offset + 1);
        values[id] = ref ? await comfyName(ref, signal) : '';
      } else values[id] = (settings.comfyParams as Record<string, unknown> | undefined)?.[id] ?? field.default;
    }
    const request = { config, fields: values };
    return { request, outputs: extractSmartOutputs(await post(`/api/workflows/${encodeURIComponent(workflow)}/run`, request, signal), 'image') };
  };

  const comfyName = async (ref: SmartMedia, signal: AbortSignal) => {
    if (ref.comfy_name) return String(ref.comfy_name);
    const response = await fetcher(ref.url, { signal });
    if (!response.ok) return ref.name || ref.url;
    const form = new FormData();
    form.append('files', new File([await response.blob()], ref.name || 'smart-ref.png'));
    const result = await requestJson<{ files?: Array<{ comfy_name?: string }> }>(fetcher, '/api/upload', { method: 'POST', body: form }, { signal });
    return String(result.files?.[0]?.comfy_name || ref.name || ref.url);
  };

  return { canHandle, recoverDocument, runCommand, runNode };
}

function smartSettings(node: CanvasNode): Record<string, unknown> {
  const settings = node.runSettings && typeof node.runSettings === 'object' ? structuredClone(node.runSettings as Record<string, unknown>) : {};
  const engine = String(settings.engine || 'api');
  return {
    ...settings,
    engine,
    apiKind: settings.apiKind || 'image',
    provider_id: settings.provider_id || settings.apiProvider || (engine === 'volcengine' ? 'volcengine' : ''),
    videoProvider: settings.videoProvider || settings.apiProvider || (engine === 'volcengine' ? 'volcengine' : ''),
    videoModel: settings.videoModel || settings.model || '',
    videoDuration: settings.videoDuration ?? settings.duration ?? 5,
    videoAspect: settings.videoAspect || settings.aspectRatio || '16:9',
    videoResolution: settings.videoResolution || settings.resolution || '',
    comfyMode: settings.comfyMode || settings.mode || 'text',
  };
}

function imagePayload(settings: Record<string, unknown>, prompt: string, refs: SmartMedia[]) {
  const provider = String(settings.provider_id || '');
  const model = String(settings.model || '');
  if (!provider || !model) throw new Error('请选择 API 平台和模型');
  return { prompt, provider_id: provider, model, size: smartImageSize(settings), quality: settings.quality || 'auto', n: 1, reference_images: refs.filter((item) => item.kind === 'image') };
}

function videoPayload(settings: Record<string, unknown>, prompt: string, refs: SmartMedia[], config: { api_providers?: Array<Record<string, unknown>> }) {
  const provider = String(settings.videoProvider || 'comfly');
  const model = String(settings.videoModel || 'veo3-fast');
  if (!model) throw new Error('请选择视频模型');
  const definition = (config.api_providers || []).find((item) => item.id === provider);
  const volcengine = provider === 'volcengine' || String(definition?.protocol || '').toLowerCase() === 'volcengine';
  const effective = (item: SmartMedia) => volcengine ? String((item.asset_uris as Record<string, unknown> | undefined)?.volcengine || item.url) : String(item.uploadedUrl || item.url);
  const frameRoles = !volcengine && Boolean(settings.videoUseFrameRoles);
  const images = refs.filter((item) => item.kind === 'image').map((item, index) => ({
    url: effective(item), name: item.name || `图${index + 1}`, ...(frameRoles && index < 2 ? { role: index === 0 ? 'first_frame' : 'last_frame' } : {}),
  }));
  const manual = Array.isArray(settings.videoTempShLinks) ? (settings.videoTempShLinks as Array<Record<string, unknown>>).filter((item) => item.manual && item.url).map((item) => String(item.url)) : [];
  const videos = manual.length ? manual : refs.filter((item) => item.kind === 'video').map(effective);
  const audios = refs.filter((item) => item.kind === 'audio').map(effective);
  const seedance25 = model.toLowerCase().replaceAll('_', '-').replaceAll('.', '-').includes('seedance-2-5');
  const rawDuration = Number(settings.videoDuration);
  const duration = seedance25 && rawDuration === -1 ? -1 : Math.max(seedance25 ? 4 : 1, Math.min(seedance25 ? 30 : 60, rawDuration || 5));
  return {
    prompt, provider_id: provider, model, duration, aspect_ratio: settings.videoAspect || '16:9', resolution: settings.videoResolution || '', images, videos, audios,
    enhance_prompt: Boolean(settings.videoEnhancePrompt ?? settings.enhancePrompt), enable_upsample: Boolean(settings.videoEnableUpsample ?? settings.enableUpsample), watermark: Boolean(settings.videoWatermark ?? settings.watermark),
    camerafixed: Boolean(settings.videoCameraFixed ?? settings.cameraFixed), generate_audio: Boolean(settings.videoGenerateAudio ?? settings.generateAudio), multimodal: Boolean(settings.videoMultimodal ?? settings.multimodal),
    trusted_asset: [...images.map((item) => item.url), ...videos, ...audios].some((url) => url.startsWith('asset://')), task_mode: settings.videoTaskMode || settings.taskMode || 'auto',
  };
}

function smartImageSize(settings: Record<string, unknown>, prefix = ''): string {
  const ratio = String(settings[prefix ? `${prefix}Ratio` : 'ratio'] || 'square');
  const resolution = String(settings[prefix ? `${prefix}Resolution` : 'resolution'] || '1k');
  const custom = String(settings[prefix ? `${prefix}CustomSize` : 'customSize'] || '');
  if (resolution === 'custom' && /^\d{2,5}x\d{2,5}$/i.test(custom)) return custom;
  return SIZE_MAP[ratio]?.[resolution] || SIZE_MAP.square[resolution] || SIZE_MAP.square['1k'];
}

function collectSmartInputs(document: CanvasDocument, target: CanvasNode, context?: LoopExecutionContext): { media: SmartMedia[]; prompts: string[] } {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const sources = document.connections.filter((edge) => edge.to === target.id && String(edge.kind || 'flow') !== 'history').map((edge) => byId.get(edge.from)).filter(Boolean) as CanvasNode[];
  const prompts: string[] = [];
  const media: SmartMedia[] = [];
  const addMedia = (value: unknown, fallback = 'image') => {
    if (!value) return;
    const item = typeof value === 'string' ? { url: value } : value as Record<string, unknown>;
    const url = String(item.url || item.sourceUrl || item.localUrl || '');
    if (!url) return;
    const kind = mediaKind(item, fallback);
    media.push({ ...item, kind, name: String(item.name || `${kind}-${media.length + 1}`), url });
  };
  sources.forEach((node) => {
    if (node.type === 'prompt' && node.text) prompts.push(String(node.text));
    if (node.type === 'loop') {
      const activeContext = context?.loopId === node.id ? context : undefined;
      const prompt = activeContext?.prompt ?? node.currentPrompt;
      const images = activeContext?.images ?? (Array.isArray(node.currentImages) ? node.currentImages : []);
      if (prompt) prompts.push(String(prompt));
      images.forEach((item) => addMedia(item));
    }
    if (node.type === 'smart-image') (Array.isArray(node.images) ? node.images : []).forEach((item) => addMedia(item));
  });
  (Array.isArray(target.runInputRefs) ? target.runInputRefs : []).forEach((item) => addMedia(item));
  (Array.isArray(target.runPromptRefs) ? target.runPromptRefs : []).forEach((item) => addMedia(item));
  if (target.type === 'smart-image') (Array.isArray(target.images) ? target.images : []).forEach((item) => addMedia(item));
  if (target.runModelPrompt || target.runPrompt || target.promptDraftText) prompts.push(String(target.runModelPrompt || target.runPrompt || target.promptDraftText));
  const seen = new Set<string>();
  return { prompts: prompts.map((item) => item.trim()).filter(Boolean), media: media.filter((item) => Boolean(item.url && !seen.has(item.url) && seen.add(item.url))) };
}

function smartCascadeOrder(document: CanvasDocument, targetId: string): string[] {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    document.connections.filter((edge) => edge.to === id && String(edge.kind || 'flow') !== 'history').forEach((edge) => visit(edge.from));
    const node = byId.get(id);
    if (node && (node.type === 'smart-image' && (id === targetId || node.runSettings) || node.type === 'prompt' && node.llmEnabled)) order.push(id);
  };
  visit(targetId);
  return order;
}

function downstreamSmartTarget(document: CanvasDocument, sourceId: string): CanvasNode | null {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const seen = new Set([sourceId]);
  const queue = [sourceId];
  const reachable: CanvasNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    document.connections.filter((edge) => edge.from === id && String(edge.kind || 'flow') !== 'history').forEach((edge) => {
      if (seen.has(edge.to)) return;
      seen.add(edge.to);
      const node = byId.get(edge.to);
      if (node) { reachable.push(node); queue.push(node.id); }
    });
  }
  return reachable.filter((node) => node.type === 'smart-image').at(-1) || null;
}

function loopPromptForRound(loop: CanvasNode, round: number): string {
  const fields = Array.isArray(loop.variablePrompts) ? loop.variablePrompts.map(String) : String(loop.variablePrompt || '').split(/\r?\n/);
  const index = Math.max(0, round - Math.max(1, Number(loop.loopStart || 1)));
  return String(fields[index % Math.max(1, fields.length)] || '').replaceAll('《计数》', String(round)).replaceAll('《进度》', `${index + 1}/${Math.max(1, Number(loop.count || 1))}`);
}

function loopImagesForRound(document: CanvasDocument, loop: CanvasNode, round: number): SmartMedia[] {
  const input = collectSmartInputs(document, loop).media.filter((item) => item.kind === 'image');
  const start = Math.max(0, Number(loop.loopStart || 1) - 1 + round - Math.max(1, Number(loop.loopStart || 1)));
  return input.slice(start, start + Math.max(1, Number(loop.imageBatchSize || 1)));
}

function smartPendingTasks(node: CanvasNode): Array<Record<string, unknown>> {
  return Array.isArray(node.pendingTasks) ? node.pendingTasks.filter((task): task is Record<string, unknown> => Boolean(task && typeof task === 'object' && (task as Record<string, unknown>).taskId)) : [];
}

function applyTaskRecord(node: CanvasNode, task: Record<string, unknown>, record: CanvasTaskRecord): SmartMedia[] {
  if (record.status === 'succeeded') {
    const outputs = extractSmartOutputs(record.result, String(task.kind || 'image') as MediaKind);
    node.pendingTasks = smartPendingTasks(node).filter((item) => item.taskId !== task.taskId);
    node.pending = smartPendingTasks(node).length;
    return outputs;
  }
  task.failed = true;
  task.recoveryStatus = record.status;
  task.error = record.error || `任务状态：${record.status}`;
  if (record.upstream_task_id) task.recoverTaskId = record.upstream_task_id;
  if (!task.recoverTaskId) {
    node.pendingTasks = smartPendingTasks(node).filter((item) => item.taskId !== task.taskId);
    node.pending = smartPendingTasks(node).length;
  }
  node.running = false;
  node.runStatus = 'failed';
  node.runError = String(task.error);
  return [];
}

function finishSmartNode(document: CanvasDocument, node: CanvasNode, outputs: SmartMedia[], append: boolean) {
  const existing = (Array.isArray(node.images) ? node.images : []).filter(Boolean) as unknown[];
  if (existing.length && !append) archiveSmartHistory(document, node, existing);
  node.images = append ? [...existing, ...outputs] : outputs;
  node.pendingTasks = undefined;
  node.pending = 0;
  node.running = false;
  node.runStatus = 'done';
  node.runError = '';
  node.runFinishedAt = Date.now();
  node.runElapsedMs = Math.max(0, Number(node.runFinishedAt) - Number(node.runStartedAt || node.runFinishedAt));
  node.outputKind = outputs[0]?.kind || 'image';
  const imageCount = Array.isArray(node.images) ? node.images.length : 0;
  node.title = imageCount > 1 ? (node.outputKind === 'video' ? 'Videos' : 'Group') : node.outputKind === 'video' ? 'Video' : 'Image';
  node.scale = imageCount > 1 ? 0.8 : 2;
  node.w = undefined;
  node.h = undefined;
}

function archiveSmartHistory(document: CanvasDocument, node: CanvasNode, images: unknown[]) {
  let history = document.nodes.find((item) => item.type === 'smart-image' && item.historyFor === node.id);
  if (!history) {
    history = { id: uniqueId('smart-history'), type: 'smart-image', title: '历史分组', historyFor: node.id, isHistoryGroup: true, images: [], scale: 0.8, x: Number(node.x || 0), y: Number(node.y || 0) + 260 };
    document.nodes.push(history);
    document.connections.push({ from: node.id, to: history.id, kind: 'history' });
  }
  history.images = [...(Array.isArray(history.images) ? history.images : []), ...images];
}

function failNode(document: CanvasDocument, node: CanvasNode, error: unknown, request: unknown) {
  node.running = false;
  node.pending = smartPendingTasks(node).length;
  node.runStatus = 'failed';
  node.runError = error instanceof Error ? error.message : String(error);
  node._cascadeFailed = true;
  appendLog(document, node, request, [], String(node.runError || ''));
}

function appendLog(document: CanvasDocument, node: CanvasNode, request: unknown, outputs: SmartMedia[], error: string) {
  const logs = Array.isArray(document.logs) ? document.logs as Array<Record<string, unknown>> : [];
  document.logs = [{ id: uniqueId('log'), createdAt: Date.now(), status: error ? 'failed' : 'success', nodeId: node.id, nodeType: node.type, request, outputs, error }, ...logs].slice(0, 500);
}

function extractSmartOutputs(value: unknown, fallback: MediaKind): SmartMedia[] {
  const items: SmartMedia[] = [];
  const visit = (entry: unknown) => {
    if (!entry) return;
    if (typeof entry === 'string') { if (/^(https?:\/\/|\/|data:|blob:)/i.test(entry)) items.push({ kind: mediaKind({ url: entry }, fallback), name: `output-${items.length + 1}`, url: entry }); return; }
    if (Array.isArray(entry)) { entry.forEach(visit); return; }
    if (typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const direct = record.url || record.path || record.src || record.uri || record.output_url || record.video_url;
    if (typeof direct === 'string') items.push({ ...record, kind: mediaKind(record, fallback), name: String(record.name || `output-${items.length + 1}`), url: direct });
    ['images', 'videos', 'audios', 'files', 'texts', 'outputs', 'items', 'data', 'result', 'output'].forEach((key) => visit(record[key]));
  };
  visit(value);
  const seen = new Set<string>();
  return items.filter((item) => Boolean(item.url && !seen.has(item.url) && seen.add(item.url)));
}

function mediaKind(item: Record<string, unknown>, fallback = 'image'): MediaKind {
  const value = String(item.kind || item.type || fallback).toLowerCase();
  const url = String(item.url || '').toLowerCase();
  if (value.includes('video') || /\.(mp4|webm|mov|m4v)(\?|$)/.test(url)) return 'video';
  if (value.includes('audio') || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(url)) return 'audio';
  if (value.includes('text') || /\.(txt|json|md)(\?|$)/.test(url)) return 'text';
  return 'image';
}

function comfyFieldKind(field: Record<string, unknown>): MediaKind | 'prompt' | 'setting' {
  if (field.type === 'image' || field.type === 'video' || field.type === 'audio') return field.type;
  const key = `${String(field.input || '')} ${String(field.name || '')}`.toLowerCase();
  if (field.type === 'textarea' || /prompt|text|提示词|正向|负向/.test(key)) return 'prompt';
  return 'setting';
}

function requireSmartMedia(refs: SmartMedia[], kind: MediaKind, operation: string) {
  const item = refs.find((ref) => ref.kind === kind);
  if (!item) throw new Error(`${operation}需要${kind === 'image' ? '图片' : kind}输入`);
  return item;
}

async function urlToDataUrl(fetcher: Fetcher, url: string, signal: AbortSignal): Promise<string> {
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error('读取图片失败');
  const bytes = new Uint8Array(await (await response.blob()).arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `data:${response.headers.get('content-type') || 'application/octet-stream'};base64,${btoa(binary)}`;
}

function throwIfAborted(signal: AbortSignal) { if (signal.aborted) throw new Error('执行已停止'); }
function uniqueId(prefix: string) { return `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`; }
