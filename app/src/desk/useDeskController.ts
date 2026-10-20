// 책상 위 카드들의 상태와 움직임. 규칙(무엇이 어디 놓이는가)은 core/room.ts 가, 여기서는 연출만 맡는다.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { hashString, range } from '@/core/random';
import {
  capacity, emptyRoom, maxZ, movePlacement, pickIntruder, randomPlacement, reconcileRoom, rummage, weightedSample, itemWeight,
  type DeskSize,
} from '@/core/room';
import type { Placement, RoomState } from '@/core/types';
import { store } from '@/store/store';

import { filterKey, matchesFilter, type DeskFilter } from './filter';
import { exitPoint, hitTest } from './geometry';

export interface DeskCard {
  itemId: string;
  x: number;
  y: number;
  rot: number;
  tx: number;
  ty: number;
  trot: number;
  z: number;
  crumple: number;
  tCrumple: number;
  lift: number;
  tLift: number;
  scale: number;
  tScale: number;
  leaving: boolean;
  intruder: boolean;
  /** 셰이더 시드 — 카드마다 다른 구김 */
  seed: number;
}

type Entrance = 'none' | 'pour' | 'corner' | 'roll';

/** 책상 위에 놓인 종이는 살짝 구겨진 채로 있다 */
const RESTING_CRUMPLE = 0.6;
const MAX_INTRUDERS = 3;

interface Options {
  binId: string;
  width: number;
  height: number;
  unit: number;
  filter: DeskFilter | null;
  intruderEverySec: number;
  unfoldMs: number;
  dims: (itemId: string) => { w: number; h: number };
}

