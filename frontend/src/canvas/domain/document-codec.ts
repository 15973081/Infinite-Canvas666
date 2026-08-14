import type { CanvasDocument, CanvasEdge, CanvasNode } from './types';

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function node(value: unknown, index: number): CanvasNode {
  const input = record(value, `nodes[${index}]`);
  if (typeof input.id !== 'string' || !input.id) throw new TypeError(`nodes[${index}].id must be a non-empty string`);
  if (typeof input.type !== 'string' || !input.type) throw new TypeError(`nodes[${index}].type must be a non-empty string`);
  return input as CanvasNode;
}

function edge(value: unknown, index: number): CanvasEdge {
  const input = record(value, `connections[${index}]`);
  if (typeof input.from !== 'string' || !input.from) throw new TypeError(`connections[${index}].from must be a non-empty string`);
  if (typeof input.to !== 'string' || !input.to) throw new TypeError(`connections[${index}].to must be a non-empty string`);
  return input as CanvasEdge;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function decodeCanvasDocument(value: unknown): CanvasDocument {
  const input = jsonClone(record(value, 'document'));
  const nodes = input.nodes ?? [];
  const connections = input.connections ?? [];
  if (!Array.isArray(nodes)) throw new TypeError('document.nodes must be an array');
  if (!Array.isArray(connections)) throw new TypeError('document.connections must be an array');

  const schemaVersion = Number(input.schemaVersion ?? 1);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new TypeError('document.schemaVersion must be a positive integer');
  }

  return {
    ...input,
    schemaVersion,
    nodes: nodes.map(node),
    connections: connections.map(edge),
  } as CanvasDocument;
}

export function encodeCanvasDocument(document: CanvasDocument): Record<string, unknown> {
  return jsonClone(decodeCanvasDocument(document));
}
