import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageStudioApp } from '../features/image-studio/app';
import { generateOnline, loadProviders, resumeOnline } from '../features/image-studio/client';
import type { ImageStudioAdapter } from '../features/image-studio/types';
import { mountStudioTheme } from '../shared/theme';

const adapter: ImageStudioAdapter = {
  id: 'online', title: '在线图片生成', subtitle: '统一使用 API 设置中的平台与模型，支持参考图、异步任务恢复和多图输出。',
  historyType: 'online', maxReferences: 4, modes: [{ id: 'online', label: '在线模型' }], defaultMode: 'online',
  supportsProviders: true, supportsQuality: true, supportsCount: true, loadProviders, resume: resumeOnline, generate: generateOnline,
};

mountStudioTheme();
const root = document.getElementById('onlineApp');
if (!root) throw new Error('Missing #onlineApp');
createRoot(root).render(<StrictMode><ImageStudioApp adapter={adapter} /></StrictMode>);
