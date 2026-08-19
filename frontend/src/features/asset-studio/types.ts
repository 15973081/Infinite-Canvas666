export type AssetTab = 'assets' | 'workflows' | 'prompts' | 'canvas' | 'local' | 'shared';
export type MediaKind = 'image' | 'video' | 'audio' | 'workflow';

export interface AssetRegistration {
  provider_id?: string;
  status?: 'Queued' | 'Uploading' | 'Processing' | 'Active' | 'Failed' | 'Cancelled' | string;
  detail?: string;
  task_id?: string;
  asset_uri?: string;
  asset_id?: string;
  project_name?: string;
  registered_at?: number;
}

export interface AssetProvider {
  id: string;
  name: string;
  enabled?: boolean;
  has_key?: boolean;
  protocol?: string;
  base_url?: string;
  volcengine_project_name?: string;
}

export interface MediaItem {
  id: string;
  name: string;
  url: string;
  kind: MediaKind;
  file?: string;
  folder?: string;
  caption?: string;
  created_at?: number;
  canvas_id?: string;
  canvas_name?: string;
  canvas_title?: string;
  canvas_kind?: string;
  node_title?: string;
  source_path?: string;
  relativePath?: string;
  registrations?: Record<string, AssetRegistration>;
}

export interface AssetCategory { id: string; name: string; type: 'image' | 'workflow'; dir?: string; items: MediaItem[] }
export interface AssetLibrary { id: string; name: string; type: 'asset'; categories: AssetCategory[] }
export interface AssetLibraryState { active_library_id: string; libraries: AssetLibrary[] }

export interface PromptCategory { id: string; name: string }
export interface PromptItem { id: string; name: string; category: string; positive: string; negative: string; scene: string; created_at?: number }
export interface PromptLibrary { id: string; name: string; system?: boolean; readonly?: boolean; categories: PromptCategory[]; items: PromptItem[] }
export interface PromptLibraryState { active_library_id: string; libraries: PromptLibrary[] }

export interface FolderNode { id: string; name: string; path: string; count?: number; items: MediaItem[]; children: FolderNode[] }
export interface SharedFolder { id: string; name: string; path: string; exists: boolean }
export interface CanvasAssetState { categories: Array<{ id: string; name: string; count: number }>; items: MediaItem[] }
