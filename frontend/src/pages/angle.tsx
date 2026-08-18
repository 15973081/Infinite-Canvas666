import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageStudioApp } from '../features/image-studio/app';
import { angleAdapter } from '../features/image-studio/workflow-adapters';
import { mountStudioTheme } from '../shared/theme';

mountStudioTheme();
const root = document.getElementById('angleApp');
if (!root) throw new Error('Missing #angleApp');
createRoot(root).render(<StrictMode><ImageStudioApp adapter={angleAdapter} /></StrictMode>);
