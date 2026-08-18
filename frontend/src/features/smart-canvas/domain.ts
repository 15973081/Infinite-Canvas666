import type { CanvasDocument, CanvasEdge, CanvasNode } from '../../canvas/domain/types';

const legacyTypes = new Set(['smart-image', 'smart-prompt', 'smart-loop']);

export function migrateLegacySmartDocument(document: CanvasDocument): CanvasDocument {
  if (String(document.kind || '') !== 'smart' || !document.nodes.some((node) => legacyTypes.has(node.type) || !node.type)) return document;
  const original = structuredClone(document);
  const connections = structuredClone(original.connections);
  const migrated: CanvasNode[] = [];

  original.nodes.forEach((node) => {
    if (node.type === 'smart-prompt') {
      migrated.push({ ...node, type: 'prompt', text: String(node.text || node.prompt || '') });
      return;
    }
    if (node.type === 'smart-loop') {
      migrated.push({ ...node, type: 'loop', count: Math.max(1, Number(node.count || node.loopCount || 1)) });
      return;
    }
    if (node.type && node.type !== 'smart-image') {
      migrated.push(node);
      return;
    }

    const images = legacyImages(node);
    const incoming = connections.filter((edge) => edge.to === node.id);
    const settings = settingsFor(node, original);
    const historyOnly = Boolean(node.isHistoryGroup || node.historyFor);
    const needsGenerator = !historyOnly && (incoming.length > 0 || Boolean(node.runSettings) || images.length === 0 || legacyPendingTasks(node).length > 0);
    const generatorId = `${node.id}__generator`;
    const pending = needsGenerator ? migratePendingTasks(node, generatorId, settings) : [];
    const output: CanvasNode = {
      ...node,
      type: 'output',
      images,
      imageComparisons: node.imageComparisons && typeof node.imageComparisons === 'object' ? node.imageComparisons : {},
      _pending: pending.length ? pending : Array.isArray(node._pending) ? node._pending : [],
      running: false,
    };
    delete output.url;
    delete output.pendingTasks;
    delete output.pending;
    delete output.queued;
    migrated.push(output);
    if (!needsGenerator) return;

    connections.forEach((edge) => { if (edge.to === node.id) edge.to = generatorId; });
    connections.push({ from: generatorId, to: node.id });
    migrated.push({
      ...generatorFromSettings(settings),
      id: generatorId,
      legacySmartNodeId: node.id,
      runError: pending.length ? '检测到刷新前未完成的任务，正在恢复' : '',
      runStatus: pending.length ? 'recovering' : undefined,
      x: Number(node.x || 0) - 420,
      y: Number(node.y || 0),
    });
  });

  return {
    ...original,
    connections: uniqueConnections(connections),
    nodes: migrated,
    schemaVersion: Math.max(1, Number(original.schemaVersion || 1)),
    smartV2Migrated: true,
  };
}

function legacyImages(node: CanvasNode): Array<Record<string, unknown>> {
  const values = Array.isArray(node.images) ? node.images : node.url ? [{ url: node.url, name: node.name, kind: node.kind }] : [];
  return values.flatMap((value) => {
    if (typeof value === 'string') return [{ url: value, name: 'Image', kind: 'image' }];
    if (!value || typeof value !== 'object') return [];
    const image = value as Record<string, unknown>;
    const url = String(image.url || image.src || '').trim();
    return url ? [{ ...image, url, kind: image.kind || mediaKind(url) }] : [];
  });
}

function settingsFor(node: CanvasNode, document: CanvasDocument): Record<string, unknown> {
  const global = document.settings && typeof document.settings === 'object' ? document.settings as Record<string, unknown> : {};
  const local = node.settings && typeof node.settings === 'object' ? node.settings as Record<string, unknown> : {};
  const run = node.runSettings && typeof node.runSettings === 'object' ? node.runSettings as Record<string, unknown> : {};
  return { ...global, ...local, ...run };
}

