import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ComfySettingsApp } from './comfyui-settings/app';

function applyTheme(theme: string) {
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('studio-theme-dark', dark);
  document.documentElement.classList.toggle('theme-dark', dark);
  document.body.classList.toggle('studio-theme-dark', dark);
}

applyTheme(localStorage.getItem('studio_theme') || localStorage.getItem('canvas_theme') || 'light');
window.addEventListener('message', event => {
  if (event.data?.type === 'studio-theme') applyTheme(event.data.theme);
});

const root = document.getElementById('comfySettingsApp');
if (!root) throw new Error('Missing #comfySettingsApp');
createRoot(root).render(<StrictMode><ComfySettingsApp /></StrictMode>);
