/** Display helpers for the public Secure Share gallery. HEIC/HEIF must become JPEG in Chrome. */

const HEIC_BRANDS = new Set(['heic', 'heix', 'heif', 'heim', 'heis', 'mif1', 'msf1']);

export function sniffHeic(bytes: Uint8Array | ArrayBuffer | null | undefined) {
  const b = bytes instanceof Uint8Array ? bytes : bytes ? new Uint8Array(bytes) : null;
  if (!b || b.length < 12) return false;
  if (b[4] !== 0x66 || b[5] !== 0x74 || b[6] !== 0x79 || b[7] !== 0x70) return false;
  const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
  return HEIC_BRANDS.has(brand);
}

export function isHeicLike(mime = '', name = '', bytes?: Uint8Array | ArrayBuffer | null) {
  if (bytes && sniffHeic(bytes)) return true;
  const m = String(mime || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  return /image\/hei[cf]/i.test(m) || /\.(heic|heif)$/i.test(n);
}

export function isBrowserDecodableImage(mime = '', name = '', bytes?: Uint8Array | ArrayBuffer | null) {
  if (isHeicLike(mime, name, bytes)) return false;
  const m = String(mime || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  return /^image\/(jpeg|jpg|pjpeg|png|gif|webp|bmp)$/i.test(m) || /\.(jpe?g|png|gif|webp|bmp)$/i.test(n);
}

export function nextPhotoIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return i >= n - 1 ? i : i + 1;
}

export function prevPhotoIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return i <= 0 ? 0 : i - 1;
}

export function swipeDeltaToDir(dx: number, threshold = 48): 'next' | 'prev' | null {
  if (dx <= -threshold) return 'next';
  if (dx >= threshold) return 'prev';
  return null;
}

type HeicConverter = (blob: Blob) => Promise<Blob>;

let cachedConvert: HeicConverter | null = null;

async function defaultHeicToJpeg(blob: Blob): Promise<Blob> {
  if (!cachedConvert) {
    const mod = await import('heic2any');
    const heic2any = (mod as { default?: (opts: { blob: Blob; toType: string; quality?: number }) => Promise<Blob | Blob[]> }).default
      || (mod as unknown as (opts: { blob: Blob; toType: string; quality?: number }) => Promise<Blob | Blob[]>);
    cachedConvert = async (b: Blob) => {
      const out = await heic2any({ blob: b, toType: 'image/jpeg', quality: 0.86 });
      return Array.isArray(out) ? out[0] : out;
    };
  }
  return cachedConvert(blob);
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

export async function blobToDisplayBlob(
  blob: Blob,
  mime = '',
  name = '',
  convertHeic: HeicConverter = defaultHeicToJpeg,
): Promise<{ blob: Blob; converted: boolean }> {
  const buf = await readBlobBytes(blob);
  if (!isHeicLike(mime, name, buf.subarray(0, 32))) {
    return { blob, converted: false };
  }
  try {
    const jpeg = await convertHeic(blob);
    return { blob: jpeg, converted: true };
  } catch {
    return { blob, converted: false };
  }
}

export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
