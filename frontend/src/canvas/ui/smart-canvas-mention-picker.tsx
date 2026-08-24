import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { canvasAssetLibraryClient, type CanvasAssetLibrary, type CanvasAssetLibraryState } from '../infrastructure/asset-library-client';
import type { SmartCanvasPromptReference, SmartCanvasReference } from './smart-canvas-mention-picker-state';

interface SmartCanvasMentionPickerProps {
  inputRef: RefObject<HTMLDivElement | null>;
  inputItems: SmartCanvasReference[];
  onPromptChange(snapshot: SmartCanvasPromptSnapshot, save: boolean): void;
  outputId: string;
  readOnly: boolean;
}

export interface SmartCanvasPromptSnapshot {
  html: string;
  refs: SmartCanvasPromptReference[];
  text: string;
}

type MentionSource = 'asset' | 'input';
type PickerItem = SmartCanvasReference & { alias: string };

export function SmartCanvasMentionPicker({ inputRef, inputItems, onPromptChange, outputId, readOnly }: SmartCanvasMentionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const mentionRange = useRef<Range | null>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<MentionSource>('input');
  const [assetLibrary, setAssetLibrary] = useState<CanvasAssetLibraryState | null>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [activeLibraryId, setActiveLibraryId] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [position, setPosition] = useState({ left: 8, top: 2 });
  const [preview, setPreview] = useState<{ item: PickerItem; left: number; top: number } | null>(null);

  useEffect(() => {
    let active = true;
    void canvasAssetLibraryClient.list().then((response) => {
      if (!active) return;
      setAssetLibrary(response.library);
      const libraries = response.library?.libraries || [];
      const initial = response.library?.active_library_id || libraries[0]?.id || '';
      setActiveLibraryId(initial);
      setAssetsLoaded(true);
    }).catch(() => { if (active) setAssetsLoaded(true); });
    return () => { active = false; };
  }, []);

  const libraries = useMemo(() => assetLibraries(assetLibrary), [assetLibrary]);
  const activeLibrary = libraries.find((library) => library.id === activeLibraryId) || libraries[0] || null;
  const categories = useMemo(() => (activeLibrary?.categories || []).filter((category) => (category.type || 'image') === 'image'), [activeLibrary]);
  const activeCategory = categories.find((category) => category.id === activeCategoryId) || categories[0] || null;
  const assetItems = useMemo(() => pickerItemsFromAssets(activeCategory).slice(0, 36), [activeCategory]);
  const currentItems = source === 'asset' ? assetItems : inputItems.map((item) => ({ ...item, alias: item.name })).slice(0, 36);
  const hasInput = inputItems.length > 0;
  const hasAssets = libraries.some((library) => library.categories.some((category) => (category.type || 'image') === 'image' && category.items.some((item) => item.url)));

  useEffect(() => {
    if (!activeLibraryId && libraries[0]?.id) setActiveLibraryId(libraries[0].id);
  }, [activeLibraryId, libraries]);

  useEffect(() => {
    if (!categories.some((category) => category.id === activeCategoryId)) setActiveCategoryId(categories[0]?.id || '');
  }, [activeCategoryId, categories]);

  useEffect(() => {
    setOpen(false);
    setPreview(null);
    mentionRange.current = null;
  }, [outputId]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || readOnly) return;
    const saveRange = () => {
      const selection = window.getSelection();
      if (selection?.rangeCount && input.contains(selection.anchorNode)) mentionRange.current = selection.getRangeAt(0).cloneRange();
    };
    const textBeforeCaret = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !input.contains(selection.anchorNode)) return '';
      const range = selection.getRangeAt(0).cloneRange();
      range.selectNodeContents(input);
      range.setEnd(selection.anchorNode!, selection.anchorOffset);
      return range.toString();
    };
    const positionPicker = () => {
      const row = input.closest('.prompt-row') as HTMLElement | null;
      if (!row) return;
      const rowRect = row.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      const selection = window.getSelection();
      const caretRect = selection?.rangeCount ? selection.getRangeAt(0).cloneRange().getBoundingClientRect() : null;
      const scale = row.offsetWidth > 0 ? rowRect.width / row.offsetWidth : 1;
      const safeScale = scale > 0 ? scale : 1;
      const pickerWidth = pickerRef.current?.offsetWidth || 340;
      const maxLeft = Math.max(4, row.offsetWidth - pickerWidth - 4);
      const rawLeft = ((caretRect?.left || inputRect.left) - rowRect.left) / safeScale - 6;
      const rawTop = ((caretRect?.bottom || inputRect.top + 24) - rowRect.top) / safeScale + 2;
      setPosition({ left: Math.max(4, Math.min(rawLeft, maxLeft)), top: Math.max(2, rawTop) });
    };
    const maybeOpen = () => {
      saveRange();
      if (!/@$/.test(textBeforeCaret())) { setOpen(false); return; }
      if (hasInput) setSource('input');
      else if (hasAssets || !assetsLoaded) setSource('asset');
      else { setOpen(false); return; }
      positionPicker();
      setOpen(true);
      window.requestAnimationFrame(positionPicker);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const showPreview = (event: MouseEvent) => {
      const token = (event.target as Element | null)?.closest?.('.mention-image-token') as HTMLElement | null;
      if (!token) return;
      const url = token.dataset.url || '';
      if (!url) return;
      const rect = token.getBoundingClientRect();
      setPreview({
        item: {
          alias: token.dataset.name || '图片',
          assetUris: parseAssetUris(token.dataset.assetUris),
          imageIndex: Number(token.dataset.imageIndex || 0),
          kind: token.dataset.kind === 'video' ? 'video' : 'image',
          name: token.dataset.name || '图片',
          nodeId: token.dataset.nodeId || '',
          url,
        },
        left: Math.min(window.innerWidth - 236, rect.left),
        top: Math.min(window.innerHeight - 236, rect.bottom + 8),
      });
    };
    const hidePreview = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.('.mention-image-token')) setPreview(null);
    };
    input.addEventListener('input', maybeOpen);
    input.addEventListener('keyup', maybeOpen);
    input.addEventListener('mouseup', saveRange);
    input.addEventListener('focus', saveRange);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('mouseover', showPreview);
    input.addEventListener('mouseout', hidePreview);
    return () => {
      input.removeEventListener('input', maybeOpen);
      input.removeEventListener('keyup', maybeOpen);
      input.removeEventListener('mouseup', saveRange);
      input.removeEventListener('focus', saveRange);
      input.removeEventListener('keydown', onKeyDown);
      input.removeEventListener('mouseover', showPreview);
      input.removeEventListener('mouseout', hidePreview);
    };
  }, [assetsLoaded, hasAssets, hasInput, inputRef, readOnly]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('.mention-picker') && !target?.closest('#promptInput')) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons());
  }, [activeCategoryId, activeLibraryId, currentItems.length, open, source]);

  const insertMention = (item: PickerItem) => {
    const input = inputRef.current;
    if (!input || !item.url) return;
    input.focus();
    const selection = window.getSelection();
    const saved = mentionRange.current;
    if (saved && input.contains(saved.commonAncestorContainer)) {
      selection?.removeAllRanges();
      selection?.addRange(saved);
    }
    const range = selection?.rangeCount ? selection.getRangeAt(0) : document.createRange();
    let removedAt = false;
    if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
      const value = range.startContainer.textContent || '';
      if (value[range.startOffset - 1] === '@') {
        range.setStart(range.startContainer, range.startOffset - 1);
        range.deleteContents();
        removedAt = true;
      }
    }
    if (!removedAt) {
      const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
      let lastText: Node | null = null;
      while (walker.nextNode()) lastText = walker.currentNode;
      if (lastText && /@$/.test(lastText.textContent || '')) {
        lastText.textContent = (lastText.textContent || '').slice(0, -1);
        range.selectNodeContents(input);
        range.collapse(false);
      }
    }
    const token = document.createElement('span');
    token.className = 'mention-image-token';
    token.contentEditable = 'false';
    token.dataset.url = item.url;
    token.dataset.name = item.alias || item.name || '图片';
    token.dataset.kind = item.kind;
    token.dataset.nodeId = item.nodeId || '';
    token.dataset.imageIndex = String(item.imageIndex ?? '');
    token.dataset.assetUris = JSON.stringify(item.assetUris || {});
    const media = document.createElement(item.kind === 'video' ? 'video' : 'img');
    media.setAttribute('src', item.url);
    media.setAttribute('alt', '');
    if (media instanceof HTMLVideoElement) {
      media.muted = true;
      media.playsInline = true;
      media.preload = 'metadata';
    } else media.draggable = false;
    const label = document.createElement('span');
    label.textContent = token.dataset.name;
    token.append(media, label);
    range.insertNode(token);
    const spacer = document.createTextNode(' ');
    token.after(spacer);
    range.setStartAfter(spacer);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    mentionRange.current = range.cloneRange();
    setOpen(false);
    onPromptChange(snapshotPrompt(input), true);
    input.focus();
  };

  const pickerStyle = { left: position.left, top: position.top } as CSSProperties;
  const previewNode = preview ? <div className="mention-preview" id="mentionPreview" style={{ display: 'block', left: preview.left, top: preview.top }}>
    {preview.item.kind === 'video'
      ? <video autoPlay disablePictureInPicture loop muted playsInline preload="metadata" src={preview.item.url} />
      : <img alt="preview" src={preview.item.url} />}
  </div> : <div className="mention-preview" id="mentionPreview"><img alt="preview" /></div>;

  return <>
    <div className={`mention-picker ${open ? 'open' : ''}`} id="mentionPicker" onMouseDown={(event) => event.stopPropagation()} ref={pickerRef} style={pickerStyle}>
      {open ? <div className="mention-picker-shell">
        <div className="mention-source-tabs">
          <button className={`mention-source-tab ${source === 'input' ? 'active' : ''}`} data-mention-source="input" disabled={!hasInput} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); if (hasInput) setSource('input'); }} title="画布输入" type="button"><i data-lucide="image" /><span>画布输入</span></button>
          <button className={`mention-source-tab ${source === 'asset' ? 'active' : ''}`} data-mention-source="asset" disabled={assetsLoaded && !hasAssets} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); if (hasAssets || !assetsLoaded) setSource('asset'); }} title="资产库" type="button"><i data-lucide="library" /><span>资产库</span></button>
        </div>
        {source === 'asset' && libraries.length ? <label className="mention-library-row"><span>资产库</span><select className="mention-library-select" data-mention-library onChange={(event) => { setActiveLibraryId(event.target.value); setActiveCategoryId(''); }} onMouseDown={(event) => event.stopPropagation()} value={activeLibrary?.id || ''}>{libraries.map((library) => <option key={library.id} value={library.id}>{library.name || '资产库'}</option>)}</select></label> : null}
        <div className={`mention-folder-chips ${source === 'asset' && categories.length ? '' : 'hidden'}`}>
          {categories.map((category) => <button className={`mention-folder-chip ${category.id === activeCategory?.id ? 'active' : ''}`} data-mention-folder={category.id} key={category.id} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); setActiveCategoryId(category.id); }} title={category.name || '资产文件夹'} type="button">{category.name || '资产文件夹'}</button>)}
        </div>
        <div className="mention-content">
          {currentItems.length ? <div className="mention-option-grid">{currentItems.map((item, index) => <button className="mention-option" data-mention-index={index} key={`${item.url}-${index}`} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); insertMention(item); }} type="button">{item.kind === 'video' ? <video muted preload="metadata" src={item.url} /> : <img alt="" draggable={false} src={item.url} />}<span>{item.alias}</span></button>)}</div> : <div className="mention-empty">暂无可引用素材</div>}
        </div>
      </div> : null}
    </div>
    {typeof document !== 'undefined' ? createPortal(previewNode, document.body) : null}
  </>;
}

