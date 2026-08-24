import { describe, expect, it } from 'vitest';
import { formatBackupSize } from './smart-canvas-backup-and-lock';

describe('SmartCanvasBackupAndLock', () => {
  it('preserves the legacy byte and KB backup size labels', () => {
    expect(formatBackupSize(0)).toBe('0 B');
    expect(formatBackupSize(1024)).toBe('1024 B');
    expect(formatBackupSize(1536)).toBe('1.5 KB');
  });
});
