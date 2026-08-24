import { useEffect, useMemo, useState } from 'react';
import { promptLibraryClient, type PromptCategory, type PromptItem, type PromptLibrary, type PromptLibraryState } from '../infrastructure/prompt-library-client';

type TemplateItem = PromptItem & { builtin: boolean; libraryId: string; params?: Record<string, unknown> };

const defaultGroups: PromptCategory[] = [
  { id: 'view', name: '视角' },
  { id: 'storyboard', name: '分镜' },
  { id: 'character', name: '角色' },
  { id: 'product', name: '产品' },
  { id: 'lighting', name: '光影' },
  { id: 'mine', name: '我的' },
];

export function smartCanvasPromptTemplateText(item: Pick<TemplateItem, 'builtin' | 'negative' | 'params' | 'positive'>, mode: 'full' | 'positive'): string {
  const positive = String(item.positive || '').trim();
  if (mode === 'positive' || !item.builtin) return positive;
  const negative = String(item.negative || '').trim();
  const params = Object.entries(item.params || {}).map(([key, value]) => `${key}: ${value}`).join('\n');
  return [positive, negative ? `Negative prompt:\n${negative}` : '', params ? `Params:\n${params}` : ''].filter(Boolean).join('\n\n');
}

export function smartCanvasPromptTemplateMatches(item: PromptItem, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || [item.name, item.positive, item.negative, item.scene, (item as PromptItem & { name_en?: string }).name_en, (item as PromptItem & { scene_en?: string }).scene_en]
    .some((value) => String(value || '').toLocaleLowerCase().includes(needle));
}

function templatesFor(library: PromptLibrary | undefined): TemplateItem[] {
  if (!library) return [];
  return (library.items || []).filter((item) => item?.id && item?.positive).map((item) => ({
    ...item,
    builtin: library.id === 'system',
    libraryId: library.id,
    params: (item as PromptItem & { params?: Record<string, unknown> }).params || {},
  }));
}

function draftFor(item: TemplateItem | undefined) {
  return { category: item?.category || 'mine', name: item?.name || '', positive: item?.positive || '' };
}

