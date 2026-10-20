// 어질러진 방 규칙. 렌더링과 무관한 순수 로직이라 테스트로 검증한다.
//  1. 밀도 제한   2. 가중치 랜덤   3. 상태 유지   4. 자연 순환   5. 겹침과 묻힘   6. 뒤지기
import { clamp, range, type Rng } from './random';
import type { Item, Placement, RoomState } from './types';

const DAY = 86_400_000;

export const ROOM_TUNING = {
  minCards: 8,
  maxCards: 15,
  /** 한 장이 차지하는 면적 대비 여유 배수. 클수록 듬성듬성하다. */
  spacing: 2.4,
  /** 이만큼 손 안 대면 가장자리·아래로 밀리기 시작한다 */
  driftAfter: 1 * DAY,
  /** 이만큼 손 안 대면 통으로 돌아갈 후보가 된다 */
  returnAfter: 3 * DAY,
  /** 한 번 들어올 때 조용히 돌아가는 최대 개수 */
  maxReturnPerVisit: 2,
  /** 가장자리에서 반쯤 잘리게 둘 확률 */
  edgeChance: 0.22,
};

export interface DeskSize {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
}

/** 고정 개수가 아니라 화면 크기와 카드 크기로 정한다. */
export function capacity(size: DeskSize): number {
  const ratio = (size.width * size.height) / (size.cardW * size.cardH * ROOM_TUNING.spacing);
  return Math.round(clamp(ratio, ROOM_TUNING.minCards, ROOM_TUNING.maxCards));
}

/**
 * 최근 것은 잘 나오고, 오래 안 본 것은 가끔 재등장하고, 자주 본 것은 점점 덜 나온다.
 * `forgottenBias` 를 키우면 오래 묻혀 있던 것 쪽으로 기운다(뒤지기·침입자).
 */
export function itemWeight(item: Item, now: number, forgottenBias = 1): number {
  const age = Math.max(0, now - item.createdAt) / DAY;
  const sinceSeen = item.lastSeenAt == null ? age : Math.max(0, now - item.lastSeenAt) / DAY;
  const fresh = 3 * Math.exp(-age / 3);
  const forgotten = 1.5 * forgottenBias * Math.min(1, sinceSeen / 21);
  const fatigue = 1 / (1 + 0.25 * item.seenCount);
  return (0.4 + fresh + forgotten) * fatigue;
}

/** 가중치 비복원 추출 */
export function weightedSample<T>(pool: T[], k: number, weight: (t: T) => number, rng: Rng): T[] {
  const rest = pool.map((t) => ({ t, w: Math.max(1e-6, weight(t)) }));
  const out: T[] = [];
  while (out.length < k && rest.length) {
    const total = rest.reduce((s, r) => s + r.w, 0);
    let roll = rng() * total;
    let i = 0;
    for (; i < rest.length - 1; i++) {
      roll -= rest[i].w;
      if (roll <= 0) break;
    }
    out.push(rest[i].t);
    rest.splice(i, 1);
  }
  return out;
}

export function maxZ(placements: Placement[]) {
  return placements.reduce((m, p) => Math.max(m, p.z), 0);
}

/** 기울어지고 겹치게 흩뿌린다. 일부는 가장자리에서 반쯤 잘린다. */
export function randomPlacement(itemId: string, z: number, now: number, rng: Rng, nearCenter = false): Placement {
  let x: number;
  let y: number;
  if (nearCenter) {
    x = range(rng, 0.3, 0.7);
    y = range(rng, 0.3, 0.7);
  } else if (rng() < ROOM_TUNING.edgeChance) {
    // 네 변 중 하나에 걸치게
    const side = Math.floor(rng() * 4);
    const along = range(rng, 0.1, 0.9);
    const out = range(rng, -0.03, 0.04);
    [x, y] = side === 0 ? [out, along] : side === 1 ? [1 - out, along] : side === 2 ? [along, out] : [along, 1 - out];
  } else {
    x = range(rng, 0.1, 0.9);
    y = range(rng, 0.14, 0.88);
  }
  const rotation = range(rng, -0.45, 0.45);
  return { itemId, x, y, rotation, z, placedAt: now };
}

export interface ReconcileResult {
  room: RoomState;
  /** 이번에 새로 책상에 나온 아이템 */
  entered: string[];
  /** 이번에 조용히 통으로 돌아간 아이템 */
  left: string[];
}

/**
 * 방에 들어올 때 호출한다. 새로 섞지 않는다.
 * 지난 배치를 복원하고, 새 아이디어는 그 위에 쌓고, 오래 손 안 댄 것은 밀어내거나 통으로 돌려보낸다.
 */
