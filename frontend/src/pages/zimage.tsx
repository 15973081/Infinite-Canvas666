import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageStudioApp } from '../features/image-studio/app';
import { generateZImage } from '../features/image-studio/client';
import type { ImageStudioAdapter } from '../features/image-studio/types';
import { mountStudioTheme } from '../shared/theme';

const adapter: ImageStudioAdapter = {
  id: 'zimage', title: 'Z-Image 图像生成', subtitle: '在本地 ComfyUI 与 ModelScope 云端之间切换，统一管理尺寸、结果和历史记录。',
  historyType: 'zimage', maxReferences: 0, modes: [{ id: 'local', label: '本地生成' }, { id: 'cloud', label: 'ModelScope 云端' }], defaultMode: localStorage.getItem('zimage_engine') === 'cloud' ? 'cloud' : 'local',
  supportsProviders: false, supportsQuality: false, supportsCount: false, generate: generateZImage,
};

mountStudioTheme();
const root = document.getElementById('zimageApp');
if (!root) throw new Error('Missing #zimageApp');
createRoot(root).render(<StrictMode><ImageStudioApp adapter={adapter} /></StrictMode>);