export function SmartCanvasPromptTemplate({ initialText, onApply, onClose, readOnly = false, target }: {
  initialText: string;
  onApply: (text: string, promptPresetId: string) => void;
  onClose: () => void;
  readOnly?: boolean;
  target: 'composer' | 'node';
}) {
  const [state, setState] = useState<PromptLibraryState>({ active_library_id: '', libraries: [] });
  const [activeId, setActiveId] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [groupEditing, setGroupEditing] = useState(false);
  const [draft, setDraft] = useState(draftFor(undefined));
  const [status, setStatus] = useState('正在加载提示词库…');
  const library = state.libraries.find((item) => item.id === activeId) ?? state.libraries[0];
  const groups = library?.categories?.length ? library.categories : (library?.id === 'system' ? defaultGroups : []);
  const allItems = useMemo(() => templatesFor(library), [library]);
  const items = useMemo(() => allItems.filter((item) => (category === 'all' || item.category === category) && smartCanvasPromptTemplateMatches(item, query)), [allItems, category, query]);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const canEdit = Boolean(library && !library.readonly && !readOnly);
  const counts = allItems.reduce<Record<string, number>>((result, item) => ({ ...result, [item.category || 'mine']: (result[item.category || 'mine'] || 0) + 1 }), { all: allItems.length });

  const adopt = (next: PromptLibraryState, preferredLibrary = activeId, preferredItem = selectedId) => {
    setState(next);
    const nextLibrary = next.libraries.find((item) => item.id === preferredLibrary)
      ?? next.libraries.find((item) => item.id === next.active_library_id)
      ?? next.libraries[0];
    setActiveId(nextLibrary?.id || '');
    const nextItems = templatesFor(nextLibrary);
    const nextItem = nextItems.find((item) => item.id === preferredItem) ?? nextItems[0];
    setSelectedId(nextItem?.id || '');
    setDraft(draftFor(nextItem));
  };

  useEffect(() => {
    let active = true;
    void promptLibraryClient.list().then((response) => {
      if (!active) return;
      adopt(response.library, response.library.active_library_id, '');
      setStatus('');
    }).catch(async (error) => {
      if (!active) return;
      try {
        const response = await fetch('/api/smart-canvas/prompt-templates');
        const payload = await response.json() as { templates?: PromptItem[] };
        const fallback = { active_library_id: 'system', libraries: [{ categories: defaultGroups, id: 'system', items: payload.templates || [], name: '系统提示词库', readonly: true }] };
        adopt(fallback, 'system', '');
        setStatus('');
      } catch {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', keydown);
    return () => { active = false; window.removeEventListener('keydown', keydown); };
    // Opening always reloads the server library, matching the legacy panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = items.find((item) => item.id === selectedId) ?? items[0];
    if (current?.id !== selectedId) setSelectedId(current?.id || '');
    if (!editing) setDraft(draftFor(current));
  }, [category, items, query, selectedId, editing]);

  useEffect(() => {
    requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons());
  }, [editing, groupEditing, items, selected]);

  const fail = (error: unknown, fallback: string) => setStatus(error instanceof Error ? error.message : fallback);
  const selectLibrary = (id: string) => {
    const next = state.libraries.find((item) => item.id === id);
    const nextItem = templatesFor(next)[0];
    setActiveId(id);
    setCategory('all');
    setSelectedId(nextItem?.id || '');
    setDraft(draftFor(nextItem));
    setEditing(false);
    setGroupEditing(false);
  };
  const saveCurrent = async () => {
    if (!library || !canEdit) return;
    const text = initialText.trim();
    if (!text) { setStatus('当前提示词为空'); return; }
    try {
      const response = await promptLibraryClient.savePrompt(library.id, { category: category === 'all' ? 'custom' : category, name: text.split(/\r?\n/, 1)[0].slice(0, 28) || '提示词预设', negative: '', positive: text, scene: '我的提示词预设' });
      adopt(response.library, library.id, response.item?.id || '');
      setCategory(response.item?.category || 'custom');
      setEditing(true);
      setStatus('当前提示词已保存');
    } catch (error) { fail(error, '保存失败'); }
  };
  const createTemplate = async () => {
    if (!library || !canEdit) return;
    const nextCategory = category !== 'all' ? category : 'custom';
    try {
      const response = await promptLibraryClient.savePrompt(library.id, { category: nextCategory, name: '新模板', negative: '', positive: '新提示词', scene: '我的提示词预设' });
      adopt(response.library, library.id, response.item?.id || '');
      setCategory(nextCategory);
      setEditing(true);
      setStatus('模板已创建');
    } catch (error) { fail(error, '创建失败'); }
  };
  const saveEdit = async () => {
    if (!library || !selected || !canEdit) return;
    const name = draft.name.trim();
    const positive = draft.positive.trim();
    if (!name || !positive) { setStatus('名称和内容不能为空'); return; }
    try {
      const response = await promptLibraryClient.savePrompt(library.id, { id: selected.id, category: draft.category || 'mine', name, negative: selected.negative || '', positive, scene: selected.scene || '' });
      adopt(response.library, library.id, response.item?.id || selected.id);
      setEditing(false);
      setStatus('模板已保存');
    } catch (error) { fail(error, '保存失败'); }
  };
  const removeTemplate = async () => {
    if (!selected || !canEdit) return;
    try {
      const response = await promptLibraryClient.deletePrompts([selected.id]);
      adopt(response.library, library?.id, '');
      setEditing(false);
      setStatus('模板已删除');
    } catch (error) { fail(error, '删除失败'); }
  };
  const createGroup = async () => {
    if (!library || !canEdit) return;
    const name = window.prompt('新分组名称', '新分组')?.trim().slice(0, 24);
    if (!name) return;
    try {
      const response = await promptLibraryClient.createCategory(library.id, name);
      adopt(response.library, library.id, selectedId);
      setCategory(response.category?.id || category);
      setStatus('分组已创建');
    } catch (error) { fail(error, '新增分组失败'); }
  };
  const renameGroup = async (group: PromptCategory) => {
    if (!library || !canEdit) return;
    const name = window.prompt('分组名称', group.name)?.trim().slice(0, 24);
    if (!name) return;
    try { const response = await promptLibraryClient.renameCategory(library.id, group.id, name); adopt(response.library, library.id, selectedId); setStatus('分组已重命名'); }
    catch (error) { fail(error, '重命名失败'); }
  };
  const deleteGroup = async (group: PromptCategory) => {
    if (!library || !canEdit || !window.confirm('删除该分组？分组内模板将移到其他分组。')) return;
    try { const response = await promptLibraryClient.deleteCategory(group.id); adopt(response.library, library.id, selectedId); if (category === group.id) setCategory('all'); setStatus('分组已删除'); }
    catch (error) { fail(error, '删除失败'); }
  };
  const apply = (mode: 'full' | 'positive') => {
    if (!selected) return;
    onApply(smartCanvasPromptTemplateText(selected, mode), selected.builtin ? '' : selected.id);
    onClose();
  };

  return <div className="prompt-template-panel open" data-status={status} data-target={target} id="promptTemplatePanel" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
    <div className="prompt-template-head"><div><strong>提示词模板库</strong><span>内置标准库 + 我的预设</span></div><button aria-label="关闭" id="promptTemplateClose" onClick={onClose} title="关闭" type="button"><i data-lucide="x" /></button></div>
    <select className="prompt-template-library-select" id="promptTemplateLibrarySelect" onChange={(event) => selectLibrary(event.target.value)} title="选择提示词库" value={library?.id || ''}>{state.libraries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    <div className="prompt-template-search"><i data-lucide="search" /><input autoFocus id="promptTemplateSearch" onChange={(event) => setQuery(event.target.value)} placeholder="搜索模板..." type="search" value={query} /></div>
    <div className="prompt-template-cats" id="promptTemplateCats">{groupEditing ? <div className="prompt-template-group-panel">
      <div className="prompt-template-group-title"><div><strong>管理分组</strong><span>新增、重命名或删除模板分组</span></div><div className="prompt-template-group-tools"><button onClick={() => void createGroup()} type="button"><i data-lucide="plus" /><span>新增</span></button><button className="primary" onClick={() => setGroupEditing(false)} type="button"><i data-lucide="check" /><span>完成</span></button></div></div>
      <div className="prompt-template-group-list">{groups.map((group) => <div className="prompt-template-group-row has-delete" key={group.id}><button className={`group-name ${group.id === category ? 'active' : ''}`} onClick={() => setCategory(group.id)} type="button"><span>{group.name}</span><small>{counts[group.id] || 0}</small></button><button aria-label={`重命名 ${group.name}`} className="group-tool" disabled={!canEdit} onClick={() => void renameGroup(group)} title="重命名" type="button"><i data-lucide="pencil" /></button><button aria-label={`删除 ${group.name}`} className="group-tool danger" disabled={!canEdit} onClick={() => void deleteGroup(group)} title="删除" type="button"><i data-lucide="trash-2" /></button></div>)}</div>
    </div> : <div className="prompt-template-nav"><div className="prompt-template-tabs">{[{ id: 'all', name: '全部' }, ...groups].map((group) => <button className={group.id === category ? 'active' : ''} key={group.id} onClick={() => { setCategory(group.id); setEditing(false); }} type="button"><span>{group.name}</span><small>{counts[group.id] || 0}</small></button>)}</div><button className="prompt-template-manage-groups" onClick={() => setGroupEditing(true)} type="button"><i data-lucide="settings-2" /><span>管理分组</span></button></div>}</div>
    <div className="prompt-template-body" id="promptTemplateBody"><div className="prompt-template-list"><div className="prompt-template-list-tools"><button disabled={!canEdit || !initialText.trim()} onClick={() => void saveCurrent()} type="button"><i data-lucide="bookmark-plus" /><span>保存当前</span></button><button disabled={!canEdit} onClick={() => void createTemplate()} type="button"><i data-lucide="file-plus-2" /><span>新建模板</span></button></div>
      {items.length ? items.map((item) => <button className={`prompt-template-card ${item.id === selected?.id ? 'active' : ''}`} data-template-id={item.id} key={item.id} onClick={() => { setSelectedId(item.id); setDraft(draftFor(item)); setEditing(false); }} type="button"><span className="prompt-template-card-top"><span className="prompt-template-name">{item.name}</span><span className="prompt-template-source">{item.builtin ? '内置' : '我的'}</span></span><span className="prompt-template-scene">{item.scene || item.positive}</span><span className="prompt-template-tag">{groups.find((group) => group.id === item.category)?.name || item.category}</span></button>) : <div className="prompt-template-list-empty">没有匹配的模板</div>}
    </div><div className="prompt-template-detail">{selected ? <><div className="prompt-template-detail-head"><div><strong>{selected.name}</strong><span>{groups.find((group) => group.id === selected.category)?.name || selected.category} · {selected.builtin ? '内置模板' : '我的模板'}</span></div>{editing ? null : <div className="prompt-template-icon-actions"><button disabled={!canEdit} onClick={() => { setDraft(draftFor(selected)); setEditing(true); }} title="编辑模板" type="button"><i data-lucide="pencil" /><span>编辑</span></button><button className="danger" disabled={!canEdit} onClick={() => void removeTemplate()} title="删除模板" type="button"><i data-lucide="trash-2" /><span>删除</span></button></div>}</div>
      {editing ? <div className="prompt-template-edit-fields"><label>名称</label><input data-template-edit-name onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="名称" value={draft.name} /><label>分组</label><select data-template-edit-category onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} value={draft.category}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><label>内容</label><textarea data-template-edit-text onChange={(event) => setDraft((current) => ({ ...current, positive: event.target.value }))} placeholder="内容" value={draft.positive} /></div> : <div className="prompt-template-preview-content"><div className="prompt-template-section"><label>正向提示词</label><p>{selected.positive}</p></div>{selected.negative ? <div className="prompt-template-section"><label>负向提示词</label><p>{selected.negative}</p></div> : null}{Object.keys(selected.params || {}).length ? <div className="prompt-template-section"><label>参数建议</label><p>{Object.entries(selected.params || {}).map(([key, value]) => `${key}: ${value}`).join('\n')}</p></div> : null}</div>}
      <div className="prompt-template-actions">{editing ? <><button onClick={() => setEditing(false)} type="button"><i data-lucide="x" /><span>取消</span></button><button className="danger" disabled={!canEdit} onClick={() => void removeTemplate()} type="button"><i data-lucide="trash-2" /><span>删除</span></button><button className="primary" disabled={!canEdit} onClick={() => void saveEdit()} type="button"><i data-lucide="save" /><span>保存</span></button></> : <><button onClick={() => apply('positive')} type="button"><i data-lucide="corner-down-left" /><span>正向</span></button><button className="primary" onClick={() => apply('full')} type="button"><i data-lucide="wand-sparkles" /><span>完整应用</span></button></>}</div></> : <div className="prompt-template-empty">选择或新建一个模板</div>}
    </div></div>
  </div>;
}
