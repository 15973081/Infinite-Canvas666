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

function dimension(value: number): number { return Math.max(1, Math.round(Number(value) || 1)); }
function integer(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(Number(value) || 0)));
}
