// 모바일 로컬 저장소: expo-sqlite(문서) + expo-file-system(파일). 웹은 db.web.ts 를 쓴다.
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import type { Collection } from '@/core/types';

import type { DocStore, FileStore } from './db.types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function open() {
  dbPromise ??= SQLite.openDatabaseAsync('messy-room.db').then(async (db) => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (col, id));
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, json TEXT NOT NULL);
    `);
    return db;
  });
  return dbPromise;
}

export const docs: DocStore = {
  async getAll<T>(col: Collection) {
    const db = await open();
    const rows = await db.getAllAsync<{ json: string }>('SELECT json FROM docs WHERE col = ?', [col]);
    return rows.map((r) => JSON.parse(r.json) as T);
  },
  async putMany(col, list) {
    const db = await open();
    await db.withTransactionAsync(async () => {
      for (const d of list) {
        await db.runAsync('INSERT OR REPLACE INTO docs (col, id, json) VALUES (?, ?, ?)', [col, d.id, JSON.stringify(d)]);
      }
    });
  },
  async getMeta<T>(key: string) {
    const db = await open();
    const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM meta WHERE key = ?', [key]);
    return row ? (JSON.parse(row.json) as T) : undefined;
  },
  async setMeta(key, value) {
    const db = await open();
    await db.runAsync('INSERT OR REPLACE INTO meta (key, json) VALUES (?, ?)', [key, JSON.stringify(value ?? null)]);
  },
};

const dir = () => {
  const d = new Directory(Paths.document, 'files');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};
const fileFor = (key: string) => new File(dir(), key.replace(/[^a-zA-Z0-9_.-]/g, '_'));

export const files: FileStore = {
  async put(key, data) {
    const target = fileFor(key);
    if (target.exists) target.delete();
    if (typeof data === 'string') {
      if (data.startsWith('file:')) await new File(data).copy(target);
      else await target.write(new Uint8Array(await (await fetch(data)).arrayBuffer()));
    } else if (data instanceof Uint8Array) {
      await target.write(data);
    } else {
      await target.write(new Uint8Array(await data.arrayBuffer()));
    }
  },
  async has(key) {
    return fileFor(key).exists;
  },
  async url(key) {
    const f = fileFor(key);
    return f.exists ? f.uri : null;
  },
  async blob(key) {
    const f = fileFor(key);
    return f.exists ? f : null;
  },
};
