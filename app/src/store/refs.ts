// `local:<key>` 참조를 화면에서 쓸 수 있는 URI 로 바꾼다.
// 이 기기에 없으면(다른 기기에서 동기화된 아이템) 서버에서 받아 로컬에 캐시한다.
import { useEffect, useState } from 'react';

import { api } from '@/api/client';

import { files } from './db';
import { store } from './store';

export const LOCAL = 'local:';

export const isLocalRef = (ref: string | null | undefined): ref is string => !!ref && ref.startsWith(LOCAL);
export const refKey = (ref: string) => ref.slice(LOCAL.length);
export const toRef = (key: string) => LOCAL + key;

const inflight = new Map<string, Promise<string | null>>();

export function resolveRef(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return Promise.resolve(null);
  if (!isLocalRef(ref)) return Promise.resolve(ref);
  const key = refKey(ref);
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      const local = await files.url(key);
      if (local) return local;
      const token = store.settings.sync?.token;
      if (!token) return null;
      const blob = await api.downloadFile(token, key).catch(() => null);
      if (!blob) return null;
      await files.put(key, blob, blob.type);
      return files.url(key);
    })();
    inflight.set(key, p);
    p.finally(() => inflight.delete(key));
  }
  return p;
}

export function useResolved(ref: string | null | undefined): string | null {
  const [uri, setUri] = useState<string | null>(() => (ref && !isLocalRef(ref) ? ref : null));
  useEffect(() => {
    let alive = true;
    resolveRef(ref).then((u) => alive && setUri(u));
    return () => {
      alive = false;
    };
  }, [ref]);
  return uri;
}
