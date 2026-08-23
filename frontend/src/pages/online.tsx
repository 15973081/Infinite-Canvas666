import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OnlineStudioApp } from '../features/image-studio/online-app';
import { mountStudioTheme } from '../shared/theme';

mountStudioTheme();
const root = document.getElementById('onlineApp');
if (!root) throw new Error('Missing #onlineApp');
createRoot(root).render(<StrictMode><OnlineStudioApp /></StrictMode>);
