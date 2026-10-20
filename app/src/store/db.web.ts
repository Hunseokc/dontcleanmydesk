// 웹 로컬 저장소: IndexedDB. 엔티티(JSON 문서)와 파일(Blob)을 같은 DB 에 둔다.
import type { Collection } from '@/core/types';

import type { DocStore, FileStore, StoredFile } from './db.types';

const DB_NAME = 'messy-room';
const STORES = ['items', 'bins', 'rooms', 'meta', 'files'] as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // 브라우저가 로컬 데이터를 지우지 않도록 요청한다(거절돼도 서버 동기화가 백업이다)
  navigator.storage?.persist?.().catch(() => {});
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const docs: DocStore = {
  getAll: <T,>(col: Collection) => tx<T[]>(col, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  putMany: async (col, list) => {
    if (!list.length) return;
    await tx(col, 'readwrite', (s) => {
      for (const d of list) s.put(d, d.id);
    });
  },
  getMeta: <T,>(key: string) => tx<T | undefined>('meta', 'readonly', (s) => s.get(key)),
  setMeta: async (key, value) => {
    await tx('meta', 'readwrite', (s) => s.put(value, key));
  },
};

const urlCache = new Map<string, string>();

export const files: FileStore = {
  async put(key, data, mime) {
    const blob =
      typeof data === 'string' ? await (await fetch(data)).blob() : data instanceof Uint8Array ? new Blob([data as Uint8Array<ArrayBuffer>]) : data;
    const stored: StoredFile = { blob: new Blob([blob], { type: mime || blob.type }), mime: mime || blob.type };
    await tx('files', 'readwrite', (s) => s.put(stored, key));
    const old = urlCache.get(key);
    if (old) URL.revokeObjectURL(old);
    urlCache.delete(key);
  },
  async has(key) {
    return (await tx<IDBValidKey | undefined>('files', 'readonly', (s) => s.getKey(key))) !== undefined;
  },
  async url(key) {
    const hit = urlCache.get(key);
    if (hit) return hit;
    const f = await tx<StoredFile | undefined>('files', 'readonly', (s) => s.get(key));
    if (!f) return null;
    const url = URL.createObjectURL(f.blob);
    urlCache.set(key, url);
    return url;
  },
  async blob(key) {
    const f = await tx<StoredFile | undefined>('files', 'readonly', (s) => s.get(key));
    return f?.blob ?? null;
  },
};
