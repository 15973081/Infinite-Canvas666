export type StudioTheme = 'light' | 'dark';

export function normalizeStudioTheme(theme: string): StudioTheme {
  return theme === 'dark' ? 'dark' : 'light';
}

export function applyStudioTheme(theme: string): StudioTheme {
  const normalized = normalizeStudioTheme(theme);
  const dark = normalized === 'dark';
  document.documentElement.classList.toggle('studio-theme-dark', dark);
  document.documentElement.classList.toggle('theme-dark', dark);
  document.body.classList.toggle('studio-theme-dark', dark);
  return normalized;
}

export function mountStudioTheme(): () => void {
  applyStudioTheme(localStorage.getItem('studio_theme') || localStorage.getItem('canvas_theme') || 'light');
  const listener = (event: MessageEvent) => {
    if (event.data?.type === 'studio-theme') applyStudioTheme(event.data.theme);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
