// 썸네일 생성: 위에서부터 시도하고, 성공하면 멈춘다. 사용자가 직접 지정한 이미지는 언제나 최우선이다.
//
// | 유형      | 1순위                         | 2순위                    | 최종 폴백  |
// | 링크      | og:image (서버)               | oEmbed·정해진 썸네일 URL | 절차적     |
// | 영상 파일 | 임의 시점 프레임              | 사용자가 시점 지정       | 절차적     |
// | 음악      | 내장 커버(ID3) / 스트리밍 oEmbed | 파형                  | 절차적     |
// | 사진      | 원본 축소본                   |                          |            |
// | 텍스트    | 절차적                        |                          |            |
import { Platform } from 'react-native';

import { api } from '@/api/client';
import { domainOf } from '@/core/classify';
import { parseId3Cover } from '@/core/id3';
import type { Item, ThumbnailSource } from '@/core/types';
import { files } from '@/store/db';
import { isLocalRef, refKey, resolveRef, toRef } from '@/store/refs';
import { store } from '@/store/store';

import { renderer } from './render';
import type { RenderedImage } from './render.types';

async function save(item: Item, img: RenderedImage): Promise<string> {
  // 썸네일이 바뀔 때마다 새 키를 쓴다(동기화가 파일 단위로 한 번만 올리기 때문)
  const key = `thumb_${item.id}_${Date.now().toString(36)}`;
  await files.put(key, img.data, img.mime);
  return toRef(key);
}

function proceduralText(item: Pick<Item, 'type' | 'content' | 'title' | 'sourceUrl' | 'fileName'>) {
  if (item.type === 'text') return item.content.slice(0, 200);
  return item.title ?? item.fileName ?? domainOf(item.sourceUrl) ?? '';
}

/** 저장 직후 바로 입힐 얼굴. 즉시, 무료로. */
export async function proceduralThumbnail(item: Item): Promise<string> {
  const img = await renderer.procedural({
    id: item.id,
    type: item.type,
    color: item.color,
    text: proceduralText(item),
    caption: item.type === 'text' ? null : domainOf(item.sourceUrl),
  });
  return save(item, img);
}

interface Found {
  img: RenderedImage;
  source: ThumbnailSource;
  title?: string | null;
}

async function fromLink(url: string): Promise<Found | null> {
  const meta = await api.meta(url).catch(() => null);
  if (!meta?.image) return null;
  const blob = await api.image(meta.image).catch(() => null);
  if (!blob) return null;
  const source = meta.imageSource ?? 'og';
  if (Platform.OS !== 'web') return { img: { data: blob, mime: blob.type }, source, title: meta.title };
  const local = URL.createObjectURL(blob);
  try {
    const img = await renderer.downscale(local);
    return img ? { img, source, title: meta.title } : null;
  } finally {
    URL.revokeObjectURL(local);
  }
}

async function fromFile(item: Item): Promise<Found | null> {
  const uri = await resolveRef(item.content);
  if (!uri) return null;
  if (item.type === 'image') {
    const img = await renderer.downscale(uri);
    return img && { img, source: 'original' };
  }
  if (item.type === 'video') {
    const img = await renderer.videoFrame(uri);
    return img && { img, source: 'frame' };
  }
  if (item.type === 'music') {
    const blob = isLocalRef(item.content) ? await files.blob(refKey(item.content)) : null;
    if (blob) {
      // ID3 태그는 파일 앞쪽에 있다
      const head = new Uint8Array(await blob.slice(0, 4 * 1024 * 1024).arrayBuffer());
      const cover = parseId3Cover(head);
      if (cover) return { img: { data: cover.data, mime: cover.mime }, source: 'id3' };
    }
    const img = await renderer.waveform(uri, item.color);
    return img && { img, source: 'waveform' };
  }
  return null;
}

/** 저장 뒤 백그라운드에서 더 나은 얼굴을 찾는다. 못 찾으면 절차적 썸네일이 그대로 남는다. */
export async function upgradeThumbnail(itemId: string): Promise<void> {
  const item = store.items.get(itemId);
  if (!item || item.thumbnailSource === 'user' || item.type === 'text') return;
  try {
    let found: Found | null = null;
    if (isLocalRef(item.content)) found = await fromFile(item);
    else if (item.sourceUrl) found = await fromLink(item.sourceUrl);
    if (!found) {
      // 링크 메타데이터에 제목만 있어도 절차적 썸네일에 찍을 글자가 생긴다
      if (item.sourceUrl && !item.title) {
        const meta = await api.meta(item.sourceUrl).catch(() => null);
        if (meta?.title) {
          store.updateItem(itemId, { title: meta.title });
          const fresh = store.items.get(itemId)!;
          store.updateItem(itemId, { thumbnail: await proceduralThumbnail(fresh), thumbnailSource: 'procedural' });
        }
      }
      return;
    }
    const latest = store.items.get(itemId);
    if (!latest || latest.thumbnailSource === 'user') return;
    store.updateItem(itemId, {
      thumbnail: await save(latest, found.img),
      thumbnailSource: found.source,
      ...(found.title && !latest.title ? { title: found.title } : {}),
    });
  } catch (e) {
    console.warn('[thumb] 업그레이드 실패', e);
  }
}

/** 사용자가 직접 고른 이미지. 언제나 최우선. */
export async function setUserThumbnail(itemId: string, uri: string) {
  const item = store.items.get(itemId);
  if (!item) return;
  const img = (await renderer.downscale(uri)) ?? { data: uri, mime: 'image/jpeg' };
  store.updateItem(itemId, { thumbnail: await save(item, img), thumbnailSource: 'user' });
}

/** 영상 2순위: 사용자가 시점 지정 */
export async function setVideoFrameThumbnail(itemId: string, seconds: number) {
  const item = store.items.get(itemId);
  const uri = item && (await resolveRef(item.content));
  if (!item || !uri) return;
  const img = await renderer.videoFrame(uri, seconds);
  if (img) store.updateItem(itemId, { thumbnail: await save(item, img), thumbnailSource: 'user' });
}
