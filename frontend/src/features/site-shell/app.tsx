import { useEffect, useMemo, useRef, useState } from 'react';
import { applyStudioTheme, normalizeStudioTheme, type StudioTheme } from '../../shared/theme';
import { subscribeStudioEvents } from '../../shared/studio-events';
import { shellClient } from './client';
import { ACTIVE_PAGE_KEY, DEFAULT_PAGE, isForwardableEvent, normalizePageId, pageFromHash, routeHash, SHELL_PINNED_KEY, SITE_PAGES, UPDATE_SOURCE_KEY } from './domain';
import type { AppInfo, ConnectivityResult, SitePage, SitePageId, UpdateBackup, UpdateCheck, UpdateResult } from './types';

const uuid = () => crypto.randomUUID?.() || `shell-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败';
const SIDEBAR_SETTINGS_COLLAPSED_KEY = 'studio_sidebar_settings_collapsed';
const PRIMARY_PAGE_IDS: SitePageId[] = ['online', 'gpt-chat', 'canvas', 'asset-manager'];

function ShellIcon({ name }: { name: SitePageId | 'settings' | 'chevron' | 'moon' | 'sun' | 'refresh' }) {
  const common = { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'online') return <svg {...common}><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
  if (name === 'gpt-chat') return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
  if (name === 'canvas') return <svg {...common}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
  if (name === 'asset-manager') return <svg {...common}><path d="M4 19.5V6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v12.7" /><path d="M7 8h10M7 12h10M7 16h6" /></svg>;
  if (name === 'api-settings') return <svg {...common}><path d="M15 7h3a5 5 0 0 1 0 10h-3M9 17H6A5 5 0 0 1 6 7h3" /><line x1="8" y1="12" x2="16" y2="12" /></svg>;
  if (name === 'comfyui-settings') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h7v7h-7z" /><line x1="10" y1="6.5" x2="14" y2="6.5" /><line x1="6.5" y1="10" x2="6.5" y2="14" /></svg>;
  if (name === 'settings') return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.36 1.08V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.08-.36H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .36-1.08V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.22.38.58.69 1 .86.2.08.42.13.65.14H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" /></svg>;
  if (name === 'chevron') return <svg {...common}><polyline points="6 9 12 15 18 9" /></svg>;
  if (name === 'moon') return <svg {...common}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
  if (name === 'sun') return <svg {...common}><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>;
  return <svg {...common}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>;
}

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

function PrimaryNavigation({ active, onOpen }: { active: SitePageId; onOpen: (page: SitePage) => void }) {
  return <>{PRIMARY_PAGE_IDS.map(id => { const page = SITE_PAGES.find(item => item.id === id)!; return <button type="button" title={page.label} aria-label={page.label} className={`nav-item ${active === page.id ? 'active' : ''}`} onClick={() => onOpen(page)} key={page.id}><ShellIcon name={page.id} /><span className="nav-text">{page.label}</span></button>; })}</>;
}

export function SiteShellApp() {
  const initial = location.hash ? pageFromHash(location.hash) : normalizePageId(localStorage.getItem(ACTIVE_PAGE_KEY));
  const [active, setActive] = useState<SitePageId>(initial || DEFAULT_PAGE); const [loaded, setLoaded] = useState<Set<SitePageId>>(() => new Set([initial || DEFAULT_PAGE]));
  const [pinned, setPinned] = useState(localStorage.getItem(SHELL_PINNED_KEY) === '1'); const [collapsing, setCollapsing] = useState(false); const [settingsCollapsed, setSettingsCollapsed] = useState(localStorage.getItem(SIDEBAR_SETTINGS_COLLAPSED_KEY) !== '0' && initial !== 'comfyui-settings'); const [theme, setTheme] = useState<StudioTheme>(() => normalizeStudioTheme(localStorage.getItem('studio_theme') || 'light'));
  const [online, setOnline] = useState(1); const [queue, setQueue] = useState({ total: 0, position: 0 }); const [info, setInfo] = useState<AppInfo>(); const [check, setCheck] = useState<UpdateCheck>(); const [updateOpen, setUpdateOpen] = useState(false); const [mobileNav, setMobileNav] = useState(false);
  const frames = useRef<Partial<Record<SitePageId, HTMLIFrameElement>>>({}); const activeRef = useRef(active); const collapseTimer = useRef<number | undefined>(undefined); const clientId = useMemo(() => { const current = localStorage.getItem('client_id') || uuid(); localStorage.setItem('client_id', current); return current; }, []);
  const activePage = SITE_PAGES.find(page => page.id === active) ?? SITE_PAGES.find(page => page.id === DEFAULT_PAGE)!;
  const postToFrame = (frame: HTMLIFrameElement | undefined, data: unknown) => { try { frame?.contentWindow?.postMessage(data, location.origin); } catch { /* detached frame */ } };
  const broadcast = (data: unknown) => Object.values(frames.current).forEach(frame => postToFrame(frame, data));
  const syncFrame = (frame: HTMLIFrameElement | undefined) => { postToFrame(frame, { type: 'studio-theme', theme }); postToFrame(frame, { type: 'studio-lang', lang: 'zh' }); };
  const open = (page: SitePage) => { setActive(page.id); setLoaded(current => new Set(current).add(page.id)); localStorage.setItem(ACTIVE_PAGE_KEY, page.id); if (location.hash !== routeHash(page.id)) history.pushState(null, '', routeHash(page.id)); setMobileNav(false); if (page.id === 'comfyui-settings') setSettingsCollapsed(false); if (page.id === 'canvas') postToFrame(frames.current.canvas, { type: 'canvas-focus' }); };
  const togglePinned = () => { clearTimeout(collapseTimer.current); if (pinned) { setPinned(false); setCollapsing(true); collapseTimer.current = window.setTimeout(() => setCollapsing(false), 360); } else { setPinned(true); setCollapsing(false); } };
  const toggleSettings = () => setSettingsCollapsed(value => { const next = !value; localStorage.setItem(SIDEBAR_SETTINGS_COLLAPSED_KEY, next ? '1' : '0'); return next; });

  useEffect(() => { if (!location.hash) history.replaceState(null, '', routeHash(active)); const onHash = () => { const next = pageFromHash(location.hash); setActive(next); setLoaded(current => new Set(current).add(next)); localStorage.setItem(ACTIVE_PAGE_KEY, next); if (next === 'comfyui-settings') setSettingsCollapsed(false); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { localStorage.setItem(SHELL_PINNED_KEY, pinned ? '1' : '0'); }, [pinned]);
  useEffect(() => () => clearTimeout(collapseTimer.current), []);
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

  return <div className={`site-shell ${pinned ? 'sidebar-pinned' : ''} ${mobileNav ? 'mobile-open' : ''}`}><aside className={`shell-sidebar ${pinned ? 'is-pinned' : ''} ${collapsing ? 'is-collapsing' : ''}`}><button type="button" className="shell-logo" onClick={togglePinned} aria-pressed={pinned} title={pinned ? '收起导航栏' : '固定导航栏'}><span className={queue.position > 0 ? 'busy' : ''} id="shell-logo-dot" /></button><button className="shell-mobile-close" type="button" onClick={() => setMobileNav(false)}>×</button><nav><PrimaryNavigation active={active} onOpen={open} /></nav><footer className="side-actions"><button className={`side-pill ${active === 'api-settings' ? 'active' : ''}`} type="button" title="API 设置" aria-label="API 设置" onClick={() => open(SITE_PAGES.find(page => page.id === 'api-settings')!)}><ShellIcon name="api-settings" /><span className="side-pill-text">API 设置</span></button><button className="side-pill settings-fold-toggle" type="button" title={settingsCollapsed ? '展开更多设置' : '收起更多设置'} aria-label="更多设置" aria-expanded={!settingsCollapsed} onClick={toggleSettings}><ShellIcon name="settings" /><span className="side-pill-text">更多设置</span><span className="settings-fold-chevron"><ShellIcon name="chevron" /></span></button><div className={`settings-fold-group ${settingsCollapsed ? 'is-collapsed' : ''}`}><button className="side-pill" type="button" title="切换夜间模式" aria-label="切换主题" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}><ShellIcon name={theme === 'dark' ? 'sun' : 'moon'} /><span className="side-pill-text">{theme === 'dark' ? '浅色模式' : '黑夜模式'}</span></button><button className={`side-pill ${active === 'comfyui-settings' ? 'active' : ''}`} type="button" title="工作流设置" aria-label="工作流设置" onClick={() => open(SITE_PAGES.find(page => page.id === 'comfyui-settings')!)}><ShellIcon name="comfyui-settings" /><span className="side-pill-text">工作流设置</span></button></div>{check?.update_available ? <button type="button" className="update-now-btn show" title="更新中心" onClick={() => setUpdateOpen(true)}><ShellIcon name="refresh" /><span className="update-now-text">更新到 {check.latest?.version || '新版本'}</span></button> : <button type="button" className="project-version-badge" title="点击检测更新" onClick={() => setUpdateOpen(true)}><span className="project-version-compact">v{(info?.version || check?.current || '-').split('.').slice(-2).join('.')}</span><span className="project-version-full">v{info?.version || check?.current || '-'}</span></button>}<div className="shell-health"><i className={queue.position > 0 ? 'busy' : ''} /><span>在线 {online} · 队列 {queue.position > 0 ? `${queue.position}/${queue.total}` : queue.total}</span></div></footer></aside>
    <button className="shell-mobile-menu" type="button" onClick={() => setMobileNav(true)}>☰ <span>{activePage.label}</span></button><main className="shell-content">{SITE_PAGES.filter(page => loaded.has(page.id)).map(page => <iframe ref={node => { if (node) frames.current[page.id] = node; else delete frames.current[page.id]; }} className={active === page.id ? 'active' : ''} src={page.src} title={page.label} onLoad={event => { syncFrame(event.currentTarget); if (page.id === 'canvas') postToFrame(event.currentTarget, { type: 'canvas-focus' }); }} key={page.id} />)}</main>{mobileNav && <button className="shell-mobile-scrim" type="button" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}{updateOpen && <UpdateCenter info={info} check={check} onClose={() => setUpdateOpen(false)} />}</div>;
}
