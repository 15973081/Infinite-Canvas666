import { useEffect, useMemo, useRef, useState } from 'react';
import { comfyClient } from './client';
import { configurableInputs, extractRunAssets, FIELD_TYPES, graphLayers, makeField, randomValue } from './domain';
import type { FieldType, RunAsset, WorkflowConfig, WorkflowDetail, WorkflowField, WorkflowGraph, WorkflowSummary } from './types';

const emptyConfig = (): WorkflowConfig => ({ title: '', fields: [], mini_cards: {} });

function announce(type: 'workflows-changed' | 'comfy-instances-changed') {
  try { const channel = new BroadcastChannel('studio-api'); channel.postMessage({ type }); channel.close(); } catch { /* unsupported browser */ }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : '操作失败';
}

function FieldControl({ field, value, onChange, onUpload }: {
  field: WorkflowField; value: unknown; onChange: (value: unknown) => void; onUpload: (file: File) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  if (field.type === 'boolean') return <label className="pfield-bool"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} /> 启用</label>;
  if (field.type === 'textarea') return <textarea className="pfield-textarea" value={String(value ?? '')} onChange={e => onChange(e.target.value)} />;
  if (field.type === 'dropdown') return <select className="pfield-select" value={String(value ?? '')} onChange={e => onChange(e.target.value)}>{field.options.map(option => <option key={option}>{option}</option>)}</select>;
  if (field.type === 'slider') return <div className="pfield-slider"><input type="range" min={field.min ?? 0} max={field.max ?? 100} step={field.step ?? 1} value={Number(value ?? 0)} onChange={e => onChange(Number(e.target.value))} /><span className="pfield-slider-val">{String(value ?? 0)}</span></div>;
  if (field.type === 'number') return <input className="pfield-input" type="number" min={field.min ?? undefined} max={field.max ?? undefined} step={field.step ?? undefined} value={Number(value ?? 0)} onChange={e => onChange(Number(e.target.value))} />;
  if (['image', 'video', 'audio'].includes(field.type)) return <>
    <button className="pfield-image-drop" type="button" onClick={() => fileRef.current?.click()}>{value ? `已上传：${String(value)}` : `选择${field.type === 'image' ? '图片' : field.type === 'video' ? '视频' : '音频'}`}</button>
    <input ref={fileRef} hidden type="file" accept={`${field.type}/*`} onChange={async e => { const file = e.target.files?.[0]; if (file) await onUpload(file); e.target.value = ''; }} />
  </>;
  return <input className="pfield-input" value={String(value ?? '')} onChange={e => onChange(e.target.value)} />;
}

