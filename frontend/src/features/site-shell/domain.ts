import type { SitePage, SitePageId } from './types';

export const ACTIVE_PAGE_KEY = 'studio_active_page';
export const SHELL_PINNED_KEY = 'studio_sidebar_pinned';
export const UPDATE_SOURCE_KEY = 'studio_update_source';
export const DEFAULT_PAGE: SitePageId = 'online';

export const SITE_PAGES: SitePage[] = [
  { id: 'zimage', label: '文生图', short: '✦', src: '/static/zimage.html', group: 'create' },
  { id: 'enhance', label: '细节增强', short: '◌', src: '/static/enhance.html', group: 'create' },
  { id: 'klein', label: '图片编辑', short: '◫', src: '/static/klein.html', group: 'create' },
  { id: 'angle', label: '角度控制', short: '⌁', src: '/static/angle.html', group: 'create' },
  { id: 'online', label: '在线生图', short: '◎', src: '/static/online.html', group: 'workspace' },
  { id: 'gpt-chat', label: 'GPT 对话', short: '□', src: '/static/gpt-chat.html', group: 'workspace' },
  { id: 'canvas', label: '无限画布', short: '▦', src: '/static/canvas.html', group: 'workspace' },
  { id: 'asset-manager', label: '素材工作台', short: '▤', src: '/static/asset-manager.html', group: 'workspace' },
  { id: 'api-settings', label: 'API 设置', short: '⌘', src: '/static/api-settings.html', group: 'settings' },
  { id: 'comfyui-settings', label: '工作流设置', short: '◇', src: '/static/comfyui-settings.html', group: 'settings' },
];

export function normalizePageId(value: string | null | undefined): SitePageId {
  return SITE_PAGES.some(page => page.id === value) ? value as SitePageId : DEFAULT_PAGE;
}

export function pageFromHash(hash: string): SitePageId {
  return normalizePageId(hash.replace(/^#\/?/, '').split(/[?&]/)[0]);
}

export function routeHash(id: SitePageId) { return `#/${id}`; }
export function isForwardableEvent(value: unknown): value is { type: string } {
  if (!value || typeof value !== 'object') return false;
  return ['providers-changed', 'workflows-changed', 'comfy-instances-changed', 'assets-changed', 'chat-changed', 'canvas_updated', 'canvas_locked', 'canvas_unlocked', 'asset_library_updated', 'cloud_status'].includes(String((value as { type?: unknown }).type || ''));
}
