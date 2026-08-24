import { useEffect, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasNode } from '../domain/types';
import { smartImageMediaKind, type SmartImageItem } from './smart-image-node';

export interface SmartLoopLayout { height: number; width: number }

export function smartLoopPromptFields(node: CanvasNode): string[] {
  if (Array.isArray(node.variablePrompts) && node.variablePrompts.length) return node.variablePrompts.map((value) => String(value || '').trim());
  const text = String(node.variablePrompt || '').trim();
  if (!text) return [];
  const lines = text.split(/\r?\n+/).map((value) => value.trim()).filter(Boolean);
  return lines.length >= 2 ? lines : [text];
}

export function smartLoopPromptForRound(node: CanvasNode, upstreamPrompts: string[], round: number): string {
  if (!node.showPrompt) return '';
  const fields = smartLoopPromptFields(node).filter(Boolean);
  const start = Math.max(1, Number(node.loopStart || 1));
  const count = Math.max(1, Math.min(100, Number(node.count || 1)));
  const index = Math.max(1, round || start);
  const upstream = upstreamPrompts.length ? upstreamPrompts[(index - 1) % upstreamPrompts.length] : '';
  const local = fields.length ? fields[(index - 1) % fields.length] : '';
  return [upstream, local].map((value) => value.trim()).filter(Boolean).join('\n\n')
    .replaceAll('《计数》', String(index)).replaceAll('[计数]', String(index))
    .replaceAll('《总数》', String(count)).replaceAll('[总数]', String(count))
    .replaceAll('《进度》', `${index}/${count}`).replaceAll('[进度]', `${index}/${count}`).trim();
}

export function smartLoopImagesForRound(node: CanvasNode, media: SmartImageItem[], round: number): SmartImageItem[] {
  if (!node.imageInput) return [];
  const start = Math.max(1, round || Number(node.loopStart || 1));
  const size = Math.max(1, Math.min(100, Number(node.imageBatchSize || 1)));
  return media.slice(start - 1, start - 1 + size);
}

export function smartLoopNodeLayout(node: CanvasNode, mediaCount = 0, upstreamPromptCount = 0): SmartLoopLayout {
  const fields = smartLoopPromptFields(node);
  let height = 168;
  if (node.imageInput) height += 72;
  if (node.showPrompt) height += 94 + Math.max(1, fields.length) * 58 + (upstreamPromptCount ? 78 : 0);
  if (node.imageInput && mediaCount) {
    const rows = Math.ceil(Math.min(10, mediaCount) / 5);
    height += rows * 44 + (rows - 1) * 6 + 8;
  }
  return { width: 340, height: Math.max(height, Number(node.h || 0)) };
}

function NumberControl({ disabled, label, max, onChange, value }: { disabled: boolean; label: string; max: number; onChange(value: number): void; value: number }) {
  const quick = [1, 2, 3, 4, 5, 6, 8, 10];
  const set = (raw: number) => onChange(Math.max(1, Math.min(max, Number(raw) || 1)));
  return <div className="loop-number-control">
    <button className="loop-smart-control loop-number-trigger" disabled={disabled} type="button"><span>{label}</span><strong>{value}</strong></button>
    <div className="loop-number-popover"><div className="loop-number-grid">{quick.map((number) => <button className={`loop-smart-control loop-number-cell ${number === value ? 'active' : ''}`} data-loop-value={number} disabled={disabled} key={number} onClick={() => set(number)} type="button">{number}</button>)}</div>
      <label className="loop-number-custom"><span>自定义</span><input aria-label={label} className="loop-smart-control loop-number-input" disabled={disabled} max={max} min="1" onChange={(event) => set(Number(event.target.value))} step="1" type="number" value={value} /></label>
    </div>
  </div>;
}

function InputThumbs({ media }: { media: SmartImageItem[] }) {
  if (!media.length) return null;
  return <div className="smart-node-input-thumbs">{media.slice(0, 10).map((item, index) => {
    const kind = smartImageMediaKind(item); const url = String(item.url || '');
    return <div className="smart-node-input-thumb" key={`${url}-${index}`}>{kind === 'video' ? <video muted preload="metadata" src={url} /> : kind === 'audio' ? <div className="audio-thumb"><i data-lucide="file-audio" /><span>Audio</span></div> : <img alt="" src={url} />}<span className="smart-node-input-badge">{index + 1}</span></div>;
  })}{media.length > 10 ? <div className="smart-node-input-thumb smart-node-input-more">+{media.length - 10}</div> : null}</div>;
}

