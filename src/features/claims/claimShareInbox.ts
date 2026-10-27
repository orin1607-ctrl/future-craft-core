/**
 * claimShareInbox.ts
 * IndexedDB storage bridge for Web Share Target and desktop drag/clipboard incoming files.
 * Works both inside ServiceWorkerGlobalScope and Window context.
 */

export type SharedDocItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  receivedAt: string;
  title?: string;
  text?: string;
};

const DB_NAME = 'dalia_share_target_db';
const STORE_NAME = 'shared_incoming';
const DB_VERSION = 1;

export function openShareDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Stores a file in the shared inbox.
 */
export async function putSharedDoc(item: SharedDocItem): Promise<string> {
  const db = await openShareDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(item);
    req.onsuccess = () => resolve(item.id);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieves all pending shared documents.
 */
export async function getPendingSharedDocs(): Promise<SharedDocItem[]> {
  try {
    const db = await openShareDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as SharedDocItem[]);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[claimShareInbox] getPendingSharedDocs error', err);
    return [];
  }
}

/**
 * Removes a specific document from the inbox once processed.
 */
export async function removeSharedDoc(id: string): Promise<void> {
  try {
    const db = await openShareDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[claimShareInbox] removeSharedDoc error', err);
  }
}

/**
 * Clears all pending documents from the inbox.
 */
export async function clearShareInbox(): Promise<void> {
  try {
    const db = await openShareDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[claimShareInbox] clearShareInbox error', err);
  }
}

/**
 * Helper to convert a SharedDocItem into a standard File object.
 */
export function sharedItemToFile(item: SharedDocItem): File {
  const filename = item.name || 'carpart_tender.pdf';
  const type = item.type || (filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
  return new File([item.blob], filename, { type, lastModified: Date.now() });
}
