import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProviderStudioApp } from '../features/provider-studio/app';
import { mountStudioTheme } from '../shared/theme';

mountStudioTheme();
const root = document.getElementById('apiSettingsApp');
if (!root) throw new Error('Missing #apiSettingsApp');
createRoot(root).render(<StrictMode><ProviderStudioApp /></StrictMode>);
