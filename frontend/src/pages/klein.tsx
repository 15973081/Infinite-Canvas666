import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageStudioApp } from '../features/image-studio/app';
import { kleinAdapter } from '../features/image-studio/workflow-adapters';
import { mountStudioTheme } from '../shared/theme';

mountStudioTheme();
const root = document.getElementById('kleinApp');
if (!root) throw new Error('Missing #kleinApp');
createRoot(root).render(<StrictMode><ImageStudioApp adapter={kleinAdapter} /></StrictMode>);
