import { useEffect, useMemo, useState } from 'react';
import { promptLibraryClient, type PromptItem, type PromptLibraryState } from '../infrastructure/prompt-library-client';

export interface PromptLibraryRequest {
  initialText?: string;
  onApply(text: string): void;
}

export function PromptLibraryDialog({ onClose, request }: { onClose: () => void; request: PromptLibraryRequest }) {
  const [state, setState] = useState<PromptLibraryState>({ active_library_id: '', libraries: [] });
  const [activeId, setActiveId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('正在加载提示词库…');
  const [draft, setDraft] = useState({ category: '', name: '', negative: '', positive: request.initialText || '', scene: '' });
  const library = state.libraries.find((item) => item.id === activeId) ?? state.libraries[0];
  const items = useMemo(() => (library?.items || []).filter((item) => promptMatches(item, query)), [library, query]);
  const selected = library?.items.find((item) => item.id === selectedId);

  const adopt = (next: PromptLibraryState, preferredLibrary = activeId, preferredItem = selectedId) => {
    setState(next);
    const nextLibrary = next.libraries.find((item) => item.id === preferredLibrary) ?? next.libraries.find((item) => item.id === next.active_library_id) ?? next.libraries[0];
    setActiveId(nextLibrary?.id || '');
    const nextItem = nextLibrary?.items.find((item) => item.id === preferredItem) ?? nextLibrary?.items[0];
    setSelectedId(nextItem?.id || '');
    if (nextItem) setDraft(promptDraft(nextItem));
  };

  useEffect(() => {
    let active = true;
    void promptLibraryClient.list().then((response) => {
      if (!active) return;
      adopt(response.library, response.library.active_library_id, '');
      setStatus('');
    }).catch((error) => active && setStatus(error instanceof Error ? error.message : String(error)));
    return () => { active = false; };
  }, []);

  const selectLibrary = (id: string) => {
    const next = state.libraries.find((item) => item.id === id);
    setActiveId(id);
    setSelectedId(next?.items[0]?.id || '');
    setDraft(next?.items[0] ? promptDraft(next.items[0]) : { category: next?.categories[0]?.id || '', name: '', negative: '', positive: request.initialText || '', scene: '' });
  };
  const selectItem = (item: PromptItem) => { setSelectedId(item.id); setDraft(promptDraft(item)); };
  const newPrompt = () => {
    setSelectedId('');
    setDraft({ category: library?.categories[0]?.id || '', name: '', negative: '', positive: request.initialText || '', scene: '' });
    setStatus('正在新建提示词');
  };
  const save = async () => {
    if (!library) { setStatus('请先创建提示词库'); return; }
    if (!draft.positive.trim()) { setStatus('提示词内容不能为空'); return; }
    try {
      const response = await promptLibraryClient.savePrompt(library.id, {
        ...(selected ? { id: selected.id } : {}), category: draft.category, name: draft.name.trim() || draft.positive.trim().slice(0, 28),
        negative: draft.negative, positive: draft.positive, scene: draft.scene,
      });
      const preferred = String((response as { item?: PromptItem }).item?.id || selected?.id || '');
      adopt(response.library, library.id, preferred);
      setStatus(selected ? '提示词已更新' : '提示词已创建');
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  const remove = async () => {
    if (!selected || !window.confirm(`删除提示词“${selected.name}”？`)) return;
    try {
      const response = await promptLibraryClient.deletePrompts([selected.id]);
      adopt(response.library, library?.id, '');
      setStatus('提示词已删除');
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  const createLibrary = async () => {
    const name = window.prompt('新提示词库名称')?.trim();
    if (!name) return;
    try { const response = await promptLibraryClient.createLibrary(name); adopt(response.library, response.library.active_library_id, ''); setStatus('提示词库已创建'); }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  const renameLibrary = async () => {
    if (!library || library.id === 'system') return;
    const name = window.prompt('提示词库名称', library.name)?.trim();
    if (!name) return;
    try { const response = await promptLibraryClient.renameLibrary(library.id, name); adopt(response.library, library.id, selectedId); setStatus('提示词库已重命名'); }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  const deleteLibrary = async () => {
    if (!library || library.id === 'system' || !window.confirm(`删除提示词库“${library.name}”？`)) return;
    try { const response = await promptLibraryClient.deleteLibrary(library.id); adopt(response.library, response.library.active_library_id, ''); setStatus('提示词库已删除'); }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  const createCategory = async () => {
    if (!library) return;
    const name = window.prompt('新分组名称')?.trim();
    if (!name) return;
    try { const response = await promptLibraryClient.createCategory(library.id, name); adopt(response.library, library.id, selectedId); setStatus('分组已创建'); }
    catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  const apply = (full = false) => {
    const positive = draft.positive.trim();
    if (!positive) { setStatus('提示词内容不能为空'); return; }
    request.onApply(full && draft.negative.trim() ? `${positive}\n\nNegative prompt:\n${draft.negative.trim()}` : positive);
    onClose();
  };

  return <div aria-modal="true" className="modal open canvas-modern-backups prompt-library-dialog" role="dialog"><section className="modal-panel">
    <header><strong>提示词库</strong><button onClick={onClose} type="button">关闭</button></header>
    <div className="prompt-library-toolbar">
      <select aria-label="提示词库" onChange={(event) => selectLibrary(event.target.value)} value={library?.id || ''}>{state.libraries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <button onClick={() => void createLibrary()} type="button">新建库</button><button disabled={!library || library.id === 'system'} onClick={() => void renameLibrary()} type="button">重命名库</button><button disabled={!library || library.id === 'system'} onClick={() => void deleteLibrary()} type="button">删除库</button>
      <button disabled={!library} onClick={() => void createCategory()} type="button">新建分组</button>
      <input aria-label="搜索提示词" onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、场景或内容" value={query} />
    </div>
    <div className="prompt-library-body">
      <aside><button className="primary-btn" onClick={newPrompt} type="button">新建提示词</button>{items.map((item) => <button className={item.id === selectedId ? 'active' : ''} key={item.id} onClick={() => selectItem(item)} type="button"><strong>{item.name || '未命名'}</strong><small>{item.scene || item.positive.slice(0, 60)}</small></button>)}{!items.length ? <p>当前库暂无匹配内容</p> : null}</aside>
      <div className="prompt-library-editor">
        <label>名称<input aria-label="提示词名称" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} /></label>
        <label>分组<select aria-label="提示词分组" onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} value={draft.category}><option value="">未分组</option>{(library?.categories || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>场景<input aria-label="提示词场景" onChange={(event) => setDraft((current) => ({ ...current, scene: event.target.value }))} value={draft.scene} /></label>
        <label>正向提示词<textarea aria-label="正向提示词" onChange={(event) => setDraft((current) => ({ ...current, positive: event.target.value }))} value={draft.positive} /></label>
        <label>负向提示词<textarea aria-label="负向提示词" onChange={(event) => setDraft((current) => ({ ...current, negative: event.target.value }))} value={draft.negative} /></label>
        <div className="prompt-library-actions"><button onClick={() => void save()} type="button">{selected ? '保存修改' : '创建提示词'}</button><button disabled={!selected} onClick={() => void remove()} type="button">删除提示词</button><button onClick={() => apply(false)} type="button">应用正向</button><button className="primary-btn" onClick={() => apply(true)} type="button">应用完整提示词</button></div>
      </div>
    </div>
    {status ? <div className="gate-status" role="status">{status}</div> : null}
  </section></div>;
}

function promptDraft(item: PromptItem) {
  return { category: item.category || '', name: item.name || '', negative: item.negative || '', positive: item.positive || '', scene: item.scene || '' };
}

function promptMatches(item: PromptItem, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || [item.name, item.positive, item.negative, item.scene].some((value) => value?.toLocaleLowerCase().includes(needle));
}
