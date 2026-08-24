import { useEffect, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasNode } from '../domain/types';
import { smartImageMediaKind, type SmartImageItem } from './smart-image-node';

export interface SmartPromptProvider { label: string; models: string[]; value: string }
export interface SmartPromptLayout { height: number; instructionHeight: number; width: number }

const INSTRUCTION_DEFAULT_HEIGHT = 58;
const INSTRUCTION_MIN_HEIGHT = 44;
const INSTRUCTION_MAX_HEIGHT = 240;

export function smartPromptNodeLayout(node: CanvasNode, mediaCount = 0): SmartPromptLayout {
  const instructionValue = Number(node.llmInstructionHeight);
  const instructionHeight = Number.isFinite(instructionValue)
    ? Math.max(INSTRUCTION_MIN_HEIGHT, Math.min(INSTRUCTION_MAX_HEIGHT, Math.round(instructionValue)))
    : INSTRUCTION_DEFAULT_HEIGHT;
  const explicitWidth = Number(node.w);
  const explicitHeight = Number(node.h);
  const width = !Number.isFinite(explicitWidth) || explicitWidth === 360 ? 316 : Math.max(316, Math.round(explicitWidth));
  const rows = mediaCount ? Math.ceil(Math.min(10, mediaCount) / 5) : 0;
  const thumbsHeight = rows ? rows * 44 + (rows - 1) * 6 + 8 : 0;
  const fallbackHeight = node.llmEnabled
    ? (node.llmSystemEnabled ? 344 : 292) + thumbsHeight + Math.max(0, instructionHeight - INSTRUCTION_DEFAULT_HEIGHT)
    : 194;
  const legacyHeight = node.llmSystemEnabled ? 344 : 292;
  const height = !Number.isFinite(explicitHeight) || [194, 230, 340, 400, legacyHeight].includes(explicitHeight)
    ? fallbackHeight
    : Math.max(Math.round(explicitHeight), fallbackHeight);
  return { height, instructionHeight, width };
}

export function smartPromptLlmPayload(node: CanvasNode, media: SmartImageItem[]) {
  const provider = String(node.llmProvider || 'comfly');
  const model = String(node.llmModel || node.model || 'gpt-4o-mini');
  return {
    message: String(node.llmInstruction || node.text || '').trim(),
    messages: [],
    images: media.filter((item) => smartImageMediaKind(item) === 'image').map((item) => String(item.url || '')).filter(Boolean),
    videos: media.filter((item) => smartImageMediaKind(item) === 'video').map((item) => String(item.url || '')).filter(Boolean),
    model,
    provider,
    ms_model: provider === 'modelscope' ? model : '',
    system_prompt: node.llmSystemEnabled ? String(node.llmSystemPrompt || '').trim() || 'You are a helpful prompt assistant.' : '',
  };
}

function showToast(message: string) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 1_800);
}

function InputThumbs({ media }: { media: SmartImageItem[] }) {
  if (!media.length) return null;
  return <div className="smart-node-input-thumbs">{media.slice(0, 10).map((item, index) => {
    const kind = smartImageMediaKind(item);
    const url = String(item.url || '');
    return <div className="smart-node-input-thumb" data-input-index={index} key={`${url}-${index}`}>
      {kind === 'video' ? <video muted preload="metadata" src={url} />
        : kind === 'audio' ? <div className="audio-thumb"><i data-lucide="file-audio" /><span>Audio</span></div>
          : <img alt="" src={url} />}
      <span className="smart-node-input-badge">{index + 1}</span>
    </div>;
  })}{media.length > 10 ? <div className="smart-node-input-thumb smart-node-input-more">+{media.length - 10}</div> : null}</div>;
}

