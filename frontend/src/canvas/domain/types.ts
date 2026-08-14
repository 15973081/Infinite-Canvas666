export interface CanvasNode {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface CanvasEdge {
  from: string;
  to: string;
  kind?: string;
  [key: string]: unknown;
}

export interface CanvasDocument {
  schemaVersion: number;
  nodes: CanvasNode[];
  connections: CanvasEdge[];
  [key: string]: unknown;
}