export function reconcileRoom(
  prev: RoomState,
  items: Item[],
  size: DeskSize,
  now: number,
  rng: Rng,
  tuning = ROOM_TUNING,
): ReconcileResult {
  const alive = new Map(items.filter((i) => !i.deletedAt && i.binId === prev.binId).map((i) => [i.id, i]));
  let placements = prev.placements.filter((p) => alive.has(p.itemId)).map((p) => ({ ...p }));
  const cap = capacity(size);
  const left: string[] = [];
  const entered: string[] = [];
  const elapsed = Math.max(0, now - prev.updatedAt);

  // 4. 자연 순환 — 밀려나기: 손 안 댄 시간만큼 바깥으로, 아래로
  const idle = (p: Placement) => now - p.placedAt > tuning.driftAfter;
  const drift = clamp(elapsed / (tuning.returnAfter - tuning.driftAfter), 0, 0.35);
  for (const p of placements) {
    if (!idle(p) || drift === 0) continue;
    p.x = clamp(p.x + (p.x - 0.5) * drift, -0.06, 1.06);
    p.y = clamp(p.y + (p.y - 0.5) * drift, -0.06, 1.06);
  }
  // 손 안 댄 것은 아래로 깔리고, 만진 것은 위에 남는다(상대 순서는 유지)
  placements.sort((a, b) => Number(idle(b)) - Number(idle(a)) || a.z - b.z);
  placements.forEach((p, i) => (p.z = i + 1));

  // 4. 자연 순환 — 돌아가기: 아주 오래된 것 몇 개만 조용히 통으로
  const stale = placements
    .filter((p) => now - p.placedAt > tuning.returnAfter)
    .sort((a, b) => a.placedAt - b.placedAt)
    .slice(0, tuning.maxReturnPerVisit);
  if (stale.length) {
    const ids = new Set(stale.map((p) => p.itemId));
    placements = placements.filter((p) => !ids.has(p.itemId));
    left.push(...ids);
  }

  // 3. 상태 유지 — 지난번 이후 새로 들어온 것은 맨 위에 쌓는다
  const placed = new Set(placements.map((p) => p.itemId));
  const fresh = [...alive.values()]
    .filter((i) => !placed.has(i.id) && i.createdAt > prev.updatedAt)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-cap);
  for (const it of fresh) {
    placements.push(randomPlacement(it.id, maxZ(placements) + 1, now, rng, placements.length > 0));
    placed.add(it.id);
    entered.push(it.id);
  }

  // 1. 밀도 제한 — 넘치면 가장 아래 깔린 것부터 통으로
  while (placements.length > cap) {
    const bottom = placements.reduce((a, b) => (a.z <= b.z ? a : b));
    placements = placements.filter((p) => p !== bottom);
    left.push(bottom.itemId);
    placed.delete(bottom.itemId);
  }

  // 2. 가중치 랜덤 — 빈자리를 채운다. 방금 돌아간 것은 이번엔 다시 나오지 않는다.
  const returned = new Set(left);
  const pool = [...alive.values()].filter((i) => !placed.has(i.id) && !returned.has(i.id));
  const picks = weightedSample(pool, cap - placements.length, (i) => itemWeight(i, now), rng);
  for (const it of picks) {
    // 채워 넣는 것은 기존 것 아래로 깔릴 수도 있다(5. 겹침과 묻힘)
    const z = rng() < 0.35 ? 0.5 : maxZ(placements) + 1;
    placements.push(randomPlacement(it.id, z, now, rng));
    entered.push(it.id);
  }
  placements.sort((a, b) => a.z - b.z).forEach((p, i) => (p.z = i + 1));

  return { room: { ...prev, placements, updatedAt: now }, entered, left };
}

export interface RummageResult {
  room: RoomState;
  entered: string[];
  left: string[];
}

/** 6. 뒤지기 — 한두 개씩만 더 꺼낸다. 꺼낸 만큼 가장 오래 놓여 있던 것이 사라져 총량을 유지한다. */
export function rummage(prev: RoomState, items: Item[], now: number, rng: Rng, count = rng() < 0.5 ? 1 : 2): RummageResult {
  const placed = new Set(prev.placements.map((p) => p.itemId));
  const pool = items.filter((i) => !i.deletedAt && i.binId === prev.binId && !placed.has(i.id));
  const picks = weightedSample(pool, count, (i) => itemWeight(i, now, 3), rng);
  if (!picks.length) return { room: prev, entered: [], left: [] };

  const oldest = [...prev.placements].sort((a, b) => a.placedAt - b.placedAt || a.z - b.z).slice(0, picks.length);
  const leftIds = new Set(oldest.map((p) => p.itemId));
  const placements = prev.placements.filter((p) => !leftIds.has(p.itemId));
  for (const it of picks) {
    const p = randomPlacement(it.id, maxZ(placements) + 1, now, rng);
    // 구석에서 끌려 나왔으니 오른쪽 아래 쪽에 놓인다
    p.x = range(rng, 0.55, 0.85);
    p.y = range(rng, 0.55, 0.85);
    placements.push(p);
  }
  return { room: { ...prev, placements, updatedAt: now }, entered: picks.map((i) => i.id), left: [...leftIds] };
}

/** 필터 중 화면 밖에서 굴러 들어올 침입자. 필터 밖, 책상 밖, 오래 안 본 것에 가중치. */
export function pickIntruder(items: Item[], matches: (i: Item) => boolean, onDesk: Set<string>, now: number, rng: Rng): Item | null {
  const pool = items.filter((i) => !i.deletedAt && !matches(i) && !onDesk.has(i.id));
  return weightedSample(pool, 1, (i) => itemWeight(i, now, 4), rng)[0] ?? null;
}

/** 끌어서 놓은 자리. 놓인 것은 맨 위로 올라오고 placedAt 이 갱신된다. */
export function movePlacement(room: RoomState, itemId: string, x: number, y: number, rotation: number, now: number): RoomState {
  const top = maxZ(room.placements) + 1;
  const placements = room.placements.map((p) =>
    p.itemId === itemId ? { ...p, x, y, rotation, z: top, placedAt: now } : p,
  );
  return { ...room, placements, updatedAt: now };
}

export function emptyRoom(binId: string, now: number): RoomState {
  // updatedAt 0 이면 처음 들어올 때 통 안의 것이 모두 "새것"으로 보이므로, 가중치 추출로 채우도록 now 를 쓴다
  return { id: binId, binId, placements: [], updatedAt: now };
}