export function useDeskController(o: Options) {
  const cards = useRef<DeskCard[]>([]);
  const room = useRef<RoomState | null>(null);
  // 렌더용 스냅샷. cards(ref) 가 원본이고 애니메이션 프레임마다 여기로 복사한다.
  const [snapshot, setSnapshot] = useState<DeskCard[]>([]);
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const opts = useRef(o);
  useLayoutEffect(() => {
    opts.current = o;
  });

  const size: DeskSize = useMemo(() => ({ width: o.width, height: o.height, cardW: o.unit, cardH: o.unit * 1.05 }), [o.width, o.height, o.unit]);

  // ---------- 애니메이션 루프: 움직이는 동안만 돈다 ----------
  const step = useCallback(function step(t: number) {
    const dt = Math.min(48, t - last.current || 16);
    last.current = t;
    const k = 1 - Math.exp(-dt / 130);
    const kc = 1 - Math.exp(-dt / (opts.current.unfoldMs / 3.5));
    let moving = false;
    const next: DeskCard[] = [];
    for (const c of cards.current) {
      const n = { ...c };
      n.x += (n.tx - n.x) * k;
      n.y += (n.ty - n.y) * k;
      n.rot += (n.trot - n.rot) * k;
      n.crumple += (n.tCrumple - n.crumple) * kc;
      n.lift += (n.tLift - n.lift) * Math.min(1, k * 2);
      n.scale += (n.tScale - n.scale) * k;
      const settled =
        Math.abs(n.tx - n.x) < 0.3 && Math.abs(n.ty - n.y) < 0.3 && Math.abs(n.trot - n.rot) < 0.002 &&
        Math.abs(n.tCrumple - n.crumple) < 0.003 && Math.abs(n.tLift - n.lift) < 0.01 && Math.abs(n.tScale - n.scale) < 0.003;
      if (settled) {
        if (n.leaving) continue;
        Object.assign(n, { x: n.tx, y: n.ty, rot: n.trot, crumple: n.tCrumple, lift: n.tLift, scale: n.tScale });
      } else moving = true;
      next.push(n);
    }
    cards.current = next;
    setSnapshot(next);
    raf.current = moving ? requestAnimationFrame(step) : null;
  }, []);

  const kick = useCallback(() => {
    if (raf.current == null) {
      last.current = performance.now();
      raf.current = requestAnimationFrame(step);
    }
  }, [step]);

  useEffect(() => () => void (raf.current != null && cancelAnimationFrame(raf.current)), []);

  const makeCard = useCallback(
    (p: Placement, from: Entrance, intruder = false): DeskCard => {
      const { width: w, height: h, unit } = opts.current;
      const tx = p.x * w;
      const ty = p.y * h;
      const c: DeskCard = {
        itemId: p.itemId, x: tx, y: ty, rot: p.rotation, tx, ty, trot: p.rotation, z: p.z,
        crumple: RESTING_CRUMPLE, tCrumple: RESTING_CRUMPLE, lift: 0, tLift: 0, scale: 1, tScale: 1,
        leaving: false, intruder, seed: (hashString(p.itemId) % 997) + 1,
      };
      if (from === 'pour') {
        // 통에서 쏟아진다: 구겨진 공이 떨어지며 펴진다
        Object.assign(c, { x: w / 2 + range(Math.random, -unit, unit), y: -unit * 0.8, rot: p.rotation + range(Math.random, -3, 3), crumple: 1, scale: 0.4 });
      } else if (from === 'corner') {
        Object.assign(c, { x: w + unit * 0.6, y: h + unit * 0.6, rot: p.rotation - 1.2, crumple: 0.9 });
      } else if (from === 'roll') {
        // 화면 밖에서 굴러 들어온다
        const left = Math.random() < 0.5;
        Object.assign(c, { x: left ? -unit * 1.2 : w + unit * 1.2, y: ty + range(Math.random, -60, 60), rot: p.rotation + (left ? -1 : 1) * Math.PI * 4, crumple: 1, scale: 0.55 });
      }
      return c;
    },
    [],
  );

  const sendOff = useCallback((ids: Iterable<string>) => {
    const set = new Set(ids);
    const { width: w, height: h } = opts.current;
    cards.current = cards.current.map((c) => {
      if (!set.has(c.itemId)) return c;
      const [ex, ey] = exitPoint(c.x, c.y, w, h);
      return { ...c, tx: ex, ty: ey, trot: c.rot + range(Math.random, -2, 2), tCrumple: 1, tScale: 0.5, leaving: true };
    });
  }, []);

  // ---------- 방에 들어오기 ----------
  const fKey = filterKey(o.filter);
  useEffect(() => {
    if (o.width < 10) return;
    const now = Date.now();
    const items = store.binItems(o.binId);
    const base = store.rooms.get(o.binId) ?? emptyRoom(o.binId, now);
    const prevIds = new Set(cards.current.filter((c) => !c.leaving).map((c) => c.itemId));

    if (!o.filter) {
      const res = reconcileRoom(base, items, size, now, Math.random);
      room.current = res.room;
      store.saveRoom(res.room);
      store.markSeen(res.entered);
      const entered = new Set(res.entered);
      const keep = new Set(res.room.placements.map((p) => p.itemId));
      sendOff([...prevIds].filter((id) => !keep.has(id)));
      const leaving = cards.current.filter((c) => c.leaving);
      cards.current = [
        ...leaving,
        ...res.room.placements.map((p) => {
          const existing = cards.current.find((c) => c.itemId === p.itemId && !c.leaving);
          if (existing) return { ...existing, tx: p.x * o.width, ty: p.y * o.height, trot: p.rotation, z: p.z, intruder: false };
          // 처음 들어올 땐 지난 배치는 그 자리에, 새로 나온 것은 통에서 쏟아진다. 필터를 풀 때 돌아오는 것은 굴러 들어온다.
          return makeCard(p, entered.has(p.itemId) ? 'pour' : prevIds.size === 0 ? 'none' : 'roll');
        }),
      ];
    } else {
      // 필터: 같은 방에서 맞는 것만 남기고 맞는 것들로 채운다. 이 배치는 임시라 저장하지 않는다.
      room.current = base;
      const match = matchesFilter(o.filter);
      const matched = items.filter(match);
      const keep = base.placements.filter((p) => matched.some((i) => i.id === p.itemId));
      const placed = new Set(keep.map((p) => p.itemId));
      const fill = weightedSample(matched.filter((i) => !placed.has(i.id)), capacity(size) - keep.length, (i) => itemWeight(i, now), Math.random);
      let z = maxZ(keep);
      const fillPlacements = fill.map((i) => randomPlacement(i.id, ++z, now, Math.random));
      store.markSeen(fill.map((i) => i.id));
      const all = [...keep, ...fillPlacements];
      const ids = new Set(all.map((p) => p.itemId));
      sendOff([...prevIds].filter((id) => !ids.has(id)));
      const leaving = cards.current.filter((c) => c.leaving);
      cards.current = [
        ...leaving,
        ...all.map((p) => {
          const existing = cards.current.find((c) => c.itemId === p.itemId && !c.leaving);
          if (existing) return { ...existing, intruder: false };
          return makeCard(p, placed.has(p.itemId) && prevIds.size === 0 ? 'none' : 'roll');
        }),
      ];
    }
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.binId, fKey, o.width > 10, size]);

  // ---------- 침입자: 필터 중에도 N초마다 다른 분류의 물건 하나가 굴러 들어온다 ----------
  useEffect(() => {
    if (!o.filter) return;
    const timer = setInterval(() => {
      const items = store.binItems(o.binId);
      const onDesk = new Set(cards.current.map((c) => c.itemId));
      const it = pickIntruder(items, matchesFilter(opts.current.filter), onDesk, Date.now(), Math.random);
      if (!it) return;
      const intruders = cards.current.filter((c) => c.intruder && !c.leaving);
      if (intruders.length >= MAX_INTRUDERS) sendOff([intruders[0].itemId]);
      const p = randomPlacement(it.id, maxZ(cards.current.map(toPlacement)) + 1, Date.now(), Math.random);
      p.x = range(Math.random, 0.15, 0.85);
      p.y = range(Math.random, 0.25, 0.85);
      cards.current = [...cards.current, makeCard(p, 'roll', true)];
      store.markSeen([it.id]);
      kick();
    }, Math.max(3, o.intruderEverySec) * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fKey, o.binId, o.intruderEverySec]);

  // ---------- 다른 곳에서 삭제된 아이템은 책상에서 치운다 ----------
  useEffect(() => {
    const off = store.subscribe(() => {
        const gone = cards.current.filter((c) => !c.leaving && (store.items.get(c.itemId)?.deletedAt || !store.items.get(c.itemId)));
        if (gone.length) {
          sendOff(gone.map((c) => c.itemId));
          kick();
        }
      });
    return () => void off();
  }, [sendOff, kick]);

  // ---------- 상호작용 ----------
  const sorted = useMemo(() => [...snapshot].sort((a, b) => a.z - b.z), [snapshot]);

  const hitTestAt = useCallback((px: number, py: number): string | null => {
    const list = [...cards.current].filter((c) => !c.leaving).sort((a, b) => b.z - a.z);
    for (const c of list) {
      const d = opts.current.dims(c.itemId);
      if (hitTest(px, py, { x: c.x, y: c.y, rot: c.rot, w: d.w, h: d.h, scale: c.scale })) return c.itemId;
    }
    return null;
  }, []);

  const update = useCallback(
    (id: string, patch: (c: DeskCard) => Partial<DeskCard>) => {
      cards.current = cards.current.map((c) => (c.itemId === id && !c.leaving ? { ...c, ...patch(c) } : c));
      kick();
    },
    [kick],
  );

  const cardOf = (id: string) => cards.current.find((c) => c.itemId === id && !c.leaving);

  const beginDrag = useCallback((id: string) => {
    const top = Math.max(0, ...cards.current.map((c) => c.z)) + 1;
    update(id, () => ({ z: top, tLift: 1, tScale: 1.04 }));
  }, [update]);

  const dragTo = useCallback((id: string, x: number, y: number) => {
    update(id, () => ({ x, y, tx: x, ty: y }));
  }, [update]);

  const endDrag = useCallback(
    (id: string, moved: boolean) => {
      update(id, () => ({ tLift: 0, tScale: 1 }));
      const c = cardOf(id);
      const r = room.current;
      if (!moved || !c || !r || !r.placements.some((p) => p.itemId === id)) return;
      room.current = movePlacement(r, id, c.tx / opts.current.width, c.ty / opts.current.height, c.trot, Date.now());
      store.saveRoom(room.current);
    },
    [update],
  );

  const unfold = useCallback(
    (id: string) =>
      new Promise<void>((resolve) => {
        update(id, () => ({ tCrumple: 0, tLift: 0.5 }));
        setTimeout(resolve, opts.current.unfoldMs);
      }),
    [update],
  );

  /** 한 번 펴 본 종이는 덜 구겨진 채로 돌아간다 */
  const refold = useCallback((id: string) => update(id, () => ({ tCrumple: 0.22, tLift: 0 })), [update]);

  const rummageNow = useCallback(() => {
    const now = Date.now();
    const items = store.binItems(opts.current.binId);
    if (!opts.current.filter && room.current) {
      const r = rummage(room.current, items, now, Math.random);
      if (!r.entered.length) return false;
      room.current = r.room;
      store.saveRoom(r.room);
      store.markSeen(r.entered);
      sendOff(r.left);
      const entered = new Set(r.entered);
      cards.current = [...cards.current, ...r.room.placements.filter((p) => entered.has(p.itemId)).map((p) => makeCard(p, 'corner'))];
    } else {
      const match = matchesFilter(opts.current.filter);
      const onDesk = new Set(cards.current.map((c) => c.itemId));
      const pick = weightedSample(items.filter((i) => match(i) && !onDesk.has(i.id)), 1, (i) => itemWeight(i, now, 3), Math.random)[0];
      if (!pick) return false;
      const oldest = [...cards.current].filter((c) => !c.leaving).sort((a, b) => a.z - b.z)[0];
      if (oldest) sendOff([oldest.itemId]);
      const p = randomPlacement(pick.id, maxZ(cards.current.map(toPlacement)) + 1, now, Math.random);
      p.x = range(Math.random, 0.55, 0.85);
      p.y = range(Math.random, 0.55, 0.85);
      cards.current = [...cards.current, makeCard(p, 'corner')];
      store.markSeen([pick.id]);
    }
    kick();
    return true;
  }, [kick, makeCard, sendOff]);

  /** 상세에서 "통으로 돌려보내기" */
  const sendBack = useCallback(
    (id: string) => {
      sendOff([id]);
      const r = room.current;
      if (r && r.placements.some((p) => p.itemId === id)) {
        room.current = { ...r, placements: r.placements.filter((p) => p.itemId !== id), updatedAt: Date.now() };
        store.saveRoom(room.current);
      }
      kick();
    },
    [kick, sendOff],
  );

  return { cards: sorted, hitTestAt, cardOf, beginDrag, dragTo, endDrag, unfold, refold, rummageNow, sendBack };
}

function toPlacement(c: DeskCard): Placement {
  return { itemId: c.itemId, x: 0, y: 0, rotation: c.rot, z: c.z, placedAt: 0 };
}

