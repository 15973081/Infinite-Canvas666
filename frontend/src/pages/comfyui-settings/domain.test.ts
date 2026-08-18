import { describe, expect, it, vi } from 'vitest';
import { configurableInputs, extractRunAssets, graphLayers, guessFieldType, isWorkflowLink, makeField, randomValue } from './domain';
import type { WorkflowGraph } from './types';

const graph: WorkflowGraph = {
  '3': { class_type: 'SaveImage', inputs: { images: ['2', 0], filename_prefix: 'output' } },
  '1': { class_type: 'CheckpointLoader', inputs: { ckpt_name: 'model.safetensors' } },
  '2': { class_type: 'KSampler', inputs: { model: ['1', 0], seed: 42, cfg: 7.5, enabled: true } },
};

describe('Comfy workflow domain', () => {
  it('separates links from configurable primitive inputs', () => {
    expect(isWorkflowLink(['1', 0])).toBe(true);
    expect(isWorkflowLink(['choice', 'value'])).toBe(false);
    expect(configurableInputs(graph, '2')).toEqual([['seed', 42], ['cfg', 7.5], ['enabled', true]]);
  });

  it('orders nodes into dependency layers', () => {
    expect(graphLayers(graph)).toEqual([['1'], ['2'], ['3']]);
  });

  it('infers media, prompt, scalar and random seed fields', () => {
    expect(guessFieldType('hello', 'positive_prompt')).toBe('textarea');
    expect(guessFieldType('clip.mp4', 'file')).toBe('video');
    expect(guessFieldType('voice.wav', 'audio')).toBe('audio');
    expect(guessFieldType(7, 'cfg')).toBe('slider');
    expect(guessFieldType(false, 'enabled')).toBe('boolean');
    const seed = makeField('2', 'noise_seed', 10);
    expect(seed).toMatchObject({ node: '2', input: 'noise_seed', type: 'number', random_enabled: true });
  });

  it('extracts nested output assets without duplicates', () => {
    expect(extractRunAssets({ images: ['/output/a.png'], result: { videos: ['/output/b.mp4'], again: '/output/a.png' }, audio: '/output/c.wav' })).toEqual([
      { url: '/output/a.png', kind: 'image' },
      { url: '/output/b.mp4', kind: 'video' },
      { url: '/output/c.wav', kind: 'audio' },
    ]);
  });

  it('generates bounded stepped random values', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(randomValue({ ...makeField('2', 'seed', 0), min: 10, max: 20, step: 2 })).toBe(16);
    vi.restoreAllMocks();
  });
});
