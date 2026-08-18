export type StudioEventType = 'providers-changed' | 'workflows-changed' | 'comfy-instances-changed' | 'assets-changed' | 'chat-changed';

export function publishStudioEvent(type: StudioEventType): void {
  try {
    const channel = new BroadcastChannel('studio-api');
    channel.postMessage({ type });
    channel.close();
  } catch { /* BroadcastChannel is optional in embedded webviews. */ }
}

export function subscribeStudioEvents(listener: (type: StudioEventType | string) => void): () => void {
  try {
    const channel = new BroadcastChannel('studio-api');
    const handler = (event: MessageEvent<{ type?: string }>) => event.data?.type && listener(event.data.type);
    channel.addEventListener('message', handler);
    return () => { channel.removeEventListener('message', handler); channel.close(); };
  } catch { return () => undefined; }
}
