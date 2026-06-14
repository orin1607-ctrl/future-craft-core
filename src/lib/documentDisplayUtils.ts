import { isPdfUrl } from '@/lib/uploadDocument';

export type DocumentKind = 'image' | 'pdf' | 'other';

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp']);

export function fileExtensionFrom(nameOrUrl: string): string {
  const clean = nameOrUrl.split('?')[0].split('#')[0];
  const segment = clean.split('/').pop() || clean;
  const dot = segment.lastIndexOf('.');
  return dot >= 0 ? segment.slice(dot + 1).toLowerCase() : '';
}

export function isImageDocument(nameOrUrl: string): boolean {
  return IMAGE_EXT.has(fileExtensionFrom(nameOrUrl));
}

export function getDocumentKind(nameOrUrl: string): DocumentKind {
  if (isImageDocument(nameOrUrl)) return 'image';
  if (isPdfUrl(nameOrUrl) || fileExtensionFrom(nameOrUrl) === 'pdf') return 'pdf';
  return 'other';
}

export function fileNameFromDocument(nameOrUrl: string, fallback = 'מסמך'): string {
  const clean = nameOrUrl.split('?')[0].split('#')[0];
  const base = clean.split('/').pop();
  if (!base || base.length > 120 || /^[a-f0-9-]{20,}$/i.test(base)) return fallback;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

export function triggerDocumentDownload(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
