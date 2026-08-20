import { createContext, useContext, type ReactNode } from 'react';
import type { CanvasEdge, CanvasNode } from '../domain/types';

export type CanvasBoardNodeType =
  | 'comfy'
  | 'generator'
  | 'group'
  | 'image'
  | 'llm'
  | 'loop'
  | 'ltxDirector'
  | 'msgen'
  | 'output'
  | 'prompt'
  | 'promptGroup'
  | 'video';

export interface CanvasBoardApi {
  addNode(type: CanvasBoardNodeType, point?: { x: number; y: number }): string | null;
  controlExecution(command: 'retry-execution' | 'stop-execution', nodeId: string): Promise<void>;
  exportSelection(): { connections: CanvasEdge[]; nodes: CanvasNode[] };
  groupSelected(): void;
  importFiles(files: File[], point?: { x: number; y: number }): Promise<void>;
  importWorkflow(payload: { connections?: unknown[]; nodes?: unknown[] }): string[];
  openOutputLightbox(node: CanvasNode, url: string): void;
  openPromptTemplates(nodeId: string): void;
  prepareVideoMedia(nodeId: string, action: 'cloud' | 'manual', value?: string): Promise<void>;
  redo(): boolean;
  rerunFromOutputMeta(meta: Record<string, unknown>): void;
  runNode(nodeId: string, mode?: 'cascade' | 'chat' | 'node'): Promise<void>;
  setReadOnly(value: boolean): void;
  syncRemote(snapshot: unknown): { conflicts: string[]; merged: boolean; updated: boolean };
  undo(): boolean;
  updateNode(nodeId: string, patch: Record<string, unknown>): boolean;
}

export interface CanvasBoardMount {
  api: CanvasBoardApi;
  unmount(): void;
}

export type CanvasBoardApiAccessor = () => CanvasBoardApi | null;

const CanvasBoardApiContext = createContext<CanvasBoardApiAccessor>(() => null);

export function CanvasBoardApiProvider({ children, getApi }: { children: ReactNode; getApi: CanvasBoardApiAccessor }) {
  return <CanvasBoardApiContext.Provider value={getApi}>{children}</CanvasBoardApiContext.Provider>;
}

export function useCanvasBoardApi(): CanvasBoardApiAccessor {
  return useContext(CanvasBoardApiContext);
}
