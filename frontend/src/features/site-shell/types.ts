export type SitePageId = 'zimage' | 'enhance' | 'klein' | 'angle' | 'online' | 'gpt-chat' | 'canvas' | 'asset-manager' | 'api-settings' | 'comfyui-settings';
export type SitePageGroup = 'create' | 'workspace' | 'settings';
export interface SitePage { id: SitePageId; label: string; short: string; src: string; group: SitePageGroup }
export interface QueueStatus { total?: number; position?: number }
export interface AppInfo { version: string; repo_url: string; sources?: Record<string, { label: string; repo_url: string }> }
export interface UpdateCheck { current: string; update_available: boolean; reachable: boolean; latest?: { source?: string; version?: string }; update_notes?: { items?: string[] } }
export interface ConnectivityItem { name: string; ok: boolean; source: string; required?: boolean; status?: number; error?: string; elapsed_ms?: number }
export interface ConnectivityResult { ok: boolean; results: ConnectivityItem[]; sources?: Record<string, { ok: boolean }> }
export interface UpdateResult { ok: boolean; source: string; source_label?: string; fallback_used?: boolean; count: number; version?: string; restart_required?: boolean; restart_scheduled?: boolean }
export interface UpdateBackup { name: string; created_at?: number; version?: string; size?: number }

