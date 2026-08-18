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
}

export interface ImageStudioAdapter {
  id: string;
  title: string;
  subtitle: string;
  historyType: string;
  maxReferences: number;
  modes: Array<{ id: string; label: string }>;
  defaultMode: string;
  supportsProviders: boolean;
  supportsQuality: boolean;
  supportsCount: boolean;
  loadProviders?(): Promise<StudioProvider[]>;
  resume?(onStatus: (status: string) => void): Promise<StudioImageItem | null>;
  generate(input: StudioGenerateInput, onStatus: (status: string) => void): Promise<StudioImageItem>;
}
