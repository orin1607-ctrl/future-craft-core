import { describe, expect, it } from 'vitest';
import {
  blobToDisplayBlob,
  isBrowserDecodableImage,
  isHeicLike,
  nextPhotoIndex,
  prevPhotoIndex,
  sniffHeic,
  swipeDeltaToDir,
} from './shareImageDisplay';

function heicHeader(brand = 'heic') {
  const b = new Uint8Array(16);
  b[4] = 0x66; b[5] = 0x74; b[6] = 0x79; b[7] = 0x70;
  const s = brand;
  b[8] = s.charCodeAt(0); b[9] = s.charCodeAt(1); b[10] = s.charCodeAt(2); b[11] = s.charCodeAt(3);
  return b;
}

function binaryBlob(bytes: Uint8Array, type: string) {
  const copy = bytes.slice();
  return {
    type,
    size: copy.byteLength,
    arrayBuffer: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
  } as Blob;
}

describe('shareImageDisplay', () => {
  it('sniffs HEIC/HEIF brands even when the mime says jpeg', () => {
    expect(sniffHeic(heicHeader('heic'))).toBe(true);
    expect(sniffHeic(heicHeader('mif1'))).toBe(true);
    expect(isHeicLike('image/jpeg', 'IMG_0092.jpg', heicHeader('heic'))).toBe(true);
    expect(isBrowserDecodableImage('image/jpeg', 'IMG_0092.jpg', heicHeader('heic'))).toBe(false);
  });

  it('does not treat HTML or JPEG bytes as HEIC just because the name says .heic', () => {
    const html = new TextEncoder().encode('<!DOCTYPE html><html></html>');
    expect(isHeicLike('image/heic', 'sample.heic', html)).toBe(false);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(isHeicLike('image/heic', 'photo.heic', jpeg)).toBe(false);
    expect(isHeicLike('image/heic', 'photo.heic')).toBe(true);
  });

  it('treats jpeg/png/webp as browser-decodable', () => {
    expect(isBrowserDecodableImage('image/jpeg', 'a.jpg')).toBe(true);
    expect(isBrowserDecodableImage('image/png', 'a.png')).toBe(true);
    expect(isBrowserDecodableImage('image/webp', 'a.webp')).toBe(true);
    expect(isHeicLike('image/heic', 'a.heic')).toBe(true);
    expect(isBrowserDecodableImage('image/heic', 'a.heic')).toBe(false);
  });

  it('walks a 20-photo lightbox without wrapping past the ends', () => {
    expect(nextPhotoIndex(0, 20)).toBe(1);
    expect(nextPhotoIndex(18, 20)).toBe(19);
    expect(nextPhotoIndex(19, 20)).toBe(19);
    expect(prevPhotoIndex(19, 20)).toBe(18);
    expect(prevPhotoIndex(0, 20)).toBe(0);
  });

  it('maps a phone swipe to next/prev', () => {
    expect(swipeDeltaToDir(-80)).toBe('next');
    expect(swipeDeltaToDir(80)).toBe('prev');
    expect(swipeDeltaToDir(10)).toBe(null);
  });

  it('converts HEIC bytes through the supplied converter', async () => {
    const raw = binaryBlob(heicHeader('heic'), 'image/heic');
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
    const out = await blobToDisplayBlob(raw, 'image/jpeg', 'IMG_1.HEIC', async () => jpeg);
    expect(out.converted).toBe(true);
    expect(out.blob).toBe(jpeg);
  });

  it('does not hand a raw HEIC blob to <img> when conversion fails', async () => {
    const raw = binaryBlob(heicHeader('heic'), 'image/heic');
    await expect(blobToDisplayBlob(raw, 'image/jpeg', 'IMG_1.HEIC', async () => {
      throw new Error('converter-down');
    })).rejects.toThrow(/converter-down/);
  });
});
