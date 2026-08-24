export interface ImageSize {
  height: number;
  width: number;
}

export interface CropRegion extends ImageSize {
  x: number;
  y: number;
}

export interface OutpaintRegion extends ImageSize {
  offsetX: number;
  offsetY: number;
}

export interface GridLine { pos: number; type: 'h' | 'v' }
export interface GridRect { col: number; h: number; row: number; w: number; x: number; y: number }

export function normalizeCrop(region: CropRegion, source: ImageSize): CropRegion {
  const sourceWidth = dimension(source.width);
  const sourceHeight = dimension(source.height);
  const x = integer(region.x, 0, sourceWidth - 1);
  const y = integer(region.y, 0, sourceHeight - 1);
  return {
    x,
    y,
    width: integer(region.width, 1, sourceWidth - x),
    height: integer(region.height, 1, sourceHeight - y),
  };
}

export function normalizeOutpaint(region: OutpaintRegion, source: ImageSize, maximum = 4096): OutpaintRegion {
  const sourceWidth = dimension(source.width);
  const sourceHeight = dimension(source.height);
  const width = integer(region.width, sourceWidth, Math.max(sourceWidth, maximum));
  const height = integer(region.height, sourceHeight, Math.max(sourceHeight, maximum));
  return {
    width,
    height,
    offsetX: integer(region.offsetX, 0, width - sourceWidth),
    offsetY: integer(region.offsetY, 0, height - sourceHeight),
  };
}

export function transformedImageName(name: string, mode: 'crop' | 'outpaint'): string {
  const base = String(name || 'image').replace(/\.[^.]+$/, '') || 'image';
  return `${base}_${mode}.png`;
}

export function binaryMaskPixels(source: Uint8ClampedArray): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length);
  for (let index = 0; index < source.length; index += 4) {
    const value = source[index + 3] > 8 ? 255 : 0;
    output[index] = value;
    output[index + 1] = value;
    output[index + 2] = value;
    output[index + 3] = 255;
  }
  return output;
}

export function circledNumber(value: number): string {
  const number = Math.max(1, Math.round(Number(value) || 1));
  return number <= 20 ? String.fromCharCode(0x2460 + number - 1) : String(number);
}

export function gridSplitRects(widthValue: number, heightValue: number, options: { cols?: number; gap?: number; lines?: GridLine[]; rows?: number } = {}): GridRect[] {
  const width = dimension(widthValue);
  const height = dimension(heightValue);
  const gap = Math.max(0, Math.min(240, Number(options.gap) || 0));
  const halfGap = gap / 2;
  const custom = Array.isArray(options.lines);
  const horizontal = custom
    ? [...new Set(options.lines!.filter((line) => line.type === 'h').map((line) => Math.max(0.001, Math.min(0.999, Number(line.pos) || 0.001)) * height))].sort((a, b) => a - b)
    : Array.from({ length: Math.max(1, Math.min(21, Math.round(Number(options.rows) || 1))) - 1 }, (_, index) => (index + 1) * height / Math.max(1, Math.min(21, Math.round(Number(options.rows) || 1))));
  const vertical = custom
    ? [...new Set(options.lines!.filter((line) => line.type === 'v').map((line) => Math.max(0.001, Math.min(0.999, Number(line.pos) || 0.001)) * width))].sort((a, b) => a - b)
    : Array.from({ length: Math.max(1, Math.min(21, Math.round(Number(options.cols) || 1))) - 1 }, (_, index) => (index + 1) * width / Math.max(1, Math.min(21, Math.round(Number(options.cols) || 1))));
  const yCuts = [0, ...horizontal, height];
  const xCuts = [0, ...vertical, width];
  const rects: GridRect[] = [];
  for (let row = 0; row < yCuts.length - 1; row += 1) {
    const y1 = Math.round(row === 0 ? yCuts[row] : yCuts[row] + halfGap);
    const y2 = Math.round(row === yCuts.length - 2 ? yCuts[row + 1] : yCuts[row + 1] - halfGap);
    for (let col = 0; col < xCuts.length - 1; col += 1) {
      const x1 = Math.round(col === 0 ? xCuts[col] : xCuts[col] + halfGap);
      const x2 = Math.round(col === xCuts.length - 2 ? xCuts[col + 1] : xCuts[col + 1] - halfGap);
      if (x2 > x1 && y2 > y1) rects.push({ row, col, x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    }
  }
  return rects;
}

function dimension(value: number): number { return Math.max(1, Math.round(Number(value) || 1)); }
function integer(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(Number(value) || 0)));
}
