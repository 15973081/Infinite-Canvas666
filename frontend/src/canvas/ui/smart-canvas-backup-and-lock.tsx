import { useEffect, useState } from 'react';

export function SmartCanvasBackupAndLock({ backups, lockHolder, lockIssue, onAcquireLock, onCloseBackups, onCreateBackup, onDeleteBackup, onRestoreBackup, onStatus }: {
  backups: Array<Record<string, unknown>> | null;
  lockHolder: Record<string, unknown> | null;
  lockIssue: string;
  onAcquireLock(): Promise<boolean>;
  onCloseBackups(): void;
  onCreateBackup(): Promise<void>;
  onDeleteBackup(filename: string): Promise<void>;
  onRestoreBackup(filename: string): Promise<void>;
  onStatus(message: string): void;
}) {
  const [busy, setBusy] = useState('');
  useEffect(() => { window.requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons()); }, [backups, busy, lockHolder]);
  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try { await action(); } catch (error) { onStatus(error instanceof Error ? error.message : String(error)); } finally { setBusy(''); }
  };
  const restore = (filename: string) => {
    if (lockHolder) { onStatus('画布正在被其他人编辑，无法恢复备份'); return; }
    if (!window.confirm('恢复此备份？当前画布将被覆盖。')) return;
    void run(`restore:${filename}`, () => onRestoreBackup(filename));
  };
  return <>
    <div className="smart-lock-overlay" hidden={!lockHolder} id="smartLockOverlay">
      <div className="smart-lock-card"><i data-lucide="lock" /><strong>画布编辑中</strong><span id="smartLockMessage">{lockHolder ? `${lockHolderName(lockHolder)} 正在编辑此画布` : ''}</span><small>你只能查看、移动和缩放画布，等对方退出后会自动解锁。</small>{lockIssue ? <small title={lockIssue}>{lockIssue}</small> : null}<button disabled={busy === 'lock'} id="smartLockRetryBtn" onClick={() => void run('lock', async () => { await onAcquireLock(); })} type="button"><i data-lucide="refresh-cw" /><span>刷新状态</span></button></div>
    </div>
    {backups ? <div className="log-modal open" id="smartBackupModal" onClick={(event) => { if (event.target === event.currentTarget) onCloseBackups(); }}>
      <div className="log-panel backup-panel" onClick={(event) => event.stopPropagation()}><div className="log-head"><div className="log-title">画布备份</div><button className="preview-icon-btn" onClick={onCloseBackups} title="关闭" type="button"><i data-lucide="x" /></button></div><button className="run-btn backup-create" disabled={Boolean(busy)} onClick={() => void run('create', onCreateBackup)} type="button"><i data-lucide="hard-drive" /><span>立即备份</span></button><div className="log-list">{backups.length ? backups.map((backup) => {
        const filename = String(backup.filename || '');
        return <div className="log-item" data-backup-filename={filename} key={filename}><div className="log-main"><div className="log-meta"><span className="log-chip">{String(backup.title || '未命名画布')}</span></div><div className="log-subline"><span>{formatBackupTime(backup.timestamp)}</span><span>{Number(backup.node_count || 0)} 个节点</span><span>{formatBackupSize(backup.size)}</span></div></div><div className="backup-row-actions"><button className="preview-icon-btn" data-backup-restore={filename} disabled={busy === `restore:${filename}`} onClick={() => restore(filename)} title="恢复" type="button"><i data-lucide="rotate-ccw" /></button><button className="preview-icon-btn" data-backup-delete={filename} disabled={busy === `delete:${filename}`} onClick={() => void run(`delete:${filename}`, () => onDeleteBackup(filename))} title="删除" type="button"><i data-lucide="trash-2" /></button></div></div>;
      }) : <div className="log-empty">暂无备份</div>}</div></div>
    </div> : null}
  </>;
}

export function formatBackupSize(value: unknown): string {
  const size = Math.max(0, Number(value || 0));
  return size > 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
}
function formatBackupTime(value: unknown) { const timestamp = Number(value || 0); return timestamp ? new Date(timestamp).toLocaleString() : '--'; }
function lockHolderName(holder: Record<string, unknown>) { return String(holder.username || holder.ip || '其他用户'); }
