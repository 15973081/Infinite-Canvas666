import { useMemo } from 'react';
import type { CanvasNode } from '../domain/types';
import {
  LegacyImageTransformDialog,
  type LegacyGridJoinResult,
  type LegacyGridResult,
  type LegacyImageEditMode,
  type LegacyImageTransformResult,
  type LegacyMaskResult,
} from './legacy-image-transform-dialog';
import { smartImageItems, smartImageMediaKind, type SmartImageItem } from './smart-image-node';

export type SmartCanvasImageEditMode = Exclude<LegacyImageEditMode, 'preview'>;

export interface SmartCanvasImageEditorProps {
  imageIndex: number;
  initialMode: SmartCanvasImageEditMode;
  node: CanvasNode;
  onApply(result: LegacyImageTransformResult): Promise<void>;
  onClose(): void;
  onCreateMask(result: LegacyMaskResult): Promise<void>;
  onGridJoin(result: LegacyGridJoinResult): Promise<void>;
  onGridSplit(result: LegacyGridResult): Promise<void>;
}

export interface SmartVideoFrameResult {
  blob: Blob;
  height: number;
  name: string;
  width: number;
}

export function SmartCanvasImageEditor({ imageIndex, initialMode, node, onApply, onClose, onCreateMask, onGridJoin, onGridSplit }: SmartCanvasImageEditorProps) {
  const items = useMemo(() => smartImageItems(node), [node]);
  const image = items[imageIndex] || items[0];
  const joinSignature = items.map((item) => [item.url, item.name, item.natural_w || item.width, item.natural_h || item.height].join('|')).join('::');
  // The persisted node object may be replaced after a save; media identity is the reset boundary.
  const joinItems = useMemo(() => items.filter((item) => smartImageMediaKind(item) === 'image').map((item) => ({
    name: String(item.name || ''),
    natural_h: Number(item.natural_h || item.height || 0),
    natural_w: Number(item.natural_w || item.width || 0),
    url: smartEditorMediaUrl(item),
  })), [joinSignature]);
  if (!image?.url || smartImageMediaKind(image) !== 'image') return null;
  return <LegacyImageTransformDialog
    initialMode={initialMode}
    joinItems={joinItems}
    name={String(image.name || smartEditorFileName(String(image.url)) || 'image')}
    onApply={onApply}
    onClose={onClose}
    onCreateMask={onCreateMask}
    onGridJoin={onGridJoin}
    onGridSplit={onGridSplit}
    url={smartEditorMediaUrl(image)}
  />;
}

export async function createSmartVideoFrame(video: HTMLVideoElement, item: SmartImageItem, which: 'current' | 'first' | 'last'): Promise<SmartVideoFrameResult> {
  if (video.readyState < 2) await waitForVideoEvent(video, 'loadeddata', 2_200);
  if (!video.videoWidth || !video.videoHeight) throw new Error('视频还没有加载完成');
  const originalTime = Number(video.currentTime || 0);
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const fps = Number(item.fps || item.frameRate || item.frame_rate || item.framespersecond || item.frames_per_second || 0);
  const step = 1 / Math.max(1, Math.min(120, Number.isFinite(fps) && fps > 0 ? fps : 30));
  const target = which === 'first' ? 0 : which === 'last' ? Math.max(0, duration - step / 2) : originalTime;
  video.pause();
  await seekSmartVideo(video, target);
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('导出帧失败');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('导出帧失败')), 'image/png'));
  const suffix = which === 'first' ? 'first-frame' : which === 'last' ? 'last-frame' : 'current-frame';
  const rawName = String(item.name || smartEditorFileName(String(item.url || '')) || 'video');
  const base = rawName.replace(/\.[a-z0-9]{2,8}$/i, '') || 'video';
  if (which !== 'current') await seekSmartVideo(video, originalTime);
  return { blob, height: canvas.height, name: `${base}-${suffix}.png`.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_'), width: canvas.width };
}

function smartEditorMediaUrl(item: SmartImageItem): string {
  const url = String(item.url || '');
  if (!/^https?:\/\//i.test(url)) return url;
  return `/api/download-output?inline=1&url=${encodeURIComponent(url)}&name=${encodeURIComponent(String(item.name || smartEditorFileName(url) || 'image'))}`;
}

function smartEditorFileName(url: string): string {
  try { return decodeURIComponent(url.split(/[?#]/, 1)[0].split('/').pop() || '').replace(/[\\/:*?"<>|]/g, '_'); }
  catch { return 'media'; }
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: 'loadeddata' | 'seeked', timeout: number): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => { if (finished) return; finished = true; clearTimeout(timer); video.removeEventListener(eventName, finish); resolve(); };
    const timer = window.setTimeout(finish, timeout);
    video.addEventListener(eventName, finish, { once: true });
  });
}

async function seekSmartVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(Number(video.currentTime || 0) - time) <= .002) return;
  video.currentTime = time;
  await waitForVideoEvent(video, 'seeked', 2_200);
}
