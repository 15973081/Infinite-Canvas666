import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteShellApp } from '../features/site-shell/app';
import { mountStudioTheme } from '../shared/theme';

mountStudioTheme();
const root = document.getElementById('siteShellApp');
if (!root) throw new Error('Missing #siteShellApp');
createRoot(root).render(<StrictMode><SiteShellApp /></StrictMode>);

