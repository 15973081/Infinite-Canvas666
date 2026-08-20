export function legacyCanvasUrl(source: string | URL = window.location.href): string {
  const base = typeof window === 'undefined' ? 'http://localhost/' : window.location.href;
  const current = new URL(source, base);
  const legacy = new URL('/static/canvas-legacy.html', current);
  legacy.search = current.search;
  legacy.hash = current.hash;
  legacy.searchParams.delete('canvas_v2');
  legacy.searchParams.delete('canvas_v2_rollout');
  return `${legacy.pathname}${legacy.search}${legacy.hash}`;
}