function PromptParts({ text, onRemove }: { onRemove(): void; text: string }) {
  const parts = text.split(/(《计数》|\[计数\])/g);
  return <>{parts.map((part, index) => part === '《计数》' || part === '[计数]'
    ? <span className="loop-smart-token-chip" contentEditable={false} data-token="《计数》" key={index}><span>计数</span><button aria-label="删除变量" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemove(); }} title="删除" type="button">×</button></span>
    : part)}</>;
}

function editorText(element: HTMLElement): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const child = node as HTMLElement;
    if (child.classList.contains('loop-smart-token-chip')) return child.dataset.token || '';
    if (child.tagName === 'BR') return '\n';
    return [...child.childNodes].map(walk).join('');
  };
  return [...element.childNodes].map(walk).join('').replace(/\u00a0/g, ' ');
}

export function SmartLoopNode({ connecting, media, node, onConnectIn, onConnectOut, onDelete, onMoveStart, onPatch, onRun, onSelect, readOnly, selected, upstreamPrompts }: {
  connecting: boolean;
  media: SmartImageItem[];
  node: CanvasNode;
  onConnectIn(): void;
  onConnectOut(): void;
  onDelete(): void;
  onMoveStart(event: ReactPointerEvent<HTMLDivElement>): void;
  onPatch(patch: Record<string, unknown>, save?: boolean): void;
  onRun(): Promise<void> | void;
  onSelect(event: ReactMouseEvent<HTMLDivElement>): void;
  readOnly: boolean;
  selected: boolean;
  upstreamPrompts: string[];
}) {
  const fields = smartLoopPromptFields(node);
  const visibleFields = fields.length ? fields : [''];
  const count = Math.max(1, Math.min(100, Number(node.count || 1)));
  const loopStart = Math.max(1, Number(node.loopStart || 1));
  const batchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize || 1)));
  const previewImages = node.imageInput ? media : [];
  const outputImages = smartLoopImagesForRound(node, media, loopStart);
  const layout = smartLoopNodeLayout(node, previewImages.length, upstreamPrompts.length);
  const currentUpstream = upstreamPrompts.length ? upstreamPrompts[(loopStart - 1) % upstreamPrompts.length] : '';
  const [activeField, setActiveField] = useState(0);

  useEffect(() => { requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons()); }, [node.imageInput, node.showPrompt, node.running, fields.length, media.length]);

  const saveFields = (values: string[], save = false) => onPatch({ variablePrompts: values.length ? values : [''], variablePrompt: values.filter(Boolean).join('\n'), h: smartLoopNodeLayout({ ...node, variablePrompts: values }, previewImages.length, upstreamPrompts.length).height, w: 340 }, save);
  const toggle = (field: 'imageInput' | 'showPrompt') => {
    const patch = { [field]: !node[field] };
    if (field === 'showPrompt' && !node.showPrompt && !fields.length) Object.assign(patch, { variablePrompts: ['现在生成第《计数》张卖点图片'], variablePrompt: '现在生成第《计数》张卖点图片' });
    const next = { ...node, ...patch };
    onPatch({ ...patch, ...smartLoopNodeLayout(next, field === 'imageInput' && node.imageInput ? 0 : media.length, upstreamPrompts.length) }, true);
  };
  const changeField = (index: number, value: string, save = false) => { const next = [...visibleFields]; next[index] = value; saveFields(next, save); };
  const insertCounter = () => changeField(Math.min(activeField, visibleFields.length - 1), `${visibleFields[Math.min(activeField, visibleFields.length - 1)] || ''}《计数》`, true);

  return <div aria-label={`smart-loop ${node.id}`} className={`image-node loop-smart-node ${selected ? 'selected' : ''} ${node.running ? 'node-running' : ''}`.trim()} data-id={node.id} data-node-id={node.id} data-node-type="smart-loop" onClick={(event) => { event.stopPropagation(); onSelect(event); }} onPointerDown={onMoveStart} role="button" style={{ height: layout.height, left: Number(node.x || 0), top: Number(node.y || 0), width: layout.width }} tabIndex={0}>
    <div className="node-head"><div className="node-title">Loop</div><div className="node-actions" /></div>
    <div className="floating-node-actions"><button className="mini-x node-delete" disabled={readOnly} onClick={(event) => { event.stopPropagation(); onDelete(); }} title="删除节点" type="button"><i data-lucide="trash-2" /></button></div>
    <div className="node-body"><div className={`loop-smart-card ${node.imageInput ? 'has-image' : ''} ${node.showPrompt ? 'has-prompt' : ''}`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <div className="loop-smart-row loop-smart-top"><div className="loop-smart-seg"><button className={`loop-smart-control ${node.mode !== 'parallel' ? 'active' : ''}`} disabled={readOnly || Boolean(node.running)} onClick={() => onPatch({ mode: 'serial' }, true)} type="button">串行</button><button className={`loop-smart-control ${node.mode === 'parallel' ? 'active' : ''}`} disabled={readOnly || Boolean(node.running)} onClick={() => onPatch({ mode: 'parallel' }, true)} title="并行运行多个循环轮次" type="button">并行</button></div></div>
      <div className="loop-smart-row"><button className={`loop-smart-control loop-smart-toggle ${node.imageInput ? 'active' : ''}`} disabled={readOnly || Boolean(node.running)} onClick={() => toggle('imageInput')} type="button"><i data-lucide="image" /><span>图片输入</span></button><button className={`loop-smart-control loop-smart-toggle ${node.showPrompt ? 'active' : ''}`} disabled={readOnly || Boolean(node.running)} onClick={() => toggle('showPrompt')} type="button"><i data-lucide="text-cursor-input" /><span>提示词输入</span></button></div>
      {node.imageInput ? <div className="loop-smart-panel"><InputThumbs media={previewImages} /><div className="loop-smart-mini"><NumberControl disabled={readOnly || Boolean(node.running)} label="每轮图片" max={100} onChange={(imageBatchSize) => onPatch({ imageBatchSize }, true)} value={batchSize} /></div><div className="loop-smart-note">{outputImages.length ? `本轮将输出 ${outputImages.length} 张图片` : '请连接图片输入'}</div></div> : null}
      {node.showPrompt ? <div className="loop-smart-panel prompt-panel">{currentUpstream ? <div className="loop-smart-upstream"><div className="loop-smart-upstream-label">已找到 {upstreamPrompts.length} 个上游提示词</div><div className="loop-smart-upstream-text">{currentUpstream}</div></div> : null}
        <div className="loop-smart-prompt-list">{visibleFields.map((value, index) => <div className="loop-smart-prompt-item" key={index}><div className="loop-smart-prompt-index">{index + 1}</div><div className="loop-smart-control loop-smart-text" contentEditable={!readOnly && !node.running} data-loop-prompt-index={index} data-placeholder="输入每轮变化的提示词" onBlur={(event) => changeField(index, editorText(event.currentTarget), true)} onFocus={() => setActiveField(index)} suppressContentEditableWarning><PromptParts onRemove={() => changeField(index, value.replace(/《计数》|\[计数\]/, ''), true)} text={value || (index === 0 && !fields.length ? '现在生成第《计数》张卖点图片' : '')} /></div><button aria-label="删除提示词字段" className="loop-smart-control loop-smart-icon-btn" disabled={readOnly || Boolean(node.running) || visibleFields.length <= 1} onClick={() => saveFields(visibleFields.filter((_, itemIndex) => itemIndex !== index), true)} title="删除" type="button">×</button></div>)}</div>
        <div className="loop-smart-row loop-smart-prompt-actions"><button className="loop-smart-control loop-smart-token loop-smart-counter-token" disabled={readOnly || Boolean(node.running)} onClick={insertCounter} type="button">计数</button><span className="loop-smart-note">{upstreamPrompts.length ? `已找到 ${upstreamPrompts.length} 个上游提示词` : '每轮使用对应的变量提示词'}</span><button aria-label="新增" className="loop-smart-control loop-smart-add-prompt" disabled={readOnly || Boolean(node.running)} onClick={() => saveFields([...visibleFields, ''], true)} title="新增" type="button"><i data-lucide="plus" /></button></div>
      </div> : null}
      <div className="loop-smart-footer"><NumberControl disabled={readOnly || Boolean(node.running)} label="起始" max={9999} onChange={(value) => onPatch({ loopStart: value }, true)} value={loopStart} /><NumberControl disabled={readOnly || Boolean(node.running)} label="轮次" max={100} onChange={(value) => onPatch({ count: value }, true)} value={count} /><button className={`loop-smart-control loop-smart-run ${node.running ? 'is-stop' : ''}`} disabled={readOnly} onClick={() => void onRun()} type="button"><i data-lucide={node.running ? 'square' : 'workflow'} /><span>{node.running ? '停止运行' : '运行全部'}</span></button></div>
    </div></div>
    <div className="node-hint">拖拽节点移动</div><div className="node-resize-handle" data-resize="1" />
    <div className={`node-port port-in ${connecting ? 'port-hover' : ''}`} data-port="in" onClick={(event) => { event.stopPropagation(); onConnectIn(); }} title="输入" />
    <div className="node-port port-out" data-port="out" onPointerDown={(event) => { event.stopPropagation(); onConnectOut(); }} title="输出" />
  </div>;
}
