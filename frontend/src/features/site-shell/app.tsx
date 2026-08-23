import { useEffect, useMemo, useRef, useState } from 'react';
import { applyStudioTheme, normalizeStudioTheme, type StudioTheme } from '../../shared/theme';
import { subscribeStudioEvents } from '../../shared/studio-events';
import { shellClient } from './client';
import { HttpError } from '../../shared/http';
import {
  ACTIVE_PAGE_KEY,
  DEFAULT_PAGE,
  isForwardableEvent,
  normalizePageId,
  pageFromHash,
  routeHash,
  SHELL_PINNED_KEY,
  SITE_PAGES,
  UPDATE_SOURCE_KEY,
} from './domain';
import type {
  AppInfo,
  ConnectivityItem,
  ConnectivityResult,
  SitePage,
  SitePageId,
  UpdateCheck,
} from './types';

const uuid = () => crypto.randomUUID?.() || `shell-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败';
const SIDEBAR_SETTINGS_COLLAPSED_KEY = 'studio_sidebar_settings_collapsed';
const PRIMARY_PAGE_IDS: SitePageId[] = ['online', 'gpt-chat', 'canvas', 'asset-manager'];
const CONNECTIVITY_TARGETS = [
  { name: 'GitHub 更新列表', source: 'github', required: true },
  { name: 'GitHub 版本文件', source: 'github', required: true },
  { name: 'GitHub 主页', source: 'github', required: false },
  { name: 'ModelScope 版本文件', source: 'modelscope', required: true },
  { name: 'ModelScope 空间页面', source: 'modelscope', required: false },
  { name: 'ModelScope 主页', source: 'modelscope', required: false },
  { name: 'Google 连通性', source: 'reference', required: false },
] as const;

const versionLabel = (value?: string) => value ? `v${value.replace(/^v/i, '')}` : 'v-';
const compactVersionLabel = (value?: string) => {
  const text = String(value || '').trim();
  const parts = text.match(/\d+/g) || [];
  return `v${parts.length >= 3 ? `${parts[1]}.${parts[2]}` : text.replace(/^v/i, '') || '-'}`;
};
const sourceLabel = (source: string) => source === 'modelscope' ? 'ModelScope' : 'GitHub';
const sourceStats = (source: string, results: ConnectivityItem[]) => {
  const items = results.filter(item => item.source === source);
  const required = items.filter(item => item.required);
  const okItems = items.filter(item => item.ok);
  const average = okItems.length ? Math.round(okItems.reduce((sum, item) => sum + Number(item.elapsed_ms || 0), 0) / okItems.length) : Number.MAX_SAFE_INTEGER;
  return { ok: required.length > 0 && required.every(item => item.ok), average, done: items.filter(item => !item.pending).length, total: items.length };
};

async function waitForBackendAndReload() {
  const deadline = Date.now() + 90_000;
  await new Promise(resolve => window.setTimeout(resolve, 4_000));
  while (Date.now() < deadline) {
    try {
      const response = await fetch('/api/app-info', { cache: 'no-store' });
      if (response.ok) { location.reload(); return; }
    } catch { /* backend is restarting */ }
    await new Promise(resolve => window.setTimeout(resolve, 1_500));
  }
}

function compareVersions(left: string, right: string) {
  const a = String(left || '').match(/\d+/g)?.map(Number) || [];
  const b = String(right || '').match(/\d+/g)?.map(Number) || [];
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return String(left || '').trim() === String(right || '').trim() ? 0 : 1;
}

async function fallbackUpdateCheck(info: AppInfo): Promise<UpdateCheck> {
  const candidates = [
    { source: 'github', url: info.sources?.github?.version_url || info.version_url || '' },
    { source: 'modelscope', url: info.sources?.modelscope?.version_url || '' },
  ].filter(candidate => candidate.url);
  let latest: UpdateCheck['latest'];
  let reachable = false;
  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate.url}${candidate.url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
      const remote = response.ok ? (await response.text()).trim().split(/\r?\n/)[0].trim() : '';
      if (!remote) continue;
      reachable = true;
      if (!latest?.version || compareVersions(remote, latest.version) > 0) latest = { source: candidate.source, version: remote };
    } catch { /* preserve offline startup */ }
  }
  return {
    current: info.version || '',
    reachable,
    latest,
    update_available: Boolean(info.version && latest?.version && compareVersions(latest.version, info.version) > 0),
  };
}

function ShellIcon({ name, className }: { name: SitePageId | 'settings' | 'chevron' | 'moon' | 'sun' | 'refresh'; className?: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'online') return <svg {...common} className={className}><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
  if (name === 'gpt-chat') return <svg {...common} className={className}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
  if (name === 'canvas') return <svg {...common} className={className}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>;
  if (name === 'asset-manager') return <svg {...common} className={className}><path d="M4 19.5V6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v12.7" /><path d="M7 8h10M7 12h10M7 16h6" /></svg>;
  if (name === 'api-settings') return <svg {...common}><path d="M15 7h3a5 5 0 0 1 0 10h-3M9 17H6A5 5 0 0 1 6 7h3" /><line x1="8" y1="12" x2="16" y2="12" /></svg>;
  if (name === 'comfyui-settings') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h7v7h-7z" /><line x1="10" y1="6.5" x2="14" y2="6.5" /><line x1="6.5" y1="10" x2="6.5" y2="14" /></svg>;
  if (name === 'settings') return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.36 1.08V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.08-.36H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .36-1.08V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.22.38.58.69 1 .86.2.08.42.13.65.14H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" /></svg>;
  if (name === 'chevron') return <svg {...common}><polyline points="6 9 12 15 18 9" /></svg>;
  if (name === 'moon') return <svg {...common}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
  if (name === 'sun') return <svg {...common}><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>;
  return <svg {...common}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>;
}

function UpdateCenter({ info, check, onClose }: { info?: AppInfo; check?: UpdateCheck; onClose: () => void }) {
  const initialSource = localStorage.getItem(UPDATE_SOURCE_KEY) || check?.latest?.source || 'github';
  const [source, setSourceState] = useState(initialSource === 'modelscope' ? 'modelscope' : 'github');
  const [items, setItems] = useState<ConnectivityItem[]>(CONNECTIVITY_TARGETS.map(item => ({ ...item, ok: false, untouched: true })));
  const [tested, setTested] = useState(false);
  const [testing, setTesting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [summary, setSummary] = useState({ kind: 'warn', title: '建议先测试连通性', text: '测试会同时测速 GitHub 和 ModelScope。你可以根据结果切换下载源。' });
  const abortRef = useRef<AbortController | null>(null);
  const remoteVersion = check?.latest?.version || '';
  const localVersion = info?.version || check?.current || '';
  const notes = check?.latest?.update_notes || check?.update_notes;
  const setSource = (next: string) => {
    const normalized = next === 'modelscope' ? 'modelscope' : 'github';
    setSourceState(normalized);
    localStorage.setItem(UPDATE_SOURCE_KEY, normalized);
    if (tested) {
      const stats = sourceStats(normalized, items);
      setSummary(stats.ok
        ? { kind: 'ok', title: `${sourceLabel(normalized)} 下载源可用`, text: `${sourceLabel(normalized)} 可访问，可以开始更新。` }
        : { kind: 'fail', title: `${sourceLabel(normalized)} 下载源不可用`, text: `当前网络无法访问 ${sourceLabel(normalized)} 必需节点。请切换下载源，或检查代理、DNS 后重试。` });
    }
  };
  const close = () => {
    abortRef.current?.abort();
    onClose();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const runConnectivityTest = async () => {
    if (testing) return;
    setTesting(true);
    setTested(false);
    setSummary({ kind: 'warn', title: '正在测试连通性', text: '正在逐条检测各节点，结果实时显示。' });
    const live: ConnectivityItem[] = CONNECTIVITY_TARGETS.map(item => ({ ...item, ok: false, pending: true }));
    setItems(live);
    let backendMissing = false;
    const apply = (name: string, patchValue: Partial<ConnectivityItem>) => {
      const index = live.findIndex(item => item.name === name);
      if (index < 0) return;
      live[index] = { ...live[index], pending: false, untouched: false, ...patchValue };
      setItems([...live]);
    };
    await Promise.all(CONNECTIVITY_TARGETS.map(async target => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 6_000);
      try {
        const value = await shellClient.connectivityProbe(target.name, controller.signal);
        apply(target.name, value);
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) backendMissing = true;
        else if (error instanceof DOMException && error.name === 'AbortError') apply(target.name, { ok: false, timed_out: true, error: '连接超时（超过 5s）' });
        else apply(target.name, { ok: false, error: errorMessage(error) });
      } finally { clearTimeout(timeout); }
    }));
    let finalItems = live;
    if (backendMissing) {
      try {
        const fallback = await shellClient.connectivity();
        finalItems = fallback.results;
        setItems(finalItems);
      } catch {
        finalItems = CONNECTIVITY_TARGETS.map(item => ({ ...item, ok: false, error: '后端还没有加载新的连通性测试接口。请重启服务后再测试。' }));
        setItems(finalItems);
      }
    }
    const github = sourceStats('github', finalItems);
    const modelscope = sourceStats('modelscope', finalItems);
    const best = github.ok && modelscope.ok ? (modelscope.average < github.average ? 'modelscope' : 'github') : modelscope.ok ? 'modelscope' : github.ok ? 'github' : source;
    setSource(best);
    const selected = sourceStats(best, finalItems);
    if (selected.ok) setSummary({ kind: 'ok', title: `${sourceLabel(best)} 下载源可用`, text: `${sourceLabel(best)} 可访问，可以开始更新。` });
    else setSummary({ kind: 'fail', title: `${sourceLabel(best)} 下载源不可用`, text: `当前网络无法访问 ${sourceLabel(best)} 必需节点。请切换下载源，或检查代理、DNS 后重试。` });
    setTested(true);
    setTesting(false);
  };

  const confirmUpdate = async () => {
    if (updating) return;
    setUpdating(true);
    setSummary({ kind: 'warn', title: '正在更新', text: `正在从 ${sourceLabel(source)} 下载文件，并创建本地备份。` });
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 300_000);
    try {
      const value = await shellClient.update(source, controller.signal);
      const used = value.source_label || sourceLabel(value.source);
      const fallback = value.fallback_used ? `（${sourceLabel(source)} 不可用，已自动兜底切换到 ${used}）` : '';
      setSummary({ kind: 'ok', title: '更新完成', text: value.restart_scheduled ? `已更新 ${value.count || 0} 个文件。后端将在约 3 秒后自动重启，本页面会在恢复后自动刷新。${fallback}` : `已更新 ${value.count || 0} 个文件。请重启后端，然后刷新页面。${fallback}` });
      if (value.restart_scheduled) void waitForBackendAndReload();
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError' ? '更新超时。请切换下载源或检查网络后重试。' : errorMessage(error);
      setSummary({ kind: 'fail', title: '更新失败', text: message });
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setUpdating(false);
    }
  };

  return <div id="project-update-modal" className="studio-modal" role="dialog" aria-modal="true" aria-labelledby="project-update-title" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="studio-modal-panel">
      <div className="studio-modal-head"><div><div className="studio-modal-kicker">发现更新</div><h2 id="project-update-title" className="studio-modal-title">{remoteVersion ? `更新到 ${versionLabel(remoteVersion)}` : '一键更新'}</h2></div><button className="studio-modal-close" type="button" onClick={close} title="关闭" aria-label="关闭"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button></div>
      <div className="studio-modal-body">
        <p id="project-update-copy" className="studio-modal-copy">将从 {sourceLabel(source)} 更新 main.py、VERSION 和 static 文件。更新前会自动备份，更新完成后后端会自动重启。当前 {versionLabel(localVersion)}，最新 {versionLabel(remoteVersion || localVersion)}。</p>
        {(notes?.version || notes?.items?.length) ? <div id="project-update-notes" className="update-notes-box"><div className="update-notes-head"><strong>本次更新内容</strong><span className="update-notes-version">{notes.version ? versionLabel(notes.version) : ''}</span></div>{notes.items?.length ? <ol className="update-notes-list">{notes.items.slice(0, 8).map((item, index) => <li key={index}>{typeof item === 'string' ? item : item.text}</li>)}</ol> : <p className="update-notes-empty">暂未获取到这个版本的更新说明。</p>}</div> : null}
        <div id="update-source-list" className="update-source-list">{(['github', 'modelscope'] as const).map(candidate => {
          const stats = sourceStats(candidate, items);
          const sourceItems = items.filter(item => item.source === candidate || (candidate === 'github' && item.source === 'reference'));
          return <button id={`update-source-${candidate}`} className={`update-source-card ${source === candidate ? 'active' : ''}`} type="button" data-update-source={candidate} aria-pressed={source === candidate} onClick={() => setSource(candidate)} key={candidate}>
            <div className="update-source-head"><div className="update-source-title"><strong>{sourceLabel(candidate)} 下载源</strong><span>{candidate === 'github' ? 'GitHub API / raw 文件 / GitHub 网页，Google 仅作外网参考。' : 'ModelScope 空间与版本文件，适合国内网络。'}</span></div><div className="update-source-head-right"><span className="update-source-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span><span className={`update-source-badge ${tested ? stats.ok ? 'ok' : 'bad' : ''}`}>{testing && stats.done < stats.total ? `检测中 ${stats.done}/${stats.total}` : tested ? stats.ok ? '可用' : '不可用' : '待测试'}</span></div></div>
            <div className="connectivity-list" data-connectivity-source={candidate}>{sourceItems.map(item => <div className={`connectivity-row ${item.pending ? 'pending' : item.untouched ? '' : item.ok ? 'ok' : 'fail'}`} key={item.name}><span className="connectivity-indicator" /><div><div className="connectivity-name">{item.name}</div><div className="connectivity-url">{item.url || ''}</div></div><div className="connectivity-status">{item.pending ? '检测中...' : item.untouched ? '待测试' : item.ok ? `正常 · ${item.elapsed_ms || 0}ms` : item.timed_out ? '失败 · 超时' : item.status ? `HTTP ${item.status}` : '失败'}</div>{item.error && !item.timed_out ? <div className="connectivity-error">{item.error.slice(0, 220)}</div> : null}</div>)}</div>
          </button>;
        })}</div>
        <div id="project-update-summary" className={`update-modal-summary ${summary.kind}`}><span className="update-modal-dot" aria-hidden="true" /><div><strong>{summary.title}</strong><span>{summary.text}</span></div></div>
      </div>
      <div className="studio-modal-actions"><button id="connectivity-test-btn" className="studio-modal-btn" type="button" disabled={testing || updating} onClick={() => void runConnectivityTest()}><ShellIcon name="refresh" /><span>{testing ? '检测中...' : tested ? '重新测试' : '测试连通性'}</span></button><button className="studio-modal-btn" type="button" onClick={close}>取消</button><button id="project-update-confirm-btn" className="studio-modal-btn primary" type="button" disabled={testing || updating} onClick={() => void confirmUpdate()}><ShellIcon name="refresh" /><span>{updating ? '更新中...' : '开始更新'}</span></button></div>
    </div>
  </div>;
}

function PrimaryNavigation({ active, onOpen }: { active: SitePageId; onOpen: (page: SitePage) => void }) {
  return <>{PRIMARY_PAGE_IDS.map(id => {
    const page = SITE_PAGES.find(item => item.id === id)!;
    return <button type="button" title={page.label} aria-label={page.label} className={`nav-item ${active === page.id ? 'active' : ''}`} onClick={() => onOpen(page)} key={page.id}><ShellIcon name={page.id} className="w-5 h-5 flex-shrink-0" /><span className="nav-text">{page.label}</span></button>;
  })}</>;
}

export function SiteShellApp() {
  const initial = location.hash ? pageFromHash(location.hash) : normalizePageId(localStorage.getItem(ACTIVE_PAGE_KEY));
  const [active, setActive] = useState<SitePageId>(initial || DEFAULT_PAGE);
  const [loaded, setLoaded] = useState<Set<SitePageId>>(() => new Set([initial || DEFAULT_PAGE]));
  const [pinned, setPinned] = useState(localStorage.getItem(SHELL_PINNED_KEY) === '1');
  const [collapsing, setCollapsing] = useState(false);
  const [settingsCollapsed, setSettingsCollapsed] = useState(localStorage.getItem(SIDEBAR_SETTINGS_COLLAPSED_KEY) !== '0' && initial !== 'comfyui-settings');
  const [theme, setTheme] = useState<StudioTheme>(() => normalizeStudioTheme(localStorage.getItem('studio_theme') || 'light'));
  const [online, setOnline] = useState(1);
  const [queue, setQueue] = useState({ total: 0, position: 0 });
  const [info, setInfo] = useState<AppInfo>();
  const [check, setCheck] = useState<UpdateCheck>();
  const [checking, setChecking] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const frames = useRef<Partial<Record<SitePageId, HTMLIFrameElement>>>({});
  const activeRef = useRef(active);
  const collapseTimer = useRef<number | undefined>(undefined);
  const clientId = useMemo(() => {
    const current = localStorage.getItem('client_id') || uuid();
    localStorage.setItem('client_id', current);
    return current;
  }, []);
  const postToFrame = (frame: HTMLIFrameElement | undefined, data: unknown) => {
    try { frame?.contentWindow?.postMessage(data, location.origin); } catch { /* detached frame */ }
  };
  const broadcast = (data: unknown) => Object.values(frames.current).forEach(frame => postToFrame(frame, data));
  const syncFrame = (frame: HTMLIFrameElement | undefined) => {
    postToFrame(frame, { type: 'studio-theme', theme });
    postToFrame(frame, { type: 'studio-lang', lang: 'zh' });
  };
  const open = (page: SitePage) => {
    setActive(page.id);
    setLoaded(current => new Set(current).add(page.id));
    localStorage.setItem(ACTIVE_PAGE_KEY, page.id);
    if (location.hash !== routeHash(page.id)) history.pushState(null, '', routeHash(page.id));
    if (page.id === 'comfyui-settings') setSettingsCollapsed(false);
    if (page.id === 'canvas') postToFrame(frames.current.canvas, { type: 'canvas-focus' });
  };
  const togglePinned = () => {
    clearTimeout(collapseTimer.current);
    if (pinned) {
      setPinned(false);
      setCollapsing(true);
      collapseTimer.current = window.setTimeout(() => setCollapsing(false), 360);
    } else {
      setPinned(true);
      setCollapsing(false);
    }
  };
  const toggleSettings = () => setSettingsCollapsed(value => {
    const next = !value;
    localStorage.setItem(SIDEBAR_SETTINGS_COLLAPSED_KEY, next ? '1' : '0');
    return next;
  });
  const checkForUpdates = async (manual = false) => {
    if (manual) setChecking(true);
    try {
      const currentInfo = await shellClient.appInfo();
      setInfo(currentInfo);
      let currentCheck: UpdateCheck;
      try { currentCheck = await shellClient.checkUpdate(); }
      catch { currentCheck = await fallbackUpdateCheck(currentInfo); }
      setCheck(currentCheck);
      if (currentCheck.update_available) {
        if (currentCheck.latest?.source === 'modelscope') localStorage.setItem(UPDATE_SOURCE_KEY, 'modelscope');
        if (manual) setUpdateOpen(true);
      } else if (manual) {
        alert(currentCheck.reachable ? `已是最新版本（${versionLabel(currentCheck.current)}）。` : '无法连接 GitHub 或 ModelScope 更新源，请检查网络或代理后重试。');
      }
    } catch {
      if (manual) alert('检测更新失败。');
    } finally { if (manual) setChecking(false); }
  };

  useEffect(() => {
    if (location.hash !== routeHash(active)) history.replaceState(null, '', routeHash(active));
    document.documentElement.classList.remove('studio-route-booting');
    const onHash = () => {
      const next = pageFromHash(location.hash);
      if (location.hash !== routeHash(next)) history.replaceState(null, '', routeHash(next));
      setActive(next);
      setLoaded(current => new Set(current).add(next));
      localStorage.setItem(ACTIVE_PAGE_KEY, next);
      if (next === 'comfyui-settings') setSettingsCollapsed(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { localStorage.setItem(SHELL_PINNED_KEY, pinned ? '1' : '0'); }, [pinned]);
  useEffect(() => () => clearTimeout(collapseTimer.current), []);
  useEffect(() => { applyStudioTheme(theme); localStorage.setItem('studio_theme', theme); broadcast({ type: 'studio-theme', theme }); }, [theme]);
  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: string }>).detail;
      if (detail?.theme) setTheme(normalizeStudioTheme(detail.theme));
    };
    window.addEventListener('studio-theme-change', onThemeChange);
    return () => window.removeEventListener('studio-theme-change', onThemeChange);
  }, []);
  useEffect(() => {
    const forward = (data: unknown) => { if (isForwardableEvent(data)) broadcast(data); };
    const unsubscribe = subscribeStudioEvents(type => forward({ type }));
    const onMessage = (event: MessageEvent) => { if (event.origin === location.origin) forward(event.data); };
    window.addEventListener('message', onMessage);
    return () => { unsubscribe(); window.removeEventListener('message', onMessage); };
  }, []);
  useEffect(() => {
    let closed = false;
    let reconnect = 0;
    let socket: WebSocket | undefined;
    const connect = () => {
      if (closed) return;
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${location.host}/ws/stats?client_id=${encodeURIComponent(clientId)}`);
      socket.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'stats') setOnline(Number(data.online_count) || 1);
          else if (isForwardableEvent(data)) {
            if (['canvas_locked', 'canvas_unlocked', 'asset_library_updated'].includes(data.type)) broadcast(data);
            else postToFrame(frames.current[activeRef.current], data);
          }
        } catch { /* malformed websocket frame */ }
      };
      socket.onclose = () => { if (!closed) reconnect = window.setTimeout(connect, 2500); };
    };
    connect();
    const poll = window.setInterval(() => shellClient.queue(clientId).then(value => setQueue({ total: value.total || 0, position: value.position || 0 })).catch(() => undefined), 2000);
    return () => { closed = true; clearTimeout(reconnect); clearInterval(poll); socket?.close(); };
  }, [clientId]);
  useEffect(() => { void checkForUpdates(); }, []);
  useEffect(() => {
    const host = window as typeof window & { rollbackProjectUpdate?: () => Promise<void> };
    host.rollbackProjectUpdate = async () => {
      try {
        const backups = (await shellClient.backups()).backups;
        if (!backups.length) { alert('没有可用的备份'); return; }
        const lines = backups.slice(0, 8).map((backup, index) => `${index + 1}. ${backup.name}  (${backup.file_count || 0} files, ${backup.created_at ? new Date(backup.created_at * 1000).toLocaleString() : '-'})`);
        const answer = prompt(`选择要还原的备份（输入序号）：\n${lines.join('\n')}`, '1');
        const selected = Number(answer) - 1;
        if (!(selected >= 0 && selected < backups.length)) return;
        const backup = backups[selected];
        if (!confirm(`要还原 "${backup.name}" 吗？后端会自动重启。`)) return;
        const result = await shellClient.rollback(backup.name);
        alert(`已还原 ${result.count || 0} 个文件。后端正在重启。`);
        if (result.restart_scheduled) void waitForBackendAndReload();
      } catch (error) { alert(`回滚失败：${errorMessage(error)}`); }
    };
    return () => { delete host.rollbackProjectUpdate; };
  }, []);

  return <>
    <div className="app-shell">
      <aside className={`sidebar ${pinned ? 'is-pinned' : ''} ${collapsing ? 'is-collapsing' : ''}`} id="studioSidebar">
        <button className="logo-ring mb-12" id="sidebarLogoToggle" type="button" onClick={togglePinned} aria-pressed={pinned} title={pinned ? '收起导航栏' : '固定导航栏'}>
          <span className="w-1.5 h-1.5 rounded-full transition-colors" id="logo-dot" style={{ background: queue.position > 0 ? '#3b82f6' : 'var(--text)' }} />
        </button>
        <nav><PrimaryNavigation active={active} onOpen={open} /></nav>
        <div className="side-actions">
          <button className={`side-pill ${active === 'api-settings' ? 'active' : ''}`} type="button" title="API 设置" aria-label="API 设置" onClick={() => open(SITE_PAGES.find(page => page.id === 'api-settings')!)}><ShellIcon name="api-settings" /><span className="side-pill-text">API 设置</span></button>
          <button className="side-pill settings-fold-toggle" id="settings-fold-toggle" type="button" title={settingsCollapsed ? '展开更多设置' : '收起更多设置'} aria-label="更多设置" aria-expanded={!settingsCollapsed} onClick={toggleSettings}><ShellIcon name="settings" /><span className="side-pill-text">更多设置</span><span className="settings-fold-chevron"><ShellIcon name="chevron" /></span></button>
          <div className={`settings-fold-group ${settingsCollapsed ? 'is-collapsed' : ''}`} id="settings-fold-group">
            <button className="side-pill" type="button" title="切换夜间模式" aria-label="切换主题" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}><ShellIcon name={theme === 'dark' ? 'sun' : 'moon'} /><span className="side-pill-text">{theme === 'dark' ? '浅色模式' : '黑夜模式'}</span></button>
            <button className={`side-pill ${active === 'comfyui-settings' ? 'active' : ''}`} type="button" title="工作流设置" aria-label="工作流设置" onClick={() => open(SITE_PAGES.find(page => page.id === 'comfyui-settings')!)}><ShellIcon name="comfyui-settings" /><span className="side-pill-text">工作流设置</span></button>
          </div>
          <button id="update-now-btn" type="button" className={`update-now-btn ${check?.update_available ? 'show' : ''}`} title="一键更新" aria-label={check?.latest?.version ? `更新到 ${versionLabel(check.latest.version)}` : '一键更新'} onClick={() => setUpdateOpen(true)}><ShellIcon name="refresh" /><span id="update-now-text" className="update-now-text"><span className="update-action-prefix">更新到 </span><span className="update-version-compact">{compactVersionLabel(check?.latest?.version)}</span><span className="update-version-full">{versionLabel(check?.latest?.version)}</span></span></button>
          <div id="project-version-badge" className={`project-version-badge ${checking ? 'checking' : ''}`} title="点击检测更新" role="button" tabIndex={0} onClick={() => { if (!checking) void checkForUpdates(true); }} onKeyDown={event => { if (!checking && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); void checkForUpdates(true); } }}><span className="project-version-compact">v{(info?.version || check?.current || '-').split('.').slice(-2).join('.')}</span><span className="project-version-full">v{info?.version || check?.current || '-'}</span></div>
        </div>
      </aside>
      <main className="stage">
        {SITE_PAGES.map(page => <iframe ref={node => { if (node) frames.current[page.id] = node; else delete frames.current[page.id]; }} id={`frame-${page.id}`} data-src={page.src} className={active === page.id ? 'active' : ''} src={loaded.has(page.id) ? page.src : undefined} title={page.label} scrolling="yes" onLoad={event => { syncFrame(event.currentTarget); if (page.id === 'canvas') postToFrame(event.currentTarget, { type: 'canvas-focus' }); }} key={page.id} />)}
        <div className={`nano-monitor ${queue.position > 0 ? 'is-busy' : ''}`} id="nano-monitor">
          <div className="stat-group"><span className="pulse-dot animate-pulse" /><span className="spinner-nano" /><span className="label-nano">ONLINE</span><span id="online-val">{online}</span></div>
          <span className="divider" />
          <div className="stat-group"><span className="label-nano">QUEUE</span><span id="queue-val">{queue.position > 0 ? `${queue.position}/${queue.total}` : queue.total}</span></div>
        </div>
      </main>
    </div>
    {updateOpen && <UpdateCenter info={info} check={check} onClose={() => setUpdateOpen(false)} />}
  </>;
}
