import { useEffect, useMemo, useState } from 'react';
import { StudioPage } from '../../shared/page-root';
import { publishStudioEvent } from '../../shared/studio-events';
import { providerClient } from './client';
import { createProvider, modelKey, modelPrice, normalizeProvider, PROTOCOLS, providerId, setModelPrice, uniqueModels } from './domain';
import type { ApiProvider, ModelKind, ModelScopeLora, ProviderProbeResult } from './types';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败';
const modelKinds: Array<{ kind: ModelKind; label: string }> = [{ kind: 'image', label: '图片模型' }, { kind: 'chat', label: '对话模型' }, { kind: 'video', label: '视频模型' }];

function ModelSection({ provider, kind, onChange }: { provider: ApiProvider; kind: ModelKind; onChange: (provider: ApiProvider) => void }) {
  const key = modelKey(kind); const models = provider[key];
  const updateModel = (index: number, value: string) => {
    const old = models[index]; const next = [...models]; next[index] = value;
    const protocols = { ...provider.model_protocols }; if (protocols[old]) { protocols[value] = protocols[old]; delete protocols[old]; }
    const prices = provider.model_prices.map(price => price.kind === kind && price.model === old ? { ...price, model: value } : price);
    onChange({ ...provider, [key]: next, model_protocols: protocols, model_prices: prices });
  };
  const remove = (index: number) => {
    const removed = models[index]; const protocols = { ...provider.model_protocols }; delete protocols[removed];
    onChange({ ...provider, [key]: models.filter((_, i) => i !== index), model_protocols: protocols, model_prices: provider.model_prices.filter(price => !(price.kind === kind && price.model === removed && !price.effective_to)) });
  };
  return <section className="provider-model-section"><div className="provider-section-head"><div><h3>{modelKinds.find(item => item.kind === kind)?.label}</h3><span>{models.length} 个</span></div><button className="studio-button" type="button" onClick={() => onChange({ ...provider, [key]: [...models, ''] })}>＋ 模型</button></div>
    <div className="provider-model-list">{models.length ? models.map((model, index) => { const price = modelPrice(provider, kind, model); return <div className="provider-model-row" key={`${kind}-${index}`}>
      <input className="studio-input" aria-label={`${kind} 模型 ${index + 1}`} value={model} onChange={event => updateModel(index, event.target.value)} placeholder="模型 ID" />
      <select className="studio-input model-protocol" aria-label={`${model || kind} 单模型协议`} value={provider.model_protocols[model] || ''} onChange={event => { const protocols = { ...provider.model_protocols }; if (event.target.value) protocols[model] = event.target.value as 'openai' | 'gemini'; else delete protocols[model]; onChange({ ...provider, model_protocols: protocols }); }}><option value="">跟随平台</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option></select>
      {kind !== 'chat' && <><select className="studio-input model-billing" aria-label={`${model || kind} 计费方式`} value={price?.billing_type || (kind === 'video' ? 'per_second' : 'per_image')} onChange={event => onChange(setModelPrice(provider, kind, model, price?.unit_price || '', event.target.value))}><option value="per_image">按图片</option><option value="per_second">按秒</option><option value="per_call">按次</option></select><input className="studio-input model-price" aria-label={`${model || kind} 单价`} type="number" min="0" step="0.000001" value={price?.unit_price || ''} placeholder="人民币单价" onChange={event => onChange(setModelPrice(provider, kind, model, event.target.value, price?.billing_type || (kind === 'video' ? 'per_second' : 'per_image')))} /></>}
      <button className="studio-button danger" type="button" aria-label={`删除 ${model || kind} 模型`} onClick={() => remove(index)}>×</button>
    </div>; }) : <div className="provider-inline-empty">暂无模型，可手动添加或从上游拉取。</div>}</div>
  </section>;
}

