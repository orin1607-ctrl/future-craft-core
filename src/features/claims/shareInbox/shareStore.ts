/**
 * Files shared to Dalia from the Android share sheet, kept on this device until they are saved.
 * Written by public/dalia-share-sw.js — DB_NAME / STORE / SHARE_PATH must match that file.
 */

export const DB_NAME = 'dalia-share-inbox';
export const STORE = 'batches';
export const SHARE_PATH = 'claims/share';
/** Batches older than this are dropped from the device without being uploaded. */
export const BATCH_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type SharedFile = { name: string; type: string; size: number; blob: Blob };

export type ShareBatch = {
  id: string;
  createdAt: number;
  title: string;
  text: string;
  url: string;
  files: SharedFile[];
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function isExpiredBatch(batch: Pick<ShareBatch, 'createdAt'>, now = Date.now()) {
  return !batch.createdAt || now - batch.createdAt > BATCH_MAX_AGE_MS;
}

/** All batches still waiting on this device, oldest first. Expired batches are deleted. */
export async function listShareBatches(): Promise<ShareBatch[]> {
  const all = (await withStore<ShareBatch[]>('readonly', (s) => s.getAll() as IDBRequest<ShareBatch[]>)) || [];
  const expired = all.filter((b) => isExpiredBatch(b));
  for (const b of expired) await deleteShareBatch(b.id);
  return all.filter((b) => !isExpiredBatch(b)).sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteShareBatch(id: string) {
  await withStore('readwrite', (s) => { s.delete(id); });
}
