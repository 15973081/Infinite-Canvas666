import { describe, expect, it } from 'vitest';
import { formatSmartCanvasCost, smartCanvasGenerationLogCost, smartCanvasLogCostTotals } from './smart-canvas-log-cost-panel';

describe('SmartCanvasLogCostPanel', () => {
  it('totals priced image/video calls while preserving estimated and unknown counts', () => {
    const totals = smartCanvasLogCostTotals([
      { status: 'success', cost: { status: 'priced', kind: 'image', source: 'actual', amount_micros: 1_250_000 } },
      { status: 'success', cost: { status: 'priced', kind: 'video', source: 'estimated', amount_micros: 2_500_000 } },
      { status: 'success', kind: 'image' },
      { status: 'failed', cost: { status: 'priced', kind: 'image', amount_micros: 9_000_000 } },
    ]);
    expect(totals).toEqual({ calls: 2, estimated: 2_500_000, image: 1_250_000, total: 3_750_000, unknown: 1, video: 2_500_000 });
    expect(formatSmartCanvasCost(totals.total)).toBe('¥3.75');
  });

  it('keeps legacy numeric CNY costs and marks missing successful prices as unknown', () => {
    expect(smartCanvasGenerationLogCost({ status: 'success', cost_cny: 0.125, outputs: ['/a.png'] })).toEqual({ amount_micros: 125_000, kind: 'image', source: 'actual', status: 'priced' });
    expect(smartCanvasGenerationLogCost({ status: 'success', outputs: ['/a.mp4'] })).toEqual({ kind: 'video', source: 'actual', status: 'unknown' });
    expect(smartCanvasGenerationLogCost({ status: 'failed', error: 'upstream' })).toBeNull();
  });
});
