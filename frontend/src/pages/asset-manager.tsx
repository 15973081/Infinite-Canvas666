import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AssetStudioApp } from '../features/asset-studio/app';
import { mountStudioTheme } from '../shared/theme';

mountStudioTheme();
const root = document.getElementById('assetManagerApp');
if (!root) throw new Error('Missing #assetManagerApp');
createRoot(root).render(<StrictMode><AssetStudioApp /></StrictMode>);