function LoraEditor({ provider, onChange }: { provider: ApiProvider; onChange: (provider: ApiProvider) => void }) {
  const update = (index: number, patch: Partial<ModelScopeLora>) => onChange({ ...provider, ms_loras: provider.ms_loras.map((lora, i) => i === index ? { ...lora, ...patch } : lora) });
  return <section className="provider-model-section"><div className="provider-section-head"><div><h3>ModelScope LoRA</h3><span>{provider.ms_loras.length} 个</span></div><button className="studio-button" type="button" onClick={() => onChange({ ...provider, ms_loras: [...provider.ms_loras, { id: '', name: '', target_model: provider.image_models[0] || '', strength: 0.8, enabled: true, note: '' }] })}>＋ LoRA</button></div>
    {provider.ms_loras.map((lora, index) => <div className="provider-lora-row" key={index}><input className="studio-input" aria-label={`LoRA ID ${index + 1}`} value={lora.id} placeholder="组织/LoRA-ID" onChange={event => update(index, { id: event.target.value })} /><input className="studio-input" value={lora.name} placeholder="显示名称" onChange={event => update(index, { name: event.target.value })} /><select className="studio-input" value={lora.target_model} onChange={event => update(index, { target_model: event.target.value })}>{provider.image_models.map(model => <option key={model}>{model}</option>)}</select><input className="studio-input" aria-label={`LoRA 强度 ${index + 1}`} type="number" min="0" max="2" step="0.05" value={lora.strength} onChange={event => update(index, { strength: Number(event.target.value) })} /><label className="studio-toggle"><input type="checkbox" checked={lora.enabled} onChange={event => update(index, { enabled: event.target.checked })} />启用</label><button className="studio-button danger" type="button" onClick={() => onChange({ ...provider, ms_loras: provider.ms_loras.filter((_, i) => i !== index) })}>×</button></div>)}
  </section>;
}

