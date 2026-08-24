import type { CanvasNode } from './types';

export interface OutputPreviewItem {
  kind: 'image' | 'video';
  meta: Record<string, unknown>;
  name: string;
  url: string;
}

export function outputItemUrl(item: unknown): string {
  return typeof item === 'string' ? item : String(record(item).url || '');
}

export function outputItemKind(item: unknown): string {
  const source = record(item);
  const explicit = String(source.kind || source.mediaKind || '').toLowerCase();
  if (explicit) return explicit;
  const clean = outputItemUrl(item).split(/[?#]/, 1)[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v)$/.test(clean)) return 'video';
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(clean)) return 'audio';
  return 'image';
}

export function outputPreviewItems(node: CanvasNode): OutputPreviewItem[] {
  const source = node.type === 'image' && node.url
    ? [{ kind: node.mediaKind || 'image', name: node.name, url: node.url }]
    : Array.isArray(node.images) ? node.images : [];
  return source.map((item, index) => {
    const meta = record(item);
    const url = outputItemUrl(item);
    const kind = outputItemKind(item);
    if (!url || (kind !== 'image' && kind !== 'video')) return null;
    return {
      kind,
      meta,
      name: String(meta.name || url.split(/[?#]/, 1)[0].split('/').pop() || `output-${index + 1}`),
      url,
    } as OutputPreviewItem;
  }).filter((item): item is OutputPreviewItem => Boolean(item));
}

export function outputPreviewMeta(node: CanvasNode, url: string): Record<string, unknown> {
  const item = (Array.isArray(node.images) ? node.images : []).find((candidate) => outputItemUrl(candidate) === url);
  return record(item);
}

export function outputComparisonUrl(node: CanvasNode, url: string): string {
  const comparisons = record(node.imageComparisons);
  const comparison = comparisons[url];
  if (typeof comparison === 'string') return comparison;
  const comparisonUrl = String(record(comparison).url || '');
  if (comparisonUrl) return comparisonUrl;
  const run = record(outputPreviewMeta(node, url).run);
  const reference = (Array.isArray(run.refs) ? run.refs : []).map(record).find((item) => item.url);
  return String(reference?.url || '');
}

export function formatOutputRunDuration(value: unknown): string {
  const seconds = Math.max(0, Math.round(Number(value || 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${String(remainder).padStart(2, '0')}s` : `${remainder}s`;
}

export function outputDownloadName(url: string, now = Date.now()): string {
  const clean = String(url || '').split(/[?#]/, 1)[0];
  const extension = clean.includes('.') ? clean.split('.').pop() : 'png';
  return `canvas-output-${now}.${extension || 'png'}`;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}
