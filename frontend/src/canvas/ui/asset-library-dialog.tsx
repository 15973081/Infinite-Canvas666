import { useEffect, useMemo, useState } from 'react';
import {
  canvasAssetLibraryClient,
  type CanvasAssetCategory,
  type CanvasAssetItem,
  type CanvasAssetLibraryState,
  type CanvasWorkflowLibraryPayload,
} from '../infrastructure/asset-library-client';

export interface CanvasAssetLibraryRequest {
  onInsert?(item: CanvasAssetItem): void;
  onImportWorkflow?(item: CanvasAssetItem): void | Promise<void>;
  saveItem?: { kind?: string; name?: string; url: string };
  saveWorkflow?: CanvasWorkflowLibraryPayload;
}

const emptyState: CanvasAssetLibraryState = { active_library_id: '', libraries: [] };

export function AssetLibraryDialog({ onClose, request }: { onClose: () => void; request: CanvasAssetLibraryRequest }) {
  const [state, setState] = useState(emptyState);
  const [activeLibraryId, setActiveLibraryId] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState(request.saveItem?.url || '');
  const [name, setName] = useState(request.saveItem?.name || mediaName(request.saveItem?.url || ''));
  const [status, setStatus] = useState('正在加载资产库…');
  const library = state.libraries.find((item) => item.id === activeLibraryId) ?? state.libraries[0];
  const categories = library?.categories || [];
  const category = categories.find((item) => item.id === activeCategoryId) ?? categories[0];
  const items = useMemo(() => (category?.items || []).filter((item) => {
    const needle = query.trim().toLocaleLowerCase();
    return !needle || item.name.toLocaleLowerCase().includes(needle) || item.url.toLocaleLowerCase().includes(needle);
  }), [category, query]);

  const adopt = (next: CanvasAssetLibraryState, preferredLibrary = activeLibraryId, preferredCategory = activeCategoryId) => {
    setState(next);
    const nextLibrary = next.libraries.find((item) => item.id === preferredLibrary)
      ?? next.libraries.find((item) => item.id === next.active_library_id)
      ?? next.libraries[0];
    const preferredType = request.saveWorkflow ? 'workflow' : 'image';
    const nextCategory = nextLibrary?.categories.find((item) => item.id === preferredCategory)
      ?? nextLibrary?.categories.find((item) => item.type === preferredType)
      ?? nextLibrary?.categories[0];
    setActiveLibraryId(nextLibrary?.id || '');
    setActiveCategoryId(nextCategory?.id || '');
  };

  useEffect(() => {
    let active = true;
    void canvasAssetLibraryClient.list().then((response) => {
      if (!active) return;
      adopt(response.library, response.library.active_library_id, '');
      setStatus('');
    }).catch((error) => active && setStatus(message(error)));
    return () => { active = false; };
  }, []);

  const selectLibrary = (id: string) => {
    const next = state.libraries.find((item) => item.id === id);
    setActiveLibraryId(id);
    const preferredType = request.saveWorkflow ? 'workflow' : 'image';
    setActiveCategoryId(next?.categories.find((item) => item.type === preferredType)?.id || next?.categories[0]?.id || '');
  };
  const mutate = async (action: () => ReturnType<typeof canvasAssetLibraryClient.list>, success: string, preferredCategory = category?.id || '') => {
    try {
      const response = await action();
      adopt(response.library, library?.id, preferredCategory);
      setStatus(success);
      return response;
    } catch (error) { setStatus(message(error)); return null; }
  };
  const createLibrary = async () => {
    const nextName = window.prompt('新资产库名称')?.trim();
    if (!nextName) return;
    const response = await mutate(() => canvasAssetLibraryClient.createLibrary(nextName), '资产库已创建', '');
    if (response) adopt(response.library, response.library.active_library_id, '');
  };
  const renameLibrary = async () => {
    if (!library) return;
    const nextName = window.prompt('资产库名称', library.name)?.trim();
    if (nextName) await mutate(() => canvasAssetLibraryClient.renameLibrary(library.id, nextName), '资产库已重命名');
  };
  const deleteLibrary = async () => {
    if (!library || !window.confirm(`删除资产库“${library.name}”？其中素材文件也会被删除。`)) return;
    const response = await mutate(() => canvasAssetLibraryClient.deleteLibrary(library.id), '资产库已删除', '');
    if (response) adopt(response.library, response.library.active_library_id, '');
  };
  const createCategory = async () => {
    if (!library) return;
    const nextName = window.prompt('新分组名称')?.trim();
    if (!nextName) return;
    const type = request.saveWorkflow || category?.type === 'workflow' ? 'workflow' : 'image';
    const response = await mutate(() => canvasAssetLibraryClient.createCategory(library.id, nextName, type), '分组已创建');
    if (response?.category) adopt(response.library, library.id, response.category.id);
  };
  const renameCategory = async () => {
    if (!library || !category) return;
    const nextName = window.prompt('分组名称', category.name)?.trim();
    if (nextName) await mutate(() => canvasAssetLibraryClient.renameCategory(library.id, category.id, nextName), '分组已重命名');
  };
  const deleteCategory = async () => {
    if (!library || !category || !window.confirm(`删除分组“${category.name}”？其中素材文件也会被删除。`)) return;
    await mutate(() => canvasAssetLibraryClient.deleteCategory(library.id, category.id), '分组已删除', '');
  };
  const addUrl = async () => {
    if (!library || !category) { setStatus('请先选择资产库与媒体分组'); return; }
    if (category.type !== 'image') { setStatus('工作流分组不能保存媒体'); return; }
    if (!url.trim()) { setStatus('请输入本地 /assets 或 /output 媒体地址'); return; }
    const response = await mutate(() => canvasAssetLibraryClient.addUrl(library.id, category.id, url.trim(), name.trim() || mediaName(url)), '素材已保存');
    if (response?.item) {
      setUrl(''); setName('');
      if (request.saveItem) onClose();
    }
  };
  const renameItem = async (item: CanvasAssetItem) => {
    const nextName = window.prompt('素材名称', item.name)?.trim();
    if (nextName) await mutate(() => canvasAssetLibraryClient.renameItem(item.id, nextName), '素材已重命名');
  };
  const deleteItem = async (item: CanvasAssetItem) => {
    if (!library || !window.confirm(`删除素材“${item.name}”？本地文件副本也会被删除。`)) return;
    await mutate(() => canvasAssetLibraryClient.deleteItem(library.id, item.id), '素材已删除');
  };
  const saveWorkflow = async () => {
    if (!library || !category || !request.saveWorkflow) return;
    if (category.type !== 'workflow') { setStatus('请选择工作流分组'); return; }
    const response = await mutate(() => canvasAssetLibraryClient.saveWorkflow(library.id, category.id, request.saveWorkflow!), '工作流已保存到资产库');
    if (response?.item) onClose();
  };
  const useItem = async (item: CanvasAssetItem) => {
    try {
      if (item.kind === 'workflow') await request.onImportWorkflow?.(item);
      else request.onInsert?.(item);
      onClose();
    } catch (error) { setStatus(message(error)); }
  };

  return <div aria-modal="true" className="modal open canvas-modern-backups canvas-asset-dialog" role="dialog"><section className="modal-panel">
    <header><strong>{request.saveWorkflow ? '保存工作流到资产库' : request.saveItem ? '保存到资产库' : '资产库'}</strong><button onClick={onClose} type="button">关闭</button></header>
    <div className="canvas-asset-toolbar">
      <select aria-label="资产库" onChange={(event) => selectLibrary(event.target.value)} value={library?.id || ''}>{state.libraries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <button onClick={() => void createLibrary()} type="button">新建库</button><button disabled={!library} onClick={() => void renameLibrary()} type="button">重命名库</button><button disabled={!library || state.libraries.length <= 1} onClick={() => void deleteLibrary()} type="button">删除库</button>
      <button disabled={!library} onClick={() => void createCategory()} type="button">新建分组</button><button disabled={!category} onClick={() => void renameCategory()} type="button">重命名分组</button><button disabled={!category} onClick={() => void deleteCategory()} type="button">删除分组</button>
      <input aria-label="搜索资产" onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或地址" value={query} />
    </div>
    <div className="canvas-asset-body">
      <aside>{categories.map((item) => <button className={item.id === category?.id ? 'active' : ''} key={item.id} onClick={() => setActiveCategoryId(item.id)} type="button"><strong>{item.name}</strong><small>{item.type === 'workflow' ? '工作流' : `${item.items.length} 项`}</small></button>)}</aside>
      <div className="canvas-asset-content">
        {category?.type === 'image' ? <div className="canvas-asset-add"><input aria-label="素材地址" onChange={(event) => setUrl(event.target.value)} placeholder="/output/result.png 或 /assets/…" value={url} /><input aria-label="素材名称" onChange={(event) => setName(event.target.value)} placeholder="素材名称（可选）" value={name} /><button className="primary-btn" onClick={() => void addUrl()} type="button">{request.saveItem ? '保存输出' : '添加地址'}</button></div> : null}
        {request.saveWorkflow ? <div className="canvas-asset-workflow-save"><span>将“{request.saveWorkflow.name}”及可找到的本地资源保存到当前工作流分组。</span><button className="primary-btn" disabled={category?.type !== 'workflow'} onClick={() => void saveWorkflow()} type="button">保存工作流</button></div> : null}
        <div className="canvas-modern-asset-grid">{items.map((item) => <article key={item.id}>
          <button className="canvas-asset-preview" disabled={item.kind === 'workflow' ? !request.onImportWorkflow : !request.onInsert} onClick={() => void useItem(item)} type="button">{assetPreview(item)}<small>{item.name}</small></button>
          <div><button onClick={() => void renameItem(item)} type="button">重命名</button><button onClick={() => void deleteItem(item)} type="button">删除</button></div>
        </article>)}</div>
        {!items.length ? <p>当前分组暂无匹配内容</p> : null}
      </div>
    </div>
    {status ? <div className="gate-status" role="status">{status}</div> : null}
  </section></div>;
}

function assetPreview(item: CanvasAssetItem) {
  if (item.kind === 'image') return <img alt={item.name} src={item.url} />;
  return <span>{item.kind === 'video' ? '视频' : item.kind === 'audio' ? '音频' : '工作流'}</span>;
}

function mediaName(url: string): string {
  const path = url.split(/[?#]/, 1)[0];
  return decodeURIComponent(path.split('/').pop() || '生成结果');
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
