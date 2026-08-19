import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteShellApp } from '../features/site-shell/app';
import { mountStudioTheme } from '../shared/theme';

const topLevelMarker = '__site_shell_top';

if (window.self !== window.top) {
  const topLevelUrl = new URL(window.location.href);
  topLevelUrl.searchParams.set(topLevelMarker, '1');
  window.top?.location.replace(topLevelUrl.href);
} else {
  const cleanUrl = new URL(window.location.href);
  if (cleanUrl.searchParams.has(topLevelMarker)) {
    cleanUrl.searchParams.delete(topLevelMarker);
    window.history.replaceState(window.history.state, '', cleanUrl.href);
  }
  mountStudioTheme();
  const root = document.getElementById('siteShellApp');
  if (!root) throw new Error('Missing #siteShellApp');
  createRoot(root).render(<StrictMode><SiteShellApp /></StrictMode>);
}
