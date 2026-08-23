export type SitePageId = 'online' | 'gpt-chat' | 'canvas' | 'asset-manager' | 'api-settings' | 'comfyui-settings';
export type SitePageGroup = 'workspace' | 'settings';
export interface SitePage { id: SitePageId; label: string; src: string; group: SitePageGroup }
export interface QueueStatus { total?: number; position?: number }
export interface UpdateNotes { version?: string; items?: Array<string | { text?: string }> }
export interface UpdateSourceInfo { label?: string; repo_url?: string; version_url?: string; tree_url?: string; update_notes_url?: string }
export interface AppInfo { version: string; repo_url: string; version_url?: string; tree_url?: string; sources?: Record<string, UpdateSourceInfo>; update_notes?: UpdateNotes }
export interface UpdateCheck { current: string; update_available: boolean; reachable: boolean; latest?: { source?: string; version?: string; update_notes?: UpdateNotes }; update_notes?: UpdateNotes }
export interface ConnectivityItem { name: string; url?: string; ok: boolean; source: string; required?: boolean; status?: number; error?: string; elapsed_ms?: number; timed_out?: boolean; pending?: boolean; untouched?: boolean }
export interface ConnectivityResult { ok: boolean; results: ConnectivityItem[]; sources?: Record<string, { ok: boolean }> }
export interface UpdateResult { ok: boolean; source: string; source_label?: string; fallback_used?: boolean; count: number; version?: string; restart_required?: boolean; restart_scheduled?: boolean; update_notes?: UpdateNotes }
export interface UpdateBackup { name: string; created_at?: number; version?: string; size?: number; file_count?: number }
