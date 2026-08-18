import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageStudioApp } from '../features/image-studio/app';
import { enhanceAdapter } from '../features/image-studio/workflow-adapters';
import { mountStudioTheme } from '../shared/theme';

mountStudioTheme();
const root = document.getElementById('enhanceApp');
if (!root) throw new Error('Missing #enhanceApp');
createRoot(root).render(<StrictMode><ImageStudioApp adapter={enhanceAdapter} /></StrictMode>);
