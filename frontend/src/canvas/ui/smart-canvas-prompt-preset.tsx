import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { CanvasNode } from '../domain/types';

export const SMART_CANVAS_PROMPT_PRESET_STORAGE_KEY = 'smart_canvas_prompt_presets_v1';

export interface SmartCanvasPromptPresetValue {
  createdAt: number;
  id: string;
  name: string;
  text: string;
  updatedAt: number;
}

export function loadSmartCanvasPromptPresets(storage: Pick<Storage, 'getItem'> = localStorage): SmartCanvasPromptPresetValue[] {
  try {
    const parsed = JSON.parse(storage.getItem(SMART_CANVAS_PROMPT_PRESET_STORAGE_KEY) || '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is SmartCanvasPromptPresetValue => Boolean(
        item && typeof item === 'object'
        && String((item as Record<string, unknown>).id || '')
        && typeof (item as Record<string, unknown>).text === 'string',
      )).map((item) => ({
        createdAt: Number(item.createdAt || Date.now()),
        id: String(item.id),
        name: String(item.name || '提示词预设'),
        text: item.text,
        updatedAt: Number(item.updatedAt || item.createdAt || Date.now()),
      }))
      : [];
  } catch {
    return [];
  }
}

export function defaultSmartCanvasPromptPresetName(text: string): string {
  return text.trim().split(/\r?\n/, 1)[0]?.trim().slice(0, 28) || '提示词预设';
}

function savePromptPresets(presets: SmartCanvasPromptPresetValue[]): void {
  localStorage.setItem(SMART_CANVAS_PROMPT_PRESET_STORAGE_KEY, JSON.stringify(presets));
}

function presetId(): string {
  return `preset_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

export function SmartCanvasPromptPreset({ boardRef, node, onClearPreset, onClose, onPatchNode, readOnly = false }: {
  boardRef: RefObject<HTMLDivElement | null>;
  node: CanvasNode;
  onClearPreset: (presetId: string) => void;
  onClose: () => void;
  onPatchNode: (nodeId: string, patch: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [presets, setPresets] = useState<SmartCanvasPromptPresetValue[]>(() => loadSmartCanvasPromptPresets());
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'ok' | 'warn' | ''>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [position, setPosition] = useState({ left: 80, top: 80 });

  const selectPreset = (id: string, values = presets) => {
    const preset = values.find((item) => item.id === id);
    setSelectedId(preset?.id || '');
    setName(preset?.name || '');
    setText(preset?.text || '');
    setConfirmDelete(false);
    setStatus(preset ? '选择预设后可直接修改名称和内容。' : '暂无预设，可将当前提示词存为新预设。');
    setStatusKind('');
  };

  useEffect(() => {
    selectPreset(String(node.promptPresetId || presets[0]?.id || ''), presets);
    // The panel is recreated for each target node, matching the legacy open flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const target = board?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(node.id)}"]`);
    if (!board || !target) return;
    const shellRect = board.getBoundingClientRect();
    const nodeRect = target.getBoundingClientRect();
    setPosition({
      left: Math.max(18, Math.min(Math.max(18, shellRect.width - 410), nodeRect.right - shellRect.left + 12)),
      top: Math.max(18, Math.min(Math.max(18, shellRect.height - 330), nodeRect.top - shellRect.top)),
    });
  }, [boardRef, node.id]);

  useEffect(() => {
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!panelRef.current?.contains(target) && !target?.closest('.prompt-preset-save')) onClose();
    };
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', pointerDown);
    window.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('keydown', keydown);
    };
  }, [onClose]);

  const markEdited = () => {
    setConfirmDelete(false);
    setStatus('编辑完成后点击保存修改。');
    setStatusKind('');
  };
  const selected = presets.find((item) => item.id === selectedId);
  const targetText = String(node.text || '').trim();

  return <div className="prompt-preset-panel open" id="promptPresetPanel" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} ref={panelRef} style={position}>
    <div className="prompt-preset-panel-head">
      <span>提示词预设</span>
      <button aria-label="关闭" id="promptPresetClose" onClick={onClose} title="关闭" type="button">×</button>
    </div>
    <div className={`prompt-preset-status ${statusKind}`} id="promptPresetStatus">{status}</div>
    <div className="prompt-preset-fields">
      <select id="promptPresetSelect" onChange={(event) => selectPreset(event.target.value)} value={selectedId}>
        {!presets.length ? <option value="">暂无预设</option> : null}
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
      </select>
      <input id="promptPresetName" onChange={(event) => { setName(event.target.value); markEdited(); }} placeholder="预设名称" ref={nameRef} type="text" value={name} />
      <textarea id="promptPresetText" onChange={(event) => { setText(event.target.value); markEdited(); }} placeholder="预设内容" value={text} />
    </div>
    <div className="prompt-preset-actions">
      <button disabled={!selected || readOnly} id="promptPresetApply" onClick={() => {
        if (!selected || readOnly) return;
        onPatchNode(node.id, { promptPresetId: selected.id, text: selected.text });
        onClose();
      }} type="button">应用</button>
      <button className={`danger ${confirmDelete ? 'confirm-danger' : ''}`.trim()} disabled={!selected || readOnly} id="promptPresetDelete" onClick={() => {
        if (!selected || readOnly) return;
        if (!confirmDelete) {
          setConfirmDelete(true);
          setStatus(`将删除“${selected.name}”，再次点击确认。`);
          setStatusKind('warn');
          return;
        }
        const next = presets.filter((item) => item.id !== selected.id);
        savePromptPresets(next);
        setPresets(next);
        onClearPreset(selected.id);
        selectPreset(next[0]?.id || '', next);
        setStatus('预设已删除。');
        setStatusKind('ok');
      }} type="button">{confirmDelete ? '再次点击删除' : '删除'}</button>
      <span style={{ flex: 1 }} />
      <button disabled={!targetText || readOnly} id="promptPresetNew" onClick={() => {
        if (!targetText || readOnly) return;
        const now = Date.now();
        const preset = { createdAt: now, id: presetId(), name: defaultSmartCanvasPromptPresetName(targetText), text: String(node.text || ''), updatedAt: now };
        const next = [preset, ...presets];
        savePromptPresets(next);
        setPresets(next);
        onPatchNode(node.id, { promptPresetId: preset.id });
        selectPreset(preset.id, next);
        setStatus('已存为新预设。');
        setStatusKind('ok');
        requestAnimationFrame(() => { nameRef.current?.focus(); nameRef.current?.select(); });
      }} type="button">存为新预设</button>
      <button className="primary" disabled={!selected || readOnly} id="promptPresetSave" onClick={() => {
        if (!selected || readOnly) return;
        const nextName = name.trim();
        const nextText = text.trim();
        if (!nextName || !nextText) {
          setStatus('预设名称和内容不能为空。');
          setStatusKind('warn');
          return;
        }
        const next = presets.map((item) => item.id === selected.id ? { ...item, name: nextName, text, updatedAt: Date.now() } : item);
        savePromptPresets(next);
        setPresets(next);
        if (String(node.promptPresetId || '') === selected.id) onPatchNode(node.id, { text });
        setStatus('预设修改已保存。');
        setStatusKind('ok');
        setConfirmDelete(false);
      }} type="button">保存修改</button>
    </div>
  </div>;
}
