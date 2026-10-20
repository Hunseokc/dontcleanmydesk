import type { Collection, Entity } from '@/core/types';

export interface DocStore {
  getAll<T>(col: Collection): Promise<T[]>;
  putMany(col: Collection, docs: Entity[]): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
}

export type FileData = Blob | Uint8Array | string;

export interface StoredFile {
  blob: Blob;
  mime: string;
}

/** 미디어 원본과 썸네일. 키는 `local:<key>` 참조의 <key> 부분이다. */
export interface FileStore {
  /** data 는 Blob, 바이트, 또는 data:/blob:/file: URI */
  put(key: string, data: FileData, mime: string): Promise<void>;
  has(key: string): Promise<boolean>;
  /** 화면에 바로 쓸 수 있는 URI. 없으면 null */
  url(key: string): Promise<string | null>;
  blob(key: string): Promise<Blob | null>;
}
