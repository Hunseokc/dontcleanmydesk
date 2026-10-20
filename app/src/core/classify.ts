// 자동 분류: MIME 타입과 URL 패턴만으로 판단한다. AI 불필요.
import type { ItemType } from './types';

const VIDEO_HOSTS = [
  'youtube.com', 'youtu.be', 'vimeo.com', 'tiktok.com', 'twitch.tv', 'dailymotion.com',
  'tv.naver.com', 'chzzk.naver.com',
];
const MUSIC_HOSTS = [
  'open.spotify.com', 'spotify.com', 'music.apple.com', 'soundcloud.com', 'music.youtube.com',
  'melon.com', 'genie.co.kr', 'bandcamp.com', 'vibe.naver.com', 'flo.music',
];

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|heic|bmp|svg)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|ogv)(\?.*)?$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus)(\?.*)?$/i;

export function classifyFile(mime: string | null | undefined, name?: string | null): ItemType | null {
  const m = (mime ?? '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'music';
  if (m.startsWith('text/plain')) return 'text';
  if (name) {
    if (IMAGE_EXT.test(name)) return 'image';
    if (VIDEO_EXT.test(name)) return 'video';
    if (AUDIO_EXT.test(name)) return 'music';
  }
  return null;
}

function hostMatches(host: string, list: string[]) {
  return list.some((h) => host === h || host.endsWith('.' + h));
}

export function classifyUrl(url: string): ItemType {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'link';
  }
  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  // music.youtube.com 은 youtube.com 보다 먼저 봐야 한다
  if (hostMatches(host, MUSIC_HOSTS)) return 'music';
  if (hostMatches(host, VIDEO_HOSTS)) return 'video';
  if (IMAGE_EXT.test(u.pathname)) return 'image';
  if (VIDEO_EXT.test(u.pathname)) return 'video';
  if (AUDIO_EXT.test(u.pathname)) return 'music';
  return 'link';
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** 텍스트가 사실상 URL 하나뿐이면 그 URL 을 돌려준다. */
export function soleUrl(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) return 'https://' + t;
  return null;
}

export function firstUrl(text: string): string | null {
  return text.match(URL_RE)?.[0] ?? null;
}

export interface TextClassification {
  type: ItemType;
  sourceUrl: string | null;
}

export function classifyText(text: string): TextClassification {
  const url = soleUrl(text);
  if (url) return { type: classifyUrl(url), sourceUrl: url };
  return { type: 'text', sourceUrl: firstUrl(text) };
}

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host.endsWith('youtube.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}
