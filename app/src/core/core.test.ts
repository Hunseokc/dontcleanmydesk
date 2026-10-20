import { describe, expect, it } from 'vitest';

import { classifyFile, classifyText, classifyUrl, soleUrl, youtubeId } from './classify';
import { parseId3Cover } from './id3';
import { seededRng } from './random';
import { capacity, emptyRoom, itemWeight, pickIntruder, reconcileRoom, rummage, ROOM_TUNING, type DeskSize } from './room';
import type { Item } from './types';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const desk: DeskSize = { width: 1280, height: 800, cardW: 160, cardH: 180 };

function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id, binId: 'b', type: 'text', content: id, tags: [], color: '#fff',
    createdAt: NOW - 10 * DAY, updatedAt: NOW - 10 * DAY, lastSeenAt: null, seenCount: 0, ...over,
  };
}

describe('자동 분류', () => {
  it('MIME 로 판단한다', () => {
    expect(classifyFile('image/png')).toBe('image');
    expect(classifyFile('video/mp4')).toBe('video');
    expect(classifyFile('audio/mpeg')).toBe('music');
    expect(classifyFile('', 'song.flac')).toBe('music');
    expect(classifyFile('application/zip', 'a.zip')).toBeNull();
  });
  it('링크는 도메인으로 세분화한다', () => {
    expect(classifyUrl('https://www.youtube.com/watch?v=abc')).toBe('video');
    expect(classifyUrl('https://youtu.be/abc')).toBe('video');
    expect(classifyUrl('https://music.youtube.com/watch?v=abc')).toBe('music');
    expect(classifyUrl('https://open.spotify.com/track/1')).toBe('music');
    expect(classifyUrl('https://example.com/cat.jpg')).toBe('image');
    expect(classifyUrl('https://news.example.com/a')).toBe('link');
  });
  it('URL 하나뿐인 텍스트는 링크로, 섞여 있으면 글로', () => {
    expect(classifyText('https://vimeo.com/1')).toEqual({ type: 'video', sourceUrl: 'https://vimeo.com/1' });
    expect(classifyText('example.com/a').type).toBe('link');
    expect(classifyText('이거 보자 https://a.com').type).toBe('text');
    expect(soleUrl('그냥 글')).toBeNull();
    expect(youtubeId('https://www.youtube.com/shorts/XYZ')).toBe('XYZ');
  });
});

describe('가중치', () => {
  it('최근 것 > 오래된 것, 자주 본 것은 덜', () => {
    const fresh = item('a', { createdAt: NOW - DAY / 2 });
    const old = item('b', { createdAt: NOW - 60 * DAY, lastSeenAt: NOW - DAY });
    expect(itemWeight(fresh, NOW)).toBeGreaterThan(itemWeight(old, NOW));
    const seen = item('c', { seenCount: 12 });
    expect(itemWeight(seen, NOW)).toBeLessThan(itemWeight(item('d'), NOW));
  });
});

describe('어질러진 방', () => {
  const items = Array.from({ length: 40 }, (_, i) => item('i' + i));

  it('밀도는 화면 크기로 정해지고 8~15 사이다', () => {
    expect(capacity({ width: 360, height: 640, cardW: 110, cardH: 120 })).toBe(ROOM_TUNING.minCards);
    expect(capacity({ width: 3000, height: 2000, cardW: 150, cardH: 160 })).toBe(ROOM_TUNING.maxCards);
  });

  it('처음엔 용량만큼 채우고, 다시 들어오면 그대로 복원한다', () => {
    const rng = seededRng(1);
    const first = reconcileRoom(emptyRoom('b', NOW), items, desk, NOW, rng);
    const cap = capacity(desk);
    expect(first.room.placements).toHaveLength(cap);

    const again = reconcileRoom(first.room, items, desk, NOW + 60_000, seededRng(2));
    expect(again.entered).toEqual([]);
    expect(again.left).toEqual([]);
    expect(again.room.placements.map((p) => [p.itemId, p.x, p.y])).toEqual(
      first.room.placements.map((p) => [p.itemId, p.x, p.y]),
    );
  });

  it('새 아이디어는 맨 위에 쌓인다', () => {
    const first = reconcileRoom(emptyRoom('b', NOW), items, desk, NOW, seededRng(3)).room;
    const newOne = item('new', { createdAt: NOW + 1000 });
    const next = reconcileRoom(first, [...items, newOne], desk, NOW + 2000, seededRng(4));
    const top = next.room.placements.reduce((a, b) => (a.z > b.z ? a : b));
    expect(top.itemId).toBe('new');
    expect(next.room.placements).toHaveLength(capacity(desk));
  });

  it('오래 손 안 댄 것은 몇 개만 조용히 통으로 돌아가고 다른 것이 나와 있다', () => {
    const first = reconcileRoom(emptyRoom('b', NOW), items, desk, NOW, seededRng(5)).room;
    const later = NOW + 4 * DAY;
    const next = reconcileRoom(first, items, desk, later, seededRng(6));
    expect(next.left).toHaveLength(ROOM_TUNING.maxReturnPerVisit);
    expect(next.entered).toHaveLength(ROOM_TUNING.maxReturnPerVisit);
    expect(next.room.placements).toHaveLength(capacity(desk));
    for (const id of next.left) expect(next.entered).not.toContain(id);
  });

  it('삭제된 아이템은 책상에서 빠진다', () => {
    const first = reconcileRoom(emptyRoom('b', NOW), items, desk, NOW, seededRng(7)).room;
    const gone = first.placements[0].itemId;
    const after = items.map((i) => (i.id === gone ? { ...i, deletedAt: NOW } : i));
    const next = reconcileRoom(first, after, desk, NOW + 1, seededRng(8));
    expect(next.room.placements.some((p) => p.itemId === gone)).toBe(false);
  });

  it('뒤지기는 꺼낸 만큼 오래된 것을 치워 총량을 유지한다', () => {
    const first = reconcileRoom(emptyRoom('b', NOW), items, desk, NOW, seededRng(9)).room;
    const r = rummage(first, items, NOW + 10, seededRng(10), 2);
    expect(r.entered).toHaveLength(2);
    expect(r.left).toHaveLength(2);
    expect(r.room.placements).toHaveLength(first.placements.length);
  });

  it('침입자는 필터 밖에서 고른다', () => {
    const mixed = [...items, item('img', { type: 'image' })];
    const intruder = pickIntruder(mixed, (i) => i.type === 'text', new Set(), NOW, seededRng(11));
    expect(intruder?.id).toBe('img');
  });
});

describe('ID3 커버', () => {
  it('APIC 프레임에서 이미지를 꺼낸다', () => {
    const jpeg = [0xff, 0xd8, ...Array(30).fill(7)];
    const mime = [...'image/jpeg'].map((c) => c.charCodeAt(0));
    const body = [0, ...mime, 0, 3, 0, ...jpeg]; // enc, mime\0, type, desc\0, data
    const frame = [...'APIC'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, body.length, 0, 0], body);
    const size = frame.length;
    const tag = [0x49, 0x44, 0x33, 3, 0, 0, 0, 0, (size >> 7) & 0x7f, size & 0x7f, ...frame];
    const cover = parseId3Cover(new Uint8Array(tag));
    expect(cover?.mime).toBe('image/jpeg');
    expect(cover?.data.length).toBe(jpeg.length);
  });
});
