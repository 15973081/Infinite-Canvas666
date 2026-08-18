import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ComfySettingsApp } from './comfyui-settings/app';
import { mountStudioTheme } from '../shared/theme';

mountStudioTheme();

const root = document.getElementById('comfySettingsApp');
if (!root) throw new Error('Missing #comfySettingsApp');
createRoot(root).render(<StrictMode><ComfySettingsApp /></StrictMode>);
