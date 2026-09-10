/** Same-origin blob download for signed / share URLs. Cross-origin <a download> is ignored by browsers. */

export function withAttachmentParam(url: string, filename: string) {
  try {
    const u = new URL(url);
    u.searchParams.set('download', filename || 'file');
    return u.toString();
  } catch {
    return url;
  }
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename || 'file';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

export async function downloadRemoteFile(url: string, filename: string) {
  const name = filename || 'file';
  const attached = withAttachmentParam(url, name);
  try {
    const res = await fetch(attached, { mode: 'cors' });
    if (res.ok) {
      triggerBlobDownload(await res.blob(), name);
      return true;
    }
  } catch {
    /* CORS or network — fall through to attachment navigation */
  }
  const a = document.createElement('a');
  a.href = attached;
  a.download = name;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return false;
}
