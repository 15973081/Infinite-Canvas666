export interface StudioProvider {
  id: string;
  name: string;
  protocol?: string;
  base_url?: string;
  image_models: string[];
}

export interface StudioReference {
  name?: string;
  url?: string;
  path?: string;
  kind?: string;
  comfy_name?: string;
  data_url?: string;
  [key: string]: unknown;
}

export interface StudioImageItem {
  timestamp: number | string;
  prompt: string;
  images: string[];
  type?: string;
  [key: string]: unknown;
}

export interface StudioGenerateInput {
  prompt: string;
  mode: string;
  providerId: string;
  model: string;
  width: number;
  height: number;
  quality: string;
  count: number;
  references: StudioReference[];
  extras: Record<string, string | number | boolean>;
}

export interface StudioField {
  id: string;
  label: string;
  type: 'range' | 'number' | 'select' | 'toggle' | 'text';
  default: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  modes?: string[];
}

export interface ImageStudioAdapter {
  id: string;
  title: string;
  subtitle: string;
  historyType: string;
  maxReferences: number;
  minReferences?: number;
  modes: Array<{ id: string; label: string }>;
  defaultMode: string;
  supportsProviders: boolean;
  supportsQuality: boolean;
  supportsCount: boolean;
  fields?: StudioField[];
  loadProviders?(): Promise<StudioProvider[]>;
  uploadReference?(file: File, mode: string): Promise<StudioReference>;
  resume?(onStatus: (status: string) => void): Promise<StudioImageItem | null>;
  generate(input: StudioGenerateInput, onStatus: (status: string) => void): Promise<StudioImageItem>;
}