export function SmartPromptNode({ connecting, media, node, onConnectIn, onConnectOut, onDelete, onMoveStart, onOpenPreset, onOpenTemplate, onPatch, onSelect, providers, readOnly, selected }: {
  connecting: boolean;
  media: SmartImageItem[];
  node: CanvasNode;
  onConnectIn(): void;
  onConnectOut(): void;
  onDelete(): void;
  onMoveStart(event: ReactPointerEvent<HTMLDivElement>): void;
  onOpenPreset(): void;
  onOpenTemplate(): void;
  onPatch(patch: Record<string, unknown>, save?: boolean): void;
  onSelect(event: ReactMouseEvent<HTMLDivElement>): void;
  providers: SmartPromptProvider[];
  readOnly: boolean;
  selected: boolean;
}) {
  const [availableProviders, setAvailableProviders] = useState(providers);
  const layout = smartPromptNodeLayout(node, node.llmEnabled ? media.length : 0);
  const provider = availableProviders.find((item) => item.value === node.llmProvider) || availableProviders[0];
  const models = provider?.models || [String(node.llmModel || node.model || 'gpt-4o-mini')].filter(Boolean);
  const model = models.includes(String(node.llmModel || '')) ? String(node.llmModel) : models[0] || String(node.llmModel || 'gpt-4o-mini');

  useEffect(() => { requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons()); }, [node.llmEnabled, node.llmSystemEnabled, node.running, media.length]);
  useEffect(() => {
    let active = true;
    void fetch('/api/config').then((response) => response.json()).then((config: { api_providers?: Array<{ chat_models?: string[]; enabled?: boolean; id?: string; name?: string }> }) => {
      const next = (config.api_providers || []).filter((item) => item.enabled !== false && item.id && item.chat_models?.length).map((item) => ({ label: String(item.name || item.id), models: [...new Set((item.chat_models || []).map(String).filter(Boolean))], value: String(item.id) }));
      if (active && next.length) setAvailableProviders(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const run = async () => {
    const payload = smartPromptLlmPayload({ ...node, llmProvider: provider?.value || node.llmProvider, llmModel: model }, media);
    if (!payload.message) { showToast('请输入要处理的提示词或 LLM 指令'); return; }
    onPatch({ llmEnabled: true, llmProvider: payload.provider, llmModel: payload.model, running: true });
    try {
      const response = await fetch('/api/canvas-llm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.detail || result.error || `请求失败 (${response.status})`));
      onPatch({ text: String(result.text || '').trim(), llmProvider: payload.provider, llmModel: payload.model, running: false }, true);
    } catch (error) {
      onPatch({ running: false });
      showToast((error instanceof Error ? error.message : String(error)).slice(0, 160));
    }
  };
  const toggleLlm = () => {
    const enabled = !node.llmEnabled;
    const next = smartPromptNodeLayout({ ...node, llmEnabled: enabled }, enabled ? media.length : 0);
    onPatch({ llmEnabled: enabled, llmProvider: provider?.value || node.llmProvider || 'comfly', llmModel: model, h: next.height, w: next.width }, true);
  };
  const beginInstructionResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const startY = event.clientY;
    const startHeight = layout.instructionHeight;
    const startNodeHeight = layout.height;
    document.body.classList.add('smart-node-resize', 'smart-llm-instr-resize');
    const move = (next: PointerEvent) => {
      const height = Math.max(INSTRUCTION_MIN_HEIGHT, Math.min(INSTRUCTION_MAX_HEIGHT, Math.round(startHeight + next.clientY - startY)));
      onPatch({ llmInstructionHeight: height, h: Math.max(node.llmSystemEnabled ? 344 : 292, startNodeHeight + height - startHeight) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      document.body.classList.remove('smart-node-resize', 'smart-llm-instr-resize');
      onPatch({}, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  return <div aria-label={`smart-prompt ${node.id}`} className={`image-node prompt-smart-node ${selected ? 'selected' : ''} ${node.running ? 'node-running' : ''}`.trim()} data-id={node.id} data-node-id={node.id} data-node-type="smart-prompt" onClick={(event) => { event.stopPropagation(); onSelect(event); }} onPointerDown={onMoveStart} role="button" style={{ height: layout.height, left: Number(node.x || 0), top: Number(node.y || 0), width: layout.width }} tabIndex={0}>
    <div className="node-head"><div className="node-title">Prompt</div><div className="node-actions" /></div>
    <div className="floating-node-actions"><button className="mini-x node-delete" disabled={readOnly} onClick={(event) => { event.stopPropagation(); onDelete(); }} title="删除节点" type="button"><i data-lucide="trash-2" /></button></div>
    <div className="node-body"><div className="prompt-node-card" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <textarea className="prompt-node-text prompt-node-control" onBlur={() => onPatch({}, true)} onChange={(event) => onPatch({ text: event.target.value })} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} placeholder="输入提示词" readOnly={readOnly || Boolean(node.llmEnabled)} value={String(node.text || '')} />
      <div className="prompt-node-tools">
        <button className={`prompt-node-pill prompt-node-control prompt-preset-edit ${node.promptPresetId ? 'active' : ''}`} disabled={readOnly} onClick={(event) => { event.stopPropagation(); onOpenTemplate(); }} type="button"><i data-lucide="library" /><span>模板库</span></button>
        <button className="prompt-node-pill prompt-node-control prompt-preset-save" disabled={readOnly} onClick={(event) => { event.stopPropagation(); onOpenPreset(); }} type="button"><i data-lucide="bookmark-plus" /><span>预设</span></button>
        <button className={`prompt-node-pill prompt-llm-toggle ${node.llmEnabled ? 'active' : ''}`} disabled={readOnly} onClick={(event) => { event.stopPropagation(); toggleLlm(); }} type="button"><i data-lucide="sparkles" /><span>LLM</span></button>
      </div>
      {node.llmEnabled ? <><InputThumbs media={media} /><div className="prompt-node-llm">
        <select aria-label="LLM 平台" className="prompt-node-control prompt-llm-provider" disabled={readOnly} onChange={(event) => { const next = availableProviders.find((item) => item.value === event.target.value); onPatch({ llmProvider: event.target.value, llmModel: next?.models[0] || '' }, true); }} value={provider?.value || String(node.llmProvider || '')}>{availableProviders.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <select aria-label="LLM 模型" className="prompt-node-control prompt-llm-model" disabled={readOnly} onChange={(event) => onPatch({ llmModel: event.target.value }, true)} value={model}>{models.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <div className="prompt-llm-instruction-wrap">
          <textarea aria-label="LLM 指令" className="prompt-node-control prompt-llm-instruction" disabled={readOnly} onBlur={() => onPatch({}, true)} onChange={(event) => onPatch({ llmInstruction: event.target.value })} placeholder="输入发送给 LLM 的指令" style={{ height: layout.instructionHeight }} value={String(node.llmInstruction || '')} />
          <div className="prompt-llm-instruction-resize prompt-node-control" data-llm-instruction-resize="1" onPointerDown={beginInstructionResize} title="拖动调整高度"><span /></div>
        </div>
        <div className="prompt-node-llm-actions">
          <button className="prompt-node-run prompt-node-control" disabled={readOnly || Boolean(node.running)} onClick={(event) => { event.stopPropagation(); void run(); }} type="button"><i data-lucide={node.running ? 'loader-2' : 'play'} /><span>{node.running ? '运行中' : '运行'}</span></button>
          <button className={`prompt-node-pill prompt-node-control prompt-system-toggle ${node.llmSystemEnabled ? 'active' : ''}`} disabled={readOnly} onClick={(event) => { event.stopPropagation(); const enabled = !node.llmSystemEnabled; const next = smartPromptNodeLayout({ ...node, llmSystemEnabled: enabled }, media.length); onPatch({ llmSystemEnabled: enabled, h: next.height }, true); }} type="button"><i data-lucide={node.llmSystemEnabled ? 'toggle-right' : 'toggle-left'} /><span>{node.llmSystemEnabled ? '关闭 System' : '启用 System'}</span></button>
        </div>
        {node.llmSystemEnabled ? <textarea aria-label="System 提示词" className="prompt-node-control prompt-llm-system" disabled={readOnly} onBlur={() => onPatch({}, true)} onChange={(event) => onPatch({ llmSystemPrompt: event.target.value })} placeholder="输入 System 提示词" value={String(node.llmSystemPrompt || 'You are a helpful prompt assistant.')} /> : null}
      </div></> : null}
    </div></div>
    <div className="node-hint">拖拽节点移动</div><div className="node-resize-handle" data-resize="1" />
    <div className={`node-port port-in ${connecting ? 'port-hover' : ''}`} data-port="in" onClick={(event) => { event.stopPropagation(); onConnectIn(); }} title="输入" />
    <div className="node-port port-out" data-port="out" onPointerDown={(event) => { event.stopPropagation(); onConnectOut(); }} title="输出" />
  </div>;
}
