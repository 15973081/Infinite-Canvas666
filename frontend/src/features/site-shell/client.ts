import { jsonRequest, requestJson } from '../../shared/http';
import type { AppInfo, ConnectivityItem, ConnectivityResult, QueueStatus, UpdateBackup, UpdateCheck, UpdateResult } from './types';

export const shellClient = {
  queue: (clientId: string) => requestJson<QueueStatus>(`/api/queue_status?client_id=${encodeURIComponent(clientId)}`),
  appInfo: () => requestJson<AppInfo>('/api/app-info'),
  checkUpdate: () => requestJson<UpdateCheck>('/api/check-update'),
  connectivity: () => requestJson<ConnectivityResult>('/api/update-connectivity'),
  connectivityProbe: (name: string, signal?: AbortSignal) => requestJson<ConnectivityItem>(`/api/update-connectivity/probe?name=${encodeURIComponent(name)}`, { signal }),
  update: (source: string, signal?: AbortSignal) => requestJson<UpdateResult>('/api/update-from-github', { ...jsonRequest('POST', { source, fallback: true, auto_restart: true, restart_delay: 3 }), signal }),
  backups: () => requestJson<{ backups: UpdateBackup[] }>('/api/update-backups'),
  rollback: (name: string) => requestJson<{ ok: boolean; count: number; restart_required?: boolean; restart_scheduled?: boolean }>('/api/update-rollback', jsonRequest('POST', { name, auto_restart: true, restart_delay: 3 })),
};