function generatorFromSettings(settings: Record<string, unknown>): Record<string, unknown> & { type: string } {
  const engine = String(settings.engine || 'api').toLowerCase();
  const apiKind = String(settings.apiKind || settings.kind || 'image').toLowerCase();
  if (engine === 'modelscope') return {
    ...settings,
    type: 'msgen',
    msgenModel: settings.msgenModel || settings.msModel || 'zimage',
    msCustomModel: settings.msCustomModel || settings.model || '',
    msWidth: number(settings.msWidth || settings.width, 1024),
    msHeight: number(settings.msHeight || settings.height, 1024),
    msRatio: settings.msRatio || settings.ratio || 'square',
    msResolution: settings.msResolution || settings.resolution || '1k',
    msCustomRatio: settings.msCustomRatio || settings.customRatio || '',
    msCustomSize: settings.msCustomSize || settings.customSize || '',
    msLoraEnabled: Boolean(settings.msLoraEnabled),
    msLoraId: settings.msLoraId || '',
    msLoraStrength: number(settings.msLoraStrength, 0.8),
    count: number(settings.count, 1),
  };
  if (engine === 'comfy') return {
    ...settings,
    type: 'comfy',
    mode: settings.comfyMode || settings.mode || 'text',
    comfyWorkflow: settings.comfyWorkflow || settings.workflow || '',
    comfyParams: settings.comfyParams || {},
    comfyRandomActive: settings.comfyRandomActive || {},
    width: number(settings.width, 1024),
    height: number(settings.height, 1024),
    enhanceStrength: number(settings.enhanceStrength, 0.5),
    enhanceUpscale: Boolean(settings.enhanceUpscale),
    enhanceUpscaleRes: number(settings.enhanceUpscaleRes, 2048),
    editUpscale: Boolean(settings.editUpscale),
    editUpscaleRes: number(settings.editUpscaleRes, 2048),
    count: number(settings.count, 1),
  };
  if (apiKind === 'video') return {
    ...settings,
    type: 'video',
    apiProvider: settings.videoProvider || settings.provider_id || settings.providerId || '',
    model: settings.videoModel || settings.model || '',
    duration: number(settings.videoDuration || settings.duration, 5),
    aspectRatio: settings.videoAspect || settings.aspectRatio || '16:9',
    resolution: settings.videoResolution || settings.resolution || '',
    enhancePrompt: Boolean(settings.videoEnhancePrompt || settings.enhancePrompt),
    enableUpsample: Boolean(settings.videoEnableUpsample || settings.enableUpsample),
    watermark: Boolean(settings.videoWatermark || settings.watermark),
    cameraFixed: Boolean(settings.videoCameraFixed || settings.cameraFixed),
    generateAudio: Boolean(settings.videoGenerateAudio || settings.generateAudio),
    multimodal: Boolean(settings.videoMultimodal || settings.multimodal),
    taskMode: settings.videoTaskMode || settings.taskMode || 'auto',
    useFrameRoles: Boolean(settings.videoUseFrameRoles || settings.useFrameRoles),
    manualVideoUrls: settings.videoManualUrls || settings.manualVideoUrls || [],
    tempShLinks: settings.videoTempShLinks || settings.tempShLinks || [],
  };
  return {
    ...settings,
    type: 'generator',
    apiProvider: settings.provider_id || settings.providerId || settings.apiProvider || '',
    model: settings.model || '',
    ratio: settings.apiRatio || settings.ratio || 'square',
    resolution: settings.apiResolution || settings.resolution || '1k',
    quality: settings.quality || 'auto',
    customRatio: settings.customRatio || '',
    customSize: settings.customSize || '',
    customWidth: settings.customWidth || '',
    customHeight: settings.customHeight || '',
    count: number(settings.count, 1),
  };
}

function legacyPendingTasks(node: CanvasNode): Array<Record<string, unknown>> {
  return Array.isArray(node.pendingTasks)
    ? node.pendingTasks.filter((task): task is Record<string, unknown> => Boolean(task && typeof task === 'object' && (task as Record<string, unknown>).taskId))
    : [];
}

function migratePendingTasks(node: CanvasNode, generatorId: string, settings: Record<string, unknown>): Array<Record<string, unknown>> {
  const type = generatorFromSettings(settings).type;
  return legacyPendingTasks(node).map((task, index) => {
    const taskId = String(task.taskId || '');
    const kind = String(task.kind || (type === 'video' ? 'video' : 'image')) === 'video' ? 'video' : 'image';
    return {
      ...task,
      canvasTaskId: taskId,
      canvasTaskType: kind,
      id: String(task.id || `legacy_pending_${taskId || index}`),
      nodeId: generatorId,
      recoveryStatus: 'interrupted',
      startedAt: Number(task.startedAt || node.runStartedAt || Date.now()),
      type,
    };
  });
}

function uniqueConnections(connections: CanvasEdge[]): CanvasEdge[] {
  const seen = new Set<string>();
  return connections.filter((edge) => {
    const key = `${edge.from}|${edge.to}|${edge.kind || ''}`;
    if (!edge.from || !edge.to || edge.from === edge.to || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mediaKind(url: string): string {
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
  if (/\.(mp3|wav|m4a|ogg)(\?|$)/i.test(url)) return 'audio';
  return 'image';
}

function number(value: unknown, fallback: number): number {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : fallback;
}
