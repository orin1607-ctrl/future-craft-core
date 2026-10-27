/**
 * "שתף לדליה" — Staging only. Registered by src/features/claims/shareInbox/registerShareTarget.ts
 * only when the build targets the Staging Supabase project.
 *
 * Android's share sheet POSTs the shared files to ./claims/share (manifest share_target).
 * Staging is a static host, so the POST is answered here: files are kept in this device's
 * IndexedDB and the browser is sent to the share page, which uploads them with the user's own
 * session. Nothing is sent anywhere from this worker. Every other request passes through untouched.
 *
 * DB_NAME / STORE / SHARE_PATH must match src/features/claims/shareInbox/shareStore.ts.
 */
const DB_NAME = 'dalia-share-inbox';
const STORE = 'batches';
const SHARE_PATH = 'claims/share';
const MAX_FILES = 30;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveBatch(batch) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(batch);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function sharePageUrl() {
  return new URL(SHARE_PATH, self.registration.scope);
}

async function receiveShare(request) {
  const target = sharePageUrl();
  try {
    const form = await request.formData();
    const files = form.getAll('files')
      .filter((f) => f && typeof f === 'object' && typeof f.size === 'number')
      .slice(0, MAX_FILES);
    const id = `S${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await saveBatch({
      id,
      createdAt: Date.now(),
      title: String(form.get('title') || ''),
      text: String(form.get('text') || ''),
      url: String(form.get('url') || ''),
      files: files.map((f) => ({ name: f.name || 'file', type: f.type || '', size: f.size, blob: f })),
    });
    target.searchParams.set('batch', id);
  } catch {
    target.searchParams.set('share_error', '1');
  }
  return Response.redirect(target.href, 303);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'POST') return;
  if (new URL(req.url).pathname !== sharePageUrl().pathname) return;
  event.respondWith(receiveShare(req));
});
