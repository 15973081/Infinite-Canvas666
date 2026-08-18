import { useEffect, useMemo, useRef, useState } from 'react';
import { applyStudioTheme, normalizeStudioTheme, type StudioTheme } from '../../shared/theme';
import { subscribeStudioEvents } from '../../shared/studio-events';
import { shellClient } from './client';
import { ACTIVE_PAGE_KEY, DEFAULT_PAGE, isForwardableEvent, normalizePageId, pageFromHash, routeHash, SHELL_PINNED_KEY, SITE_PAGES, UPDATE_SOURCE_KEY } from './domain';
import type { AppInfo, ConnectivityResult, SitePage, SitePageGroup, SitePageId, UpdateBackup, UpdateCheck, UpdateResult } from './types';

const uuid = () => crypto.randomUUID?.() || `shell-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败';
const groupLabels: Record<SitePageGroup, string> = { create: '本地创作', workspace: '工作空间', settings: '设置' };

function UpdateCenter({ info, check, onClose }: { info?: AppInfo; check?: UpdateCheck; onClose: () => void }) {
  const [source, setSource] = useState(localStorage.getItem(UPDATE_SOURCE_KEY) || check?.latest?.source || 'github');
  const [status, setStatus] = useState('可先检测网络，再执行更新。'); const [busy, setBusy] = useState(false); const [connectivity, setConnectivity] = useState<ConnectivityResult>(); const [result, setResult] = useState<UpdateResult>(); const [backups, setBackups] = useState<UpdateBackup[]>([]);
  useEffect(() => { shellClient.backups().then(value => setBackups(value.backups)).catch(() => undefined); }, []);
  const run = async (label: string, action: () => Promise<void>) => { setBusy(true); setStatus(label); try { await action(); } catch (error) { setStatus(errorMessage(error)); } finally { setBusy(false); } };
  const update = () => { if (!confirm(`从 ${source === 'github' ? 'GitHub' : 'ModelScope'} 更新应用？更新会替换程序文件，请确保当前任务已保存。`)) return; localStorage.setItem(UPDATE_SOURCE_KEY, source); void run('正在下载并应用更新…', async () => { const value = await shellClient.update(source); setResult(value); setStatus(`更新完成：${value.count} 个文件${value.fallback_used ? '（已自动切换备用源）' : ''}`); }); };
  const rollback = (backup: UpdateBackup) => { if (!confirm(`回滚到备份 ${backup.name}？`)) return; void run('正在恢复备份…', async () => { const value = await shellClient.rollback(backup.name); setStatus(`已恢复 ${value.count} 个文件，请重启应用`); }); };
  return <div className="shell-modal-backdrop" onMouseDown={onClose}><section className="studio-card shell-update-modal" onMouseDown={event => event.stopPropagation()}><header><div><h2>更新中心</h2><p>当前 {info?.version || check?.current || '未知'} · 最新 {check?.latest?.version || '未检测到'}</p></div><button className="studio-button" type="button" onClick={onClose}>关闭</button></header>
    <div className={`shell-update-summary ${check?.update_available ? 'available' : ''}`}><strong>{check?.update_available ? '发现新版本' : '当前版本状态'}</strong><span>{check?.update_available ? `${check.current} → ${check.latest?.version}` : check?.reachable === false ? '版本源暂时不可达' : '已是最新或尚未检测'}</span></div>
    {check?.update_notes?.items?.length ? <div className="shell-release-notes"><strong>更新说明</strong><ul>{check.update_notes.items.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
    <div className="shell-source-grid">{(['github','modelscope'] as const).map(item => <button type="button" className={source === item ? 'active' : ''} key={item} onClick={() => setSource(item)}><strong>{item === 'github' ? 'GitHub' : 'ModelScope'}</strong><span>{connectivity?.sources?.[item]?.ok === true ? '连接正常' : connectivity?.sources?.[item]?.ok === false ? '连接失败' : '尚未检测'}</span></button>)}</div>
    {connectivity && <div className="shell-connectivity">{connectivity.results.map(item => <div key={item.name}><i className={item.ok ? 'ok' : ''} /><span>{item.name}</span><small>{item.ok ? `${item.status || 200} · ${item.elapsed_ms || 0}ms` : item.error || '不可用'}</small></div>)}</div>}
    {result && <div className="shell-update-result">{result.version || '新版本'} 已安装。{result.restart_required ? '需要重启应用后生效。' : ''}</div>}
    <div className="shell-backups"><strong>可用备份</strong>{backups.length ? backups.map(item => <div key={item.name}><span>{item.name}</span><button className="studio-button" disabled={busy} type="button" onClick={() => rollback(item)}>回滚</button></div>) : <p>暂无更新备份</p>}</div>
    <footer><span role="status">{status}</span><div><button className="studio-button" disabled={busy} type="button" onClick={() => void run('正在检测更新网络…', async () => { const value = await shellClient.connectivity(); setConnectivity(value); setStatus(value.results.some(item => item.ok) ? '网络检测完成' : '所有更新源均不可用'); })}>检测网络</button><button className="studio-button primary" disabled={busy} type="button" onClick={update}>{busy ? '执行中…' : '立即更新'}</button></div></footer>
  </section></div>;
}

function NavGroup({ group, active, collapsed, onOpen }: { group: SitePageGroup; active: SitePageId; collapsed: boolean; onOpen: (page: SitePage) => void }) {
  const items = SITE_PAGES.filter(page => page.group === group);
  return <section className="shell-nav-group"><h2>{groupLabels[group]}</h2>{items.map(page => <button type="button" title={page.label} aria-label={page.label} className={active === page.id ? 'active' : ''} onClick={() => onOpen(page)} key={page.id}><b>{page.short}</b>{!collapsed && <span>{page.label}</span>}</button>)}</section>;
}

export function SiteShellApp() {
  const initial = location.hash ? pageFromHash(location.hash) : normalizePageId(localStorage.getItem(ACTIVE_PAGE_KEY));
  const [active, setActive] = useState<SitePageId>(initial || DEFAULT_PAGE); const [loaded, setLoaded] = useState<Set<SitePageId>>(() => new Set([initial || DEFAULT_PAGE]));
  const [collapsed, setCollapsed] = useState(localStorage.getItem(SHELL_PINNED_KEY) !== '1'); const [theme, setTheme] = useState<StudioTheme>(() => normalizeStudioTheme(localStorage.getItem('studio_theme') || 'light'));
  const [online, setOnline] = useState(1); const [queue, setQueue] = useState({ total: 0, position: 0 }); const [info, setInfo] = useState<AppInfo>(); const [check, setCheck] = useState<UpdateCheck>(); const [updateOpen, setUpdateOpen] = useState(false); const [mobileNav, setMobileNav] = useState(false);
  const frames = useRef<Partial<Record<SitePageId, HTMLIFrameElement>>>({}); const activeRef = useRef(active); const clientId = useMemo(() => { const current = localStorage.getItem('client_id') || uuid(); localStorage.setItem('client_id', current); return current; }, []);
  const activePage = SITE_PAGES.find(page => page.id === active) ?? SITE_PAGES.find(page => page.id === DEFAULT_PAGE)!;
  const postToFrame = (frame: HTMLIFrameElement | undefined, data: unknown) => { try { frame?.contentWindow?.postMessage(data, location.origin); } catch { /* detached frame */ } };
  const broadcast = (data: unknown) => Object.values(frames.current).forEach(frame => postToFrame(frame, data));
  const syncFrame = (frame: HTMLIFrameElement | undefined) => { postToFrame(frame, { type: 'studio-theme', theme }); postToFrame(frame, { type: 'studio-lang', lang: 'zh' }); };
  const open = (page: SitePage) => { setActive(page.id); setLoaded(current => new Set(current).add(page.id)); localStorage.setItem(ACTIVE_PAGE_KEY, page.id); if (location.hash !== routeHash(page.id)) history.pushState(null, '', routeHash(page.id)); setMobileNav(false); if (page.id === 'canvas') postToFrame(frames.current.canvas, { type: 'canvas-focus' }); };

  useEffect(() => { if (!location.hash) history.replaceState(null, '', routeHash(active)); const onHash = () => { const next = pageFromHash(location.hash); setActive(next); setLoaded(current => new Set(current).add(next)); localStorage.setItem(ACTIVE_PAGE_KEY, next); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { localStorage.setItem(SHELL_PINNED_KEY, collapsed ? '0' : '1'); }, [collapsed]);
  useEffect(() => { applyStudioTheme(theme); localStorage.setItem('studio_theme', theme); broadcast({ type: 'studio-theme', theme }); }, [theme]);
  useEffect(() => {
    const forward = (data: unknown) => { if (isForwardableEvent(data)) broadcast(data); };
    const unsubscribe = subscribeStudioEvents(type => forward({ type }));
    const onMessage = (event: MessageEvent) => { if (event.origin === location.origin) forward(event.data); };
    window.addEventListener('message', onMessage);
    return () => { unsubscribe(); window.removeEventListener('message', onMessage); };
  }, []);
  useEffect(() => {
    let closed = false; let reconnect = 0; let socket: WebSocket | undefined;
    const connect = () => { if (closed) return; const protocol = location.protocol === 'https:' ? 'wss' : 'ws'; socket = new WebSocket(`${protocol}://${location.host}/ws/stats?client_id=${encodeURIComponent(clientId)}`); socket.onmessage = event => { try { const data = JSON.parse(event.data); if (data.type === 'stats') setOnline(Number(data.online_count) || 1); else if (isForwardableEvent(data)) { if (['canvas_locked','canvas_unlocked','asset_library_updated'].includes(data.type)) broadcast(data); else postToFrame(frames.current[activeRef.current], data); } } catch { /* malformed websocket frame */ } }; socket.onclose = () => { if (!closed) reconnect = window.setTimeout(connect, 2500); }; };
    connect(); const poll = window.setInterval(() => shellClient.queue(clientId).then(value => setQueue({ total: value.total || 0, position: value.position || 0 })).catch(() => undefined), 2000);
    return () => { closed = true; clearTimeout(reconnect); clearInterval(poll); socket?.close(); };
  }, [clientId]);
  useEffect(() => { Promise.allSettled([shellClient.appInfo(), shellClient.checkUpdate()]).then(values => { const app = values[0]; const update = values[1]; if (app.status === 'fulfilled') setInfo(app.value); if (update.status === 'fulfilled') setCheck(update.value); }); }, []);

  return <div className={`site-shell ${collapsed ? 'collapsed' : ''} ${mobileNav ? 'mobile-open' : ''}`}><aside className="shell-sidebar"><header><button type="button" className="shell-logo" onClick={() => setCollapsed(value => !value)} title={collapsed ? '展开导航' : '收起导航'}><img src="/static/images/logo.png" alt="Infinite Canvas" /></button>{!collapsed && <div><strong>Infinite Canvas</strong><span>React Studio</span></div>}<button className="shell-mobile-close" type="button" onClick={() => setMobileNav(false)}>×</button></header><nav><NavGroup group="create" active={active} collapsed={collapsed} onOpen={open} /><NavGroup group="workspace" active={active} collapsed={collapsed} onOpen={open} /><NavGroup group="settings" active={active} collapsed={collapsed} onOpen={open} /></nav><footer><button type="button" title="切换主题" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}><b>{theme === 'dark' ? '☀' : '☾'}</b>{!collapsed && <span>{theme === 'dark' ? '浅色模式' : '深色模式'}</span>}</button><button type="button" className={check?.update_available ? 'update-available' : ''} title="更新中心" onClick={() => setUpdateOpen(true)}><b>↻</b>{!collapsed && <span>{check?.update_available ? `可更新 ${check.latest?.version || ''}` : `版本 ${info?.version || check?.current || '-'}`}</span>}</button><a href={info?.repo_url || 'https://github.com/hero8152/Infinite-Canvas'} target="_blank" rel="noreferrer" title="项目主页"><b>↗</b>{!collapsed && <span>项目主页</span>}</a><div className="shell-health"><i className={queue.position > 0 ? 'busy' : ''} />{!collapsed && <span>在线 {online} · 队列 {queue.position > 0 ? `${queue.position}/${queue.total}` : queue.total}</span>}</div></footer></aside>
    <button className="shell-mobile-menu" type="button" onClick={() => setMobileNav(true)}>☰ <span>{activePage.label}</span></button><main className="shell-content">{SITE_PAGES.filter(page => loaded.has(page.id)).map(page => <iframe ref={node => { if (node) frames.current[page.id] = node; else delete frames.current[page.id]; }} className={active === page.id ? 'active' : ''} src={page.src} title={page.label} onLoad={event => { syncFrame(event.currentTarget); if (page.id === 'canvas') postToFrame(event.currentTarget, { type: 'canvas-focus' }); }} key={page.id} />)}</main>{mobileNav && <button className="shell-mobile-scrim" type="button" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}{updateOpen && <UpdateCenter info={info} check={check} onClose={() => setUpdateOpen(false)} />}</div>;
}
