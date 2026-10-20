// Kotlin 서버 호출. 서버는 브라우저가 못 하는 일(외부 링크 메타데이터, CORS 없는 이미지)과 동기화만 맡는다.
import type { RemoteChange } from '@/store/store';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

export interface LinkMeta {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  image: string | null;
  /** 'og' | 'oembed' — 이미지를 어디서 찾았는지 */
  imageSource: 'og' | 'oembed' | null;
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API_URL + path, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.trim());
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  meta: (url: string) => request<LinkMeta>('/api/meta?url=' + encodeURIComponent(url)),

  /** 외부 이미지를 서버를 통해 받아온다(CORS 우회). */
  async image(url: string): Promise<Blob> {
    const res = await fetch(API_URL + '/api/image?url=' + encodeURIComponent(url));
    if (!res.ok) throw new Error('image ' + res.status);
    return res.blob();
  },

  createAccount: () => request<{ accountId: string; token: string; code: string }>('/api/accounts', { method: 'POST' }),

  linkAccount: (code: string) =>
    request<{ accountId: string; token: string; code: string }>('/api/accounts/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }),

  sync: (token: string, cursor: number, changes: RemoteChange[]) =>
    request<{ cursor: number; changes: RemoteChange[] }>(
      '/api/sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ cursor, changes }),
      },
      30_000,
    ),

  async uploadFile(token: string, key: string, blob: Blob) {
    const res = await fetch(API_URL + '/api/files/' + encodeURIComponent(key), {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    });
    if (!res.ok) throw new Error('upload ' + res.status);
  },

  async downloadFile(token: string, key: string): Promise<Blob | null> {
    const res = await fetch(API_URL + '/api/files/' + encodeURIComponent(key), { headers: { Authorization: 'Bearer ' + token } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('download ' + res.status);
    return res.blob();
  },
};
