import { blobToDisplayBlob } from './shareImageDisplay';

export function isTiff(bytes: Uint8Array) {
  return bytes.length >= 4 && ((bytes[0] === 73 && bytes[1] === 73 && bytes[2] === 42 && bytes[3] === 0)
    || (bytes[0] === 77 && bytes[1] === 77 && bytes[2] === 0 && bytes[3] === 42));
}

export async function claimDisplayBlob(blob: Blob, name: string, mime: string, page = 0) {
  const buffer = await blob.arrayBuffer();
  if (!isTiff(new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)))) {
    return { ...(await blobToDisplayBlob(blob, mime, name)), pages: 1 };
  }
  const { default: tiff } = await import('utif');
  const images = tiff.decode(buffer);
  const image = images[page];
  if (!image) throw new Error('tiff-page');
  const width = Number(image.t256?.[0]);
  const height = Number(image.t257?.[0]);
  if (!(width > 0 && height > 0 && width * height <= 40000000)) throw new Error('tiff-size');
  tiff.decodeImage(buffer, image);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  const pixels = ctx.createImageData(image.width, image.height);
  pixels.data.set(tiff.toRGBA8(image));
  ctx.putImageData(pixels, 0, 0);
  const result = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('tiff-empty')), 'image/png'));
  return { blob: result, converted: true, pages: images.length };
}
