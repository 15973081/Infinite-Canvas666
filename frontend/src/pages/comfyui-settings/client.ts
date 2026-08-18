import { jsonRequest, requestJson } from '../../shared/http';
import type { WorkflowConfig, WorkflowDetail, WorkflowGraph, WorkflowSummary } from './types';

export const comfyClient = {
  async listInstances(): Promise<string[]> {
    return (await requestJson<{ instances?: string[] }>('/api/comfyui/instances')).instances ?? [];
  },
  async saveInstances(instances: string[]): Promise<void> {
    await requestJson('/api/comfyui/instances', jsonRequest('PUT', { instances }));
  },
  async listWorkflows(): Promise<WorkflowSummary[]> {
    return (await requestJson<{ workflows?: WorkflowSummary[] }>('/api/workflows')).workflows ?? [];
  },
  getWorkflow(name: string): Promise<WorkflowDetail> {
    return requestJson(`/api/workflows/${encodeURIComponent(name)}`);
  },
  uploadWorkflow(name: string, workflow: WorkflowGraph): Promise<{ name: string }> {
    return requestJson('/api/workflows', jsonRequest('POST', { name, workflow }));
  },
  async saveConfig(name: string, config: WorkflowConfig): Promise<void> {
    await requestJson(`/api/workflows/${encodeURIComponent(name)}/config`, jsonRequest('PUT', config));
  },
  async deleteWorkflow(name: string): Promise<void> {
    await requestJson(`/api/workflows/${encodeURIComponent(name)}`, { method: 'DELETE' });
  },
  run(name: string, fields: Record<string, unknown>, config: WorkflowConfig): Promise<unknown> {
    return requestJson(`/api/workflows/${encodeURIComponent(name)}/run`, jsonRequest('POST', { fields, config, client_id: 'workflow-test-react' }));
  },
  async uploadMedia(file: File): Promise<string> {
    const body = new FormData();
    body.append('files', file);
    const data = await requestJson<{ files?: Array<{ comfy_name?: string }> }>('/api/upload', { method: 'POST', body });
    const name = data.files?.[0]?.comfy_name;
    if (!name) throw new Error('媒体上传未返回文件名');
    return name;
  },
};