export function snapshotPrompt(input: HTMLElement): SmartCanvasPromptSnapshot {
  const refs: SmartCanvasPromptReference[] = [];
  input.querySelectorAll<HTMLElement>('.mention-image-token').forEach((token, index) => {
    const url = token.dataset.url || '';
    if (!url) return;
    refs.push({
      asset_uris: parseAssetUris(token.dataset.assetUris),
      imageIndex: Number.isFinite(Number(token.dataset.imageIndex)) ? Number(token.dataset.imageIndex) : index,
      kind: token.dataset.kind === 'video' ? 'video' : 'image',
      name: token.dataset.name || `图片${index + 1}`,
      nodeId: token.dataset.nodeId || '',
      url,
    });
  });
  return { html: input.innerHTML, refs, text: input.innerText.replace(/\u00a0/g, ' ').trim() };
}

function pickerItemsFromAssets(category: CanvasAssetLibrary['categories'][number] | null): PickerItem[] {
  const seen = new Set<string>();
  return (category?.items || []).flatMap((item, index) => {
    if (!item.url || seen.has(item.url)) return [];
    seen.add(item.url);
    const record = item as typeof item & { registrations?: Record<string, { asset_uri?: string; status?: string }> };
    const volcengine = record.registrations?.volcengine;
    const assetUris: Record<string, string> = volcengine?.status === 'Active' && volcengine.asset_uri ? { volcengine: volcengine.asset_uri } : {};
    return [{ alias: item.name || `资产${index + 1}`, assetUris, imageIndex: index, kind: item.kind === 'video' ? 'video' : 'image', name: item.name || `资产${index + 1}`, nodeId: '', url: item.url }];
  });
}

function assetLibraries(state: CanvasAssetLibraryState | null): CanvasAssetLibrary[] {
  return state?.libraries || [];
}

function parseAssetUris(value: string | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}
