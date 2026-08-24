import type { CanvasDocument, CanvasNode } from '../domain/types';

export interface SmartCanvasReference {
  assetUris?: Record<string, string>;
  imageIndex: number;
  kind: 'image' | 'video';
  name: string;
  nodeId: string;
  url: string;
}

export interface SmartCanvasPromptReference {
  asset_uris?: Record<string, string>;
  imageIndex: number;
  kind: 'image' | 'video';
  name: string;
  nodeId: string;
  url: string;
}

export function smartCanvasReferenceKey(item: Pick<SmartCanvasReference, 'imageIndex' | 'nodeId' | 'url'>): string {
  return item.nodeId ? `${item.nodeId}|${item.imageIndex}` : `url|${item.url}`;
}

export function smartCanvasMentionCandidates(document: CanvasDocument | null, output: CanvasNode | null, generator: CanvasNode | null): SmartCanvasReference[] {
  if (!document || !output) return [];
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, string[]>();
  document.connections.forEach((edge) => incoming.set(edge.to, [...(incoming.get(edge.to) || []), edge.from]));
  const ordered: CanvasNode[] = [];
  const seenNodes = new Set<string>();
  const visit = (node: CanvasNode) => {
    if (seenNodes.has(node.id)) return;
    seenNodes.add(node.id);
    (incoming.get(node.id) || []).forEach((id) => {
      const source = byId.get(id);
      if (source) visit(source);
    });
    ordered.push(node);
  };
  visit(generator || output);
  if (!seenNodes.has(output.id)) ordered.push(output);
  return uniqueReferences(ordered.flatMap(referencesFromNode));
}

export function smartCanvasComposerReferences(document: CanvasDocument | null, output: CanvasNode | null, generator: CanvasNode | null): SmartCanvasReference[] {
  if (!document || !output) return [];
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const sources = generator
    ? document.connections.filter((edge) => edge.to === generator.id).map((edge) => byId.get(edge.from)).filter(Boolean) as CanvasNode[]
    : [];
  const promptRefs = promptReferencesFor(output).map((item) => ({
    assetUris: item.asset_uris,
    imageIndex: item.imageIndex,
    kind: item.kind,
    name: item.name,
    nodeId: item.nodeId,
    url: item.url,
  }));
  const items = uniqueReferences([...sources, output].flatMap(referencesFromNode).concat(promptRefs));
  const order = Array.isArray(output.inputRefOrder) ? output.inputRefOrder.map(String) : [];
  if (!order.length) return items.slice(0, 12);
  const rank = new Map(order.map((key, index) => [key, index]));
  return items.slice().sort((a, b) => (rank.get(smartCanvasReferenceKey(a)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(smartCanvasReferenceKey(b)) ?? Number.MAX_SAFE_INTEGER)).slice(0, 12);
}

export function promptReferencesFor(output: CanvasNode | null): SmartCanvasPromptReference[] {
  const raw = Array.isArray(output?.runPromptRefs) ? output.runPromptRefs : [];
  return raw.flatMap((value, index) => {
    const item = object(value);
    const url = String(item.url || '');
    const kind = mediaKind(url, item.kind);
    if (!url || kind === 'audio') return [];
    return [{
      asset_uris: object(item.asset_uris) as Record<string, string>,
      imageIndex: finiteIndex(item.imageIndex, index),
      kind,
      name: String(item.name || `图片${index + 1}`),
      nodeId: String(item.nodeId || ''),
      url,
    }];
  });
}

export function promptHtmlWithMentionTokens(text: string, refs: SmartCanvasPromptReference[]): string {
  const items = refs.filter((ref) => ref.url && ref.name).slice().sort((a, b) => b.name.length - a.name.length);
  if (!text || !items.length || !text.includes('@')) return '';
  let html = '';
  let index = 0;
  while (index < text.length) {
    if (text[index] === '@') {
      const hit = items.find((ref) => text.slice(index + 1, index + 1 + ref.name.length) === ref.name);
      if (hit) {
        html += mentionTokenHtml(hit);
        index += hit.name.length + 1;
        continue;
      }
    }
    html += escapeComposerText(text[index]);
    index += 1;
  }
  return html;
}

export function movedReferenceOrder(items: SmartCanvasReference[], from: number, to: number, placement: 'after' | 'before'): string[] {
  const ordered = items.map(smartCanvasReferenceKey);
  if (from < 0 || to < 0 || from >= ordered.length || to >= ordered.length || from === to) return ordered;
  const [moved] = ordered.splice(from, 1);
  let insertAt = ordered.indexOf(smartCanvasReferenceKey(items[to]));
  if (insertAt < 0) return items.map(smartCanvasReferenceKey);
  if (placement === 'after') insertAt += 1;
  ordered.splice(insertAt, 0, moved);
  return ordered;
}

function referencesFromNode(node: CanvasNode): SmartCanvasReference[] {
  const values: unknown[] = [];
  if (node.url) values.push({ kind: node.mediaKind, name: node.name, url: node.url });
  if (Array.isArray(node.images)) values.push(...node.images);
  if (Array.isArray(node.generatedOutputs)) values.push(...node.generatedOutputs);
  return values.flatMap((raw, index) => {
    const item = object(raw);
    const url = typeof raw === 'string' ? raw : String(item.url || item.path || item.src || '');
    const kind = mediaKind(url, item.kind || item.type || node.mediaKind);
    if (!url || kind === 'audio') return [];
    return [{
      assetUris: object(item.asset_uris) as Record<string, string>,
      imageIndex: index,
      kind,
      name: String(item.name || node.name || `图片${index + 1}`),
      nodeId: node.id,
      url,
    }];
  });
}

function uniqueReferences(items: SmartCanvasReference[]): SmartCanvasReference[] {
  const seen = new Set<string>();
  return items.filter((item) => Boolean(item.url && !seen.has(item.url) && seen.add(item.url)));
}

function mentionTokenHtml(item: SmartCanvasPromptReference): string {
  const media = item.kind === 'video'
    ? `<video muted playsinline preload="metadata" src="${escapeAttribute(item.url)}"></video>`
    : `<img alt="" draggable="false" src="${escapeAttribute(item.url)}">`;
  return `<span class="mention-image-token" contenteditable="false" data-url="${escapeAttribute(item.url)}" data-kind="${item.kind}" data-name="${escapeAttribute(item.name)}" data-node-id="${escapeAttribute(item.nodeId)}" data-image-index="${item.imageIndex}" data-asset-uris="${escapeAttribute(JSON.stringify(item.asset_uris || {}))}">${media}<span>${escapeComposerText(item.name)}</span></span>`;
}

function mediaKind(url: string, value: unknown): 'audio' | 'image' | 'video' {
  const kind = String(value || '').toLowerCase();
  if (kind === 'video' || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return 'video';
  if (kind === 'audio' || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url)) return 'audio';
  return 'image';
}

function finiteIndex(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function escapeAttribute(value: string): string {
  return escapeComposerText(value).replace(/"/g, '&quot;');
}

function escapeComposerText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
