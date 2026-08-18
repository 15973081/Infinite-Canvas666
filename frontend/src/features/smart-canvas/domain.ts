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
    const needsGenerator = incoming.length > 0 || Boolean(node.runSettings) || images.length === 0;
    const output: CanvasNode = {
      ...node,
      type: 'output',
      images,
      imageComparisons: node.imageComparisons && typeof node.imageComparisons === 'object' ? node.imageComparisons : {},
    };
    delete output.url;
    migrated.push(output);
    if (!needsGenerator) return;

    const generatorId = `${node.id}__generator`;
    connections.forEach((edge) => { if (edge.to === node.id) edge.to = generatorId; });
    connections.push({ from: generatorId, to: node.id });
    migrated.push({
      ...generatorFromSettings(settings),
      id: generatorId,
      legacySmartNodeId: node.id,
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
    count: number(settings.count, 1),
  };
  if (engine === 'comfy') return {
    ...settings,
    type: 'comfy',
    comfyWorkflow: settings.comfyWorkflow || settings.workflow || '',
    comfyParams: settings.comfyParams || {},
    width: number(settings.width, 1024),
    height: number(settings.height, 1024),
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
  };
  return {
    ...settings,
    type: 'generator',
    apiProvider: settings.provider_id || settings.providerId || settings.apiProvider || '',
    model: settings.model || '',
    ratio: settings.apiRatio || settings.ratio || 'square',
    resolution: settings.apiResolution || settings.resolution || '1k',
    count: number(settings.count, 1),
  };
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
