export type FieldType = 'text' | 'textarea' | 'number' | 'slider' | 'boolean' | 'dropdown' | 'image' | 'video' | 'audio';

export interface WorkflowField {
  id: string;
  node: string;
  input: string;
  name: string;
  type: FieldType;
  default: unknown;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  options: string[];
  random_enabled: boolean;
}

export interface WorkflowConfig {
  title: string;
  fields: WorkflowField[];
  mini_cards: Record<string, unknown>;
}

export interface WorkflowNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
}

export type WorkflowGraph = Record<string, WorkflowNode>;

export interface WorkflowSummary {
  name: string;
  title?: string;
  builtin?: boolean;
  field_count?: number;
}

export interface WorkflowDetail {
  name: string;
  workflow: WorkflowGraph;
  config?: Partial<WorkflowConfig>;
  builtin?: boolean;
}

export interface RunAsset {
  url: string;
  kind: 'image' | 'video' | 'audio';
}
