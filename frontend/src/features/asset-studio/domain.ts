import type { AssetCategory, AssetLibrary, FolderNode, MediaItem, PromptLibrary } from './types';

export const firstLibrary = <T extends { id: string }>(items: T[], preferred = '') => items.find(item => item.id === preferred) ?? items[0];
export const firstCategory = <T extends { id: string }>(items: T[], preferred = '') => items.find(item => item.id === preferred) ?? items[0];

export function mediaMatches(item: MediaItem, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || [item.name, item.caption, item.folder, item.canvas_name].some(value => value?.toLocaleLowerCase().includes(needle));
}

export function promptMatches(item: { name: string; positive: string; negative?: string; scene?: string }, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || [item.name, item.positive, item.negative, item.scene].some(value => value?.toLocaleLowerCase().includes(needle));
}

export function flattenTree(node?: FolderNode): FolderNode[] {
  if (!node) return [];
  return [node, ...node.children.flatMap(flattenTree)];
}

export function itemsForFolder(items: MediaItem[], path: string) {
  return path ? items.filter(item => item.folder === path) : items;
}

export function assetCategories(library?: AssetLibrary, kind: 'image' | 'workflow' = 'image'): AssetCategory[] {
  return library?.categories.filter(category => category.type === kind) ?? [];
}

export function promptCategoryName(library: PromptLibrary | undefined, id: string) {
  return library?.categories.find(category => category.id === id)?.name || '未分组';
}

export function copyItemsToCanvas(items: MediaItem[]) {
  const payload = items.filter(item => item.url).map(item => ({ url: item.url, name: item.name, kind: item.kind }));
  localStorage.setItem('smart_canvas_asset_inbox', JSON.stringify({ items: payload, created_at: Date.now() }));
  return payload.length;
}