function FieldEditor({ field, onUpdate }: { field: WorkflowField; onUpdate: (patch: Partial<WorkflowField>) => void }) {
  const numeric = field.type === 'number' || field.type === 'slider';
  return <div className="field-editor-grid">
    <label>显示名称<input className="small-input" value={field.name} onChange={e => onUpdate({ name: e.target.value })} /></label>
    <label>控件类型<select className="small-select" value={field.type} onChange={e => onUpdate({ type: e.target.value as FieldType })}>{FIELD_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
    {numeric && <>
      <label>最小值<input className="small-input" type="number" value={field.min ?? ''} onChange={e => onUpdate({ min: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      <label>最大值<input className="small-input" type="number" value={field.max ?? ''} onChange={e => onUpdate({ max: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      <label>步长<input className="small-input" type="number" value={field.step ?? ''} onChange={e => onUpdate({ step: e.target.value === '' ? null : Number(e.target.value) })} /></label>
    </>}
    {field.type === 'number' && <label className="random-toggle"><input type="checkbox" checked={field.random_enabled} onChange={e => onUpdate({ random_enabled: e.target.checked })} />运行时允许随机</label>}
    {field.type === 'dropdown' && <label className="field-wide">选项（每行一个）<textarea className="pfield-textarea" value={field.options.join('\n')} onChange={e => onUpdate({ options: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })} /></label>}
  </div>;
}

function GraphView({ graph, fields, selectedNode, onSelect }: { graph: WorkflowGraph; fields: WorkflowField[]; selectedNode: string | null; onSelect: (id: string) => void }) {
  const layers = useMemo(() => graphLayers(graph), [graph]);
  return <div className="modern-graph" data-testid="workflow-graph">{layers.map((layer, index) => <div className="modern-graph-layer" key={index}>{layer.map(id => {
    const node = graph[id]; const count = fields.filter(field => field.node === id).length;
    return <button type="button" key={id} className={`modern-graph-node ${selectedNode === id ? 'active' : ''} ${count ? 'exposed' : ''}`} onClick={() => onSelect(id)}>
      <strong>{node?._meta?.title || node?.class_type || '未知节点'}</strong><small>#{id} · {Object.keys(node?.inputs ?? {}).length} 个输入</small>{count > 0 && <span>{count} 个画布字段</span>}
    </button>;
  })}</div>)}</div>;
}

export function ComfySettingsApp() {
  const [instances, setInstances] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [config, setConfig] = useState<WorkflowConfig>(emptyConfig);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [mode, setMode] = useState<'graph' | 'test'>('graph');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [randomActive, setRandomActive] = useState<Record<string, boolean>>({});
  const [assets, setAssets] = useState<RunAsset[]>([]);
  const [status, setStatus] = useState('正在加载…');
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const loadWorkflows = async () => setWorkflows(await comfyClient.listWorkflows());
  useEffect(() => {
    Promise.all([comfyClient.listInstances(), comfyClient.listWorkflows()])
      .then(([nextInstances, nextWorkflows]) => { setInstances(nextInstances); setWorkflows(nextWorkflows); setStatus('已就绪'); })
      .catch(error => setStatus(message(error)));
  }, []);

  const selectWorkflow = async (name: string) => {
    setBusy(true); setStatus('正在加载工作流…');
    try {
      const next = await comfyClient.getWorkflow(name);
      const nextConfig: WorkflowConfig = { ...emptyConfig(), ...next.config, fields: next.config?.fields ?? [], mini_cards: next.config?.mini_cards ?? {} };
      setDetail(next); setConfig(nextConfig); setValues(Object.fromEntries(nextConfig.fields.map(field => [field.id, field.default]))); setRandomActive({}); setAssets([]);
      setSelectedNode(Object.keys(next.workflow)[0] ?? null); setStatus(`已加载 ${nextConfig.title || name}`);
    } catch (error) { setStatus(message(error)); }
    finally { setBusy(false); }
  };

  const updateField = (id: string, patch: Partial<WorkflowField>) => setConfig(current => ({ ...current, fields: current.fields.map(field => field.id === id ? { ...field, ...patch } : field) }));
  const toggleField = (node: string, input: string, value: unknown) => setConfig(current => {
    const found = current.fields.find(field => field.node === node && field.input === input);
    if (found) return { ...current, fields: current.fields.filter(field => field.id !== found.id) };
    const field = makeField(node, input, value);
    setValues(previous => ({ ...previous, [field.id]: field.default }));
    return { ...current, fields: [...current.fields, field] };
  });

  const saveInstances = async () => {
    const clean = instances.map(value => value.trim()).filter(Boolean);
    if (!clean.length) { setStatus('至少保留一个 ComfyUI 后端地址'); return; }
    setBusy(true);
    try { await comfyClient.saveInstances(clean); setInstances(clean); announce('comfy-instances-changed'); setStatus('后端地址已保存'); }
    catch (error) { setStatus(message(error)); } finally { setBusy(false); }
  };

  const saveConfig = async () => {
    if (!detail) return;
    setBusy(true);
    try { await comfyClient.saveConfig(detail.name, config); await loadWorkflows(); announce('workflows-changed'); setStatus('工作流配置已保存'); }
    catch (error) { setStatus(message(error)); } finally { setBusy(false); }
  };

  const deleteWorkflow = async () => {
    if (!detail || detail.builtin || !confirm(`删除工作流“${config.title || detail.name}”？`)) return;
    setBusy(true);
    try { await comfyClient.deleteWorkflow(detail.name); setDetail(null); setConfig(emptyConfig()); await loadWorkflows(); announce('workflows-changed'); setStatus('工作流已删除'); }
    catch (error) { setStatus(message(error)); } finally { setBusy(false); }
  };

  const uploadWorkflow = async (file: File) => {
    try {
      const workflow = JSON.parse(await file.text()) as WorkflowGraph;
      const proposed = file.name.replace(/\.json$/i, '');
      const name = prompt('工作流名称', proposed)?.trim(); if (!name) return;
      const result = await comfyClient.uploadWorkflow(name, workflow); await loadWorkflows(); announce('workflows-changed'); await selectWorkflow(result.name); setStatus('工作流已上传');
    } catch (error) { setStatus(message(error)); }
  };

  const run = async () => {
    if (!detail) return;
    setBusy(true); setAssets([]); setStatus('工作流运行中…');
    try {
      const runValues = Object.fromEntries(config.fields.map(field => [field.id, field.random_enabled && randomActive[field.id] ? randomValue(field) : values[field.id] ?? field.default]));
      const result = await comfyClient.run(detail.name, runValues, config); setAssets(extractRunAssets(result)); setStatus('运行完成');
    } catch (error) { setStatus(message(error)); } finally { setBusy(false); }
  };

  const nodeInputs = detail && selectedNode ? configurableInputs(detail.workflow, selectedNode) : [];
  return <div className="page"><div className="wrap">
    <header className="page-head"><div><h1 className="title">ComfyUI 工作流设置</h1><div className="sub">管理后端、工作流和暴露到画布节点的动态参数。</div></div><div className="status" role="status">{status}</div></header>
    <div className="layout">
      <aside className="sidebar">
        <section className="side-card"><div className="side-title">ComfyUI 后端地址</div>{instances.map((instance, index) => <div className="instance-row" key={index}><input className="small-input" aria-label={`后端地址 ${index + 1}`} value={instance} onChange={e => setInstances(items => items.map((item, i) => i === index ? e.target.value : item))} /><button type="button" aria-label="删除后端" onClick={() => setInstances(items => items.filter((_, i) => i !== index))}>×</button></div>)}
          <button className="upload-btn" type="button" onClick={() => setInstances(items => [...items, '127.0.0.1:8188'])}>＋ 添加后端</button><button className="action-btn save-btn" disabled={busy} type="button" onClick={saveInstances}>保存后端</button><small className="sidebar-help">格式：host:port，例如 127.0.0.1:8188</small></section>
        <section className="side-card"><div className="side-title">工作流列表</div><div className="workflow-list">{workflows.map(item => <button className={`workflow-card ${detail?.name === item.name ? 'active' : ''}`} type="button" key={item.name} onClick={() => selectWorkflow(item.name)}><span className="workflow-icon">◇</span><span><span className="workflow-name">{item.title || item.name.replace(/\.json$/i, '')}</span><span className="workflow-meta">{item.field_count ?? 0} 个画布字段</span></span>{item.builtin && <span className="builtin-badge">内置</span>}</button>)}</div>
          <button className="upload-btn" type="button" onClick={() => uploadRef.current?.click()}>↑ 上传 API 工作流</button><input hidden ref={uploadRef} type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; if (file) await uploadWorkflow(file); e.target.value = ''; }} /></section>
        <section className="side-card"><div className="preview-title-row"><div className="preview-title">画布节点预览</div><div className="preview-pill">实时</div></div><div id="previewContent">{config.fields.length ? config.fields.map(field => <label className="pfield" key={field.id}><span className="pfield-label">{field.name || field.input}</span><FieldControl field={field} value={values[field.id] ?? field.default} onChange={value => setValues(current => ({ ...current, [field.id]: value }))} onUpload={async file => { try { const value = await comfyClient.uploadMedia(file); setValues(current => ({ ...current, [field.id]: value })); setStatus('媒体已上传'); } catch (error) { setStatus(message(error)); } }} />{field.random_enabled && <span className="random-toggle"><input type="checkbox" checked={Boolean(randomActive[field.id])} onChange={e => setRandomActive(current => ({ ...current, [field.id]: e.target.checked }))} />每次运行随机</span>}</label>) : <div className="preview-empty">暴露节点输入后，控件预览会显示在这里</div>}</div></section>
      </aside>
      <main className="content">{!detail ? <div className="empty-state"><div className="empty-title">选择或上传工作流</div><div className="empty-desc">React 版编辑器支持完整动态字段配置和真实运行测试。</div></div> : <section className="graph-card">
        <div className="graph-head"><div className="graph-title-row"><div><input className="workflow-title-input" aria-label="工作流标题" value={config.title} placeholder={detail.name.replace(/\.json$/i, '')} onChange={e => setConfig(current => ({ ...current, title: e.target.value }))} /><div className="editor-sub">{Object.keys(detail.workflow).length} 个节点 · {config.fields.length} 个画布字段</div></div><div className="content-actions">{!detail.builtin && <button className="action-btn danger-btn" type="button" disabled={busy} onClick={deleteWorkflow}>删除</button>}<button className="action-btn save-btn" type="button" disabled={busy} onClick={saveConfig}>保存配置</button></div></div>
          <div className="workspace-mode-tabs"><button className={mode === 'graph' ? 'active' : ''} type="button" onClick={() => setMode('graph')}>工作流</button><button className={mode === 'test' ? 'active' : ''} type="button" onClick={() => setMode('test')}>测试画布</button></div></div>
        {mode === 'graph' ? <><GraphView graph={detail.workflow} fields={config.fields} selectedNode={selectedNode} onSelect={setSelectedNode} />{selectedNode && <div className="node-inspector"><h3>{detail.workflow[selectedNode]?._meta?.title || detail.workflow[selectedNode]?.class_type} <small>#{selectedNode}</small></h3>{nodeInputs.length ? nodeInputs.map(([input, raw]) => { const field = config.fields.find(item => item.node === selectedNode && item.input === input); return <div className={`input-row-modern ${field ? 'active' : ''}`} key={input}><label className="input-toggle"><input type="checkbox" checked={Boolean(field)} onChange={() => toggleField(selectedNode, input, raw)} /><span><strong>{input}</strong><small>{String(raw)}</small></span></label>{field && <FieldEditor field={field} onUpdate={patch => updateField(field.id, patch)} />}</div>; }) : <div className="preview-empty">此节点没有可配置的原始输入</div>}</div>}</> : <div className="test-canvas"><div className="test-canvas-card"><h3>{config.title || detail.name}</h3>{config.fields.map(field => <label className="pfield" key={field.id}><span className="pfield-label">{field.name || field.input}</span><FieldControl field={field} value={values[field.id] ?? field.default} onChange={value => setValues(current => ({ ...current, [field.id]: value }))} onUpload={async file => { const uploaded = await comfyClient.uploadMedia(file); setValues(current => ({ ...current, [field.id]: uploaded })); }} /></label>)}<button className="run-btn" disabled={busy || !config.fields.length} type="button" onClick={run}>{busy ? '运行中…' : '运行测试'}</button>{assets.length > 0 && <div className="run-assets">{assets.map(asset => asset.kind === 'video' ? <video key={asset.url} controls src={asset.url} /> : asset.kind === 'audio' ? <audio key={asset.url} controls src={asset.url} /> : <img key={asset.url} src={asset.url} alt="工作流输出" />)}</div>}</div></div>}
      </section>}</main>
    </div>
  </div></div>;
}
