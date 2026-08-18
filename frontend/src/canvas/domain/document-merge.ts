import { decodeCanvasDocument } from './document-codec';
import type { CanvasDocument, CanvasEdge, CanvasNode } from './types';

export interface CanvasMergeResult {
  conflicts: string[];
  document: CanvasDocument;
}

const missing = Symbol('missing');
type MergeValue = unknown | typeof missing;

export function mergeCanvasDocuments(baseInput: unknown, localInput: unknown, remoteInput: unknown): CanvasMergeResult {
  const base = decodeCanvasDocument(baseInput);
  const local = decodeCanvasDocument(localInput);
  const remote = decodeCanvasDocument(remoteInput);
  if (String(base.id || '') !== String(local.id || '') || String(local.id || '') !== String(remote.id || '')) {
    throw new TypeError('Cannot merge different canvas documents');
  }

  const conflicts: string[] = [];
  const document = mergeRecord(base, local, remote, '', conflicts) as CanvasDocument;
  document.nodes = mergeCollection(base.nodes, local.nodes, remote.nodes, 'nodes', conflicts, nodeKey) as CanvasNode[];
  document.connections = mergeCollection(base.connections, local.connections, remote.connections, 'connections', conflicts, edgeKey) as CanvasEdge[];
  document.updated_at = remote.updated_at;
  return { conflicts: [...new Set(conflicts)], document: decodeCanvasDocument(document) };
}

function mergeRecord(
  base: Record<string, unknown>, local: Record<string, unknown>, remote: Record<string, unknown>,
  path: string, conflicts: string[], excluded = new Set(['connections', 'nodes', 'updated_at']),
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  keys.forEach((key) => {
    if (excluded.has(key)) return;
    const value = mergeValue(
      key in base ? base[key] : missing,
      key in local ? local[key] : missing,
      key in remote ? remote[key] : missing,
      path ? `${path}.${key}` : key,
      conflicts,
    );
    if (value !== missing) result[key] = clone(value);
  });
  return result;
}

function mergeCollection<T extends Record<string, unknown>>(
  base: readonly T[], local: readonly T[], remote: readonly T[], path: string, conflicts: string[], keyOf: (item: T) => string,
): T[] {
  const baseMap = new Map(base.map((item) => [keyOf(item), item]));
  const localMap = new Map(local.map((item) => [keyOf(item), item]));
  const remoteMap = new Map(remote.map((item) => [keyOf(item), item]));
  const order = [...remote.map(keyOf), ...local.map(keyOf)].filter((key, index, all) => all.indexOf(key) === index);
  return order.flatMap((key) => {
    const value = mergeValue(baseMap.get(key) ?? missing, localMap.get(key) ?? missing, remoteMap.get(key) ?? missing, `${path}.${key}`, conflicts);
    return value === missing ? [] : [clone(value) as T];
  });
}

function mergeValue(base: MergeValue, local: MergeValue, remote: MergeValue, path: string, conflicts: string[]): MergeValue {
  if (equal(local, base)) return remote;
  if (equal(remote, base) || equal(local, remote)) return local;
  if (plainObject(base) && plainObject(local) && plainObject(remote)) {
    return mergeRecord(base, local, remote, path, conflicts, new Set());
  }
  conflicts.push(path);
  return local;
}

function nodeKey(node: CanvasNode): string { return node.id; }
function edgeKey(edge: CanvasEdge): string { return String(edge.id || `${edge.from}->${edge.to}:${edge.kind || 'flow'}`); }
function plainObject(value: MergeValue): value is Record<string, unknown> {
  return value !== missing && Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function equal(left: MergeValue, right: MergeValue): boolean {
  if (left === missing || right === missing) return left === right;
  return stable(left) === stable(right);
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
