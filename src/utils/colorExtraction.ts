/**
 * Color extraction from images and contrast utilities.
 * Uses canvas-based quantization (no npm dependencies).
 */

// --- HSL helpers ---

type HSL = { h: number; s: number; l: number };

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// --- Contrast helpers (WCAG 2.1) ---

function relativeLuminance(r: number, g: number, b: number): number {
  const srgb = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Mix a hex color with white to produce an opaque tinted color.
 * @param amount 0 = pure color, 1 = pure white (e.g. 0.94 = very subtle tint)
 */
export function tintWithWhite(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const tr = Math.round(r + (255 - r) * amount);
  const tg = Math.round(g + (255 - g) * amount);
  const tb = Math.round(b + (255 - b) * amount);
  return `#${tr.toString(16).padStart(2, '0')}${tg.toString(16).padStart(2, '0')}${tb.toString(16).padStart(2, '0')}`;
}

/**
 * Darken/saturate a hex color until it has sufficient contrast on white.
 * Keeps the original hue.
 */
export function ensureContrast(hex: string, minRatio = 3.5): string {
  const [r, g, b] = hexToRgb(hex);
  let { h, s, l } = rgbToHsl(r, g, b);

  // Boost saturation if too low
  if (s < 20) s = 25;

  const whiteLum = 1; // relative luminance of #FFFFFF
  for (let i = 0; i < 40; i++) {
    const adjusted = hslToHex(h, s, l);
    const [ar, ag, ab] = hexToRgb(adjusted);
    const lum = relativeLuminance(ar, ag, ab);
    if (contrastRatio(whiteLum, lum) >= minRatio) return adjusted;
    l = Math.max(0, l - 2);
  }

  return hslToHex(h, s, l);
}

/**
 * Extract the dominant *saturated* color from an image using canvas quantization.
 * Returns hex string or null on failure.
 */
export async function extractDominantColor(imageUrl: string): Promise<string | null> {
  try {
    const img = await loadImage(imageUrl);
    const size = 50;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    // 12 hue buckets (0-30, 30-60, …, 330-360)
    const BUCKET_COUNT = 12;
    const bucketWeight = new Float64Array(BUCKET_COUNT);
    const bucketPixels: Array<Array<{ r: number; g: number; b: number; s: number }>> = Array.from({ length: BUCKET_COUNT }, () => []);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const { h, s, l } = rgbToHsl(r, g, b);

      // Skip achromatic / too dark / too bright
      if (s < 15 || l < 10 || l > 90) continue;

      const bucket = Math.min(Math.floor(h / 30), BUCKET_COUNT - 1);
      bucketWeight[bucket] += s; // weight by saturation
      bucketPixels[bucket].push({ r, g, b, s });
    }

    // Find the bucket with highest cumulative weight
    let bestBucket = 0;
    for (let i = 1; i < BUCKET_COUNT; i++) {
      if (bucketWeight[i] > bucketWeight[bestBucket]) bestBucket = i;
    }

    const pixels = bucketPixels[bestBucket];
    if (pixels.length === 0) return null;

    // Pick the median pixel (sorted by saturation) for a representative color
    pixels.sort((a, b) => a.s - b.s);
    const mid = pixels[Math.floor(pixels.length / 2)];
    const rr = mid.r.toString(16).padStart(2, '0');
    const gg = mid.g.toString(16).padStart(2, '0');
    const bb = mid.b.toString(16).padStart(2, '0');
    return `#${rr}${gg}${bb}`;
  } catch (e) {
    console.warn('extractDominantColor failed:', e);
    return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