export function ProviderStudioApp() {
  const [providers, setProviders] = useState<ApiProvider[]>([]); const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState('正在加载平台…'); const [busy, setBusy] = useState(false); const [probe, setProbe] = useState<ProviderProbeResult | null>(null);
  useEffect(() => { providerClient.list().then(items => { const next = items.map(normalizeProvider); setProviders(next); setSelectedId(next[0]?.id || ''); setStatus('已就绪'); }).catch(error => setStatus(errorMessage(error))); }, []);
  const provider = providers.find(item => item.id === selectedId) ?? providers[0];
  const update = (next: ApiProvider) => { setProviders(items => items.map(item => item.id === provider.id ? next : item)); if (next.id !== provider.id) setSelectedId(next.id); };
  const add = () => { const next = createProvider(providers); setProviders(items => [...items, next]); setSelectedId(next.id); setProbe(null); };
  const remove = () => { if (!provider || providers.length <= 1 || !confirm(`删除平台“${provider.name}”？`)) return; const next = providers.filter(item => item !== provider); setProviders(next); setSelectedId(next[0]?.id || ''); };
  const save = async () => {
    if (new Set(providers.map(item => providerId(item.id))).size !== providers.length) { setStatus('平台 ID 不能重复'); return; }
    setBusy(true); setStatus('正在保存…');
    try {
      const payload = providers.map((item, index) => ({ ...normalizeProvider(item, index), api_key: item.api_key || undefined, clear_key: item.clear_key === true,
        volcengine_access_key_id: item.volcengine_access_key_id || undefined, volcengine_secret_access_key: item.volcengine_secret_access_key || undefined,
        clear_volcengine_access_key_id: item.clear_volcengine_access_key_id === true, clear_volcengine_secret_access_key: item.clear_volcengine_secret_access_key === true,
      }));
      const saved = (await providerClient.save(payload)).map(normalizeProvider); setProviders(saved); setSelectedId(saved.find(item => item.id === selectedId)?.id || saved[0]?.id || ''); publishStudioEvent('providers-changed'); setStatus('平台配置已保存');
    } catch (error) { setStatus(errorMessage(error)); } finally { setBusy(false); }
  };
  const runProbe = async (kind: 'test' | 'async' | 'models') => {
    if (!provider) return; setBusy(true); setStatus(kind === 'models' ? '正在拉取模型…' : '正在验证连接…');
    try {
      const result = kind === 'test' ? await providerClient.test(provider) : kind === 'async' ? await providerClient.probeAsync(provider) : await providerClient.fetchModels(provider);
      setProbe(result);
      const patch: Partial<ApiProvider> = {};
      if (result.protocol && PROTOCOLS.some(item => item.value === result.protocol)) patch.protocol = result.protocol;
      if (result.image_request_mode === 'openai-json') patch.image_request_mode = 'openai-json';
      if (kind === 'models') { patch.image_models = uniqueModels(result.image_models); patch.chat_models = uniqueModels(result.chat_models); patch.video_models = uniqueModels(result.video_models); }
      update({ ...provider, ...patch }); setStatus(result.message || (result.ok === false ? '验证失败' : `完成，发现 ${result.model_count ?? result.total ?? result.all?.length ?? 0} 个模型`));
    } catch (error) { setProbe({ ok: false, message: errorMessage(error) }); setStatus(errorMessage(error)); } finally { setBusy(false); }
  };
  const hasVolc = provider?.id === 'volcengine' || provider?.protocol === 'volcengine';
  return <StudioPage title="API 设置" subtitle="集中管理平台、凭据、协议、模型、价格与 LoRA；密钥只写入服务端环境。" status={status}>
    <div className="provider-layout"><aside className="studio-card provider-sidebar"><div className="provider-sidebar-title">平台列表</div>{providers.map(item => <button type="button" className={`provider-list-item ${provider?.id === item.id ? 'active' : ''}`} key={item.id} onClick={() => { setSelectedId(item.id); setProbe(null); }}><span><strong>{item.name}</strong><small>{item.id} · {item.protocol}</small></span><i className={item.enabled ? 'online' : ''} /></button>)}<button className="studio-button" type="button" onClick={add}>＋ 新增平台</button></aside>
      <main>{provider && <div className="provider-editor"><section className="studio-card provider-block"><div className="provider-editor-head"><div><h2>{provider.name}</h2><p>{provider.id}</p></div><div><button className="studio-button danger" disabled={providers.length <= 1 || busy} type="button" onClick={remove}>删除</button><button className="studio-button primary" disabled={busy} type="button" onClick={save}>保存全部</button></div></div>
        <div className="provider-form-grid"><label className="studio-label">平台名称<input className="studio-input" aria-label="平台名称" value={provider.name} onChange={event => update({ ...provider, name: event.target.value })} /></label><label className="studio-label">平台 ID<input className="studio-input" aria-label="平台 ID" value={provider.id} onChange={event => update({ ...provider, id: providerId(event.target.value) })} /></label><label className="studio-label provider-wide">Base URL<input className="studio-input" aria-label="Base URL" value={provider.base_url} onChange={event => update({ ...provider, base_url: event.target.value })} /></label><label className="studio-label">协议<select className="studio-input" aria-label="协议" value={provider.protocol} onChange={event => update({ ...provider, protocol: event.target.value as ApiProvider['protocol'] })}>{PROTOCOLS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label className="studio-label">图片请求格式<select className="studio-input" aria-label="图片请求格式" value={provider.image_request_mode} onChange={event => update({ ...provider, image_request_mode: event.target.value as ApiProvider['image_request_mode'] })}><option value="openai">OpenAI multipart</option><option value="openai-json">OpenAI JSON</option></select></label>{provider.id !== 'modelscope' && !hasVolc && <label className="studio-label provider-wide">代理地址<input className="studio-input" aria-label="代理地址" value={provider.proxy_url} placeholder="http://127.0.0.1:7890" onChange={event => update({ ...provider, proxy_url: event.target.value })} /></label>}<label className="studio-toggle"><input type="checkbox" checked={provider.enabled} onChange={event => update({ ...provider, enabled: event.target.checked })} />启用平台</label><label className="studio-toggle"><input type="checkbox" checked={provider.primary} onChange={event => setProviders(items => items.map(item => ({ ...item, primary: item.id === provider.id ? event.target.checked : false })))} />设为主要平台</label></div>
      </section>
      <section className="studio-card provider-block"><div className="provider-section-head"><div><h3>访问凭据</h3><span>{provider.has_key ? `已保存 ${provider.key_preview || ''}` : '尚未保存'}</span></div></div><div className="provider-form-grid"><label className="studio-label provider-wide">API Key<input className="studio-input" aria-label="API Key" type="password" autoComplete="new-password" value={provider.api_key || ''} placeholder={provider.has_key ? '输入新值以替换现有 Key' : '输入 API Key'} onChange={event => update({ ...provider, api_key: event.target.value, clear_key: false })} /></label><label className="studio-toggle"><input type="checkbox" checked={provider.clear_key === true} onChange={event => update({ ...provider, clear_key: event.target.checked, api_key: event.target.checked ? '' : provider.api_key })} />保存时清除现有 Key</label></div>
        {hasVolc && <div className="provider-form-grid volc-grid"><label className="studio-label">项目名称<input className="studio-input" value={provider.volcengine_project_name} onChange={event => update({ ...provider, volcengine_project_name: event.target.value })} /></label><label className="studio-label">地域<input className="studio-input" value={provider.volcengine_region} onChange={event => update({ ...provider, volcengine_region: event.target.value })} /></label><label className="studio-label">素材库 Access Key<input className="studio-input" type="password" value={provider.volcengine_access_key_id || ''} placeholder={provider.has_volcengine_access_key ? provider.volcengine_access_key_preview : ''} onChange={event => update({ ...provider, volcengine_access_key_id: event.target.value, clear_volcengine_access_key_id: false })} /></label><label className="studio-label">素材库 Secret Key<input className="studio-input" type="password" value={provider.volcengine_secret_access_key || ''} placeholder={provider.has_volcengine_secret_key ? provider.volcengine_secret_key_preview : ''} onChange={event => update({ ...provider, volcengine_secret_access_key: event.target.value, clear_volcengine_secret_access_key: false })} /></label><label className="studio-toggle"><input type="checkbox" checked={provider.clear_volcengine_access_key_id === true} onChange={event => update({ ...provider, clear_volcengine_access_key_id: event.target.checked, volcengine_access_key_id: event.target.checked ? '' : provider.volcengine_access_key_id })} />清除素材库 Access Key</label><label className="studio-toggle"><input type="checkbox" checked={provider.clear_volcengine_secret_access_key === true} onChange={event => update({ ...provider, clear_volcengine_secret_access_key: event.target.checked, volcengine_secret_access_key: event.target.checked ? '' : provider.volcengine_secret_access_key })} />清除素材库 Secret Key</label></div>}
        <div className="provider-actions"><button className="studio-button" disabled={busy} type="button" onClick={() => runProbe('test')}>测试连接</button><button className="studio-button" disabled={busy} type="button" onClick={() => runProbe('async')}>检测异步协议</button><button className="studio-button primary" disabled={busy} type="button" onClick={() => runProbe('models')}>拉取模型</button></div>{probe && <div className={`provider-probe ${probe.ok === false ? 'failed' : 'success'}`}><strong>{probe.ok === false ? '验证未通过' : '验证完成'}</strong><span>{probe.message || `发现 ${probe.model_count ?? probe.total ?? probe.all?.length ?? 0} 个模型`}</span></div>}
      </section>
      <section className="studio-card provider-block">{modelKinds.map(item => <ModelSection key={item.kind} provider={provider} kind={item.kind} onChange={update} />)}{provider.id === 'modelscope' && <LoraEditor provider={provider} onChange={update} />}</section>
      </div>}</main></div>
  </StudioPage>;
}
