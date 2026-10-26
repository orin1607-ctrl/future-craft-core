/**
 * sw-share.js
 * Service Worker for Dalia Claims PWA Web Share Target.
 * Intercepts incoming shares from Android system share sheet,
 * stores the files in IndexedDB, and redirects to the claims dashboard.
 */

const DB_NAME = 'dalia_share_target_db';
const STORE_NAME = 'shared_incoming';
const DB_VERSION = 1;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveIncomingFiles(files, title, text) {
  if (!files || !files.length) return [];
  const db = await openDB();
  const savedIds = [];

  for (const file of files) {
    if (!file || typeof file.arrayBuffer !== 'function') continue;
    const buffer = await file.arrayBuffer();
    const blob = new Blob([buffer], { type: file.type || 'application/pdf' });
    const id = 'share_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    const item = {
      id,
      name: file.name || 'carpart_tender.pdf',
      type: file.type || 'application/pdf',
      size: file.size || blob.size,
      blob,
      receivedAt: new Date().toISOString(),
      title: title || '',
      text: text || '',
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve(id);
      req.onerror = () => reject(req.error);
    });

    savedIds.push(id);
  }

  // Notify any active clients via BroadcastChannel
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('dalia_share_channel');
      bc.postMessage({ type: 'SHARED_DOC_ARRIVED', count: savedIds.length, ids: savedIds });
      bc.close();
    }
  } catch (e) {
    // ignore
  }

  return savedIds;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check for Web Share Target POST
  if (event.request.method === 'POST' && url.searchParams.get('action') === 'share-target') {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const files = [
          ...formData.getAll('shared_files'),
          ...formData.getAll('files'),
          ...formData.getAll('file'),
        ].filter(Boolean);

        const title = formData.get('title') || '';
        const text = formData.get('text') || '';

        await saveIncomingFiles(files, title, text);

        // Redirect with 303 (See Other) to claims dashboard with shared_doc trigger
        const redirectUrl = new URL(url.pathname, url.origin);
        redirectUrl.searchParams.set('view', 'claims');
        redirectUrl.searchParams.set('shared_doc', '1');
        redirectUrl.searchParams.set('t', String(Date.now()));

        return Response.redirect(redirectUrl.href, 303);
      } catch (err) {
        console.error('[sw-share] Error handling incoming share:', err);
        const fallbackUrl = new URL(url.pathname, url.origin);
        fallbackUrl.searchParams.set('view', 'claims');
        return Response.redirect(fallbackUrl.href, 303);
      }
    })());
    return;
  }

  // For all normal requests, let default network handling proceed
});
