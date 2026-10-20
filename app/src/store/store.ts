// 앱 상태. 메모리 캐시 + 로컬 저장소 write-through. 모든 변경은 updatedAt 을 올려 동기화 대상이 된다.
import { useSyncExternalStore } from 'react';

import { colorFor, newId } from '@/core/random';
import type { Bin, Collection, Entity, Item, RoomState } from '@/core/types';

import { docs } from './db';

export type Quality = 'auto' | 'high' | 'low';

export interface SyncSettings {
  accountId: string;
  token: string;
  code: string;
  cursor: number;
  lastPushAt: number;
  lastSyncAt: number | null;
  error: string | null;
}

export interface Settings {
  currentBinId: string;
  quality: Quality;
  sync: SyncSettings | null;
  /** 필터 중 침입자가 굴러 들어오는 간격(초) */
  intruderEverySec: number;
}

export type ItemDraft = Pick<Item, 'type' | 'content'> & Partial<Omit<Item, 'binId' | 'createdAt' | 'updatedAt'>>;

export interface RemoteChange {
  collection: Collection;
  doc: Entity;
}

type Listener = () => void;

class AppStore {
  ready = false;
  items = new Map<string, Item>();
  bins = new Map<string, Bin>();
  rooms = new Map<string, RoomState>();
  settings: Settings = { currentBinId: '', quality: 'auto', sync: null, intruderEverySec: 12 };
  private version = 0;
  private listeners = new Set<Listener>();
  private localListeners = new Set<Listener>();
  private initPromise: Promise<void> | null = null;

  init() {
    this.initPromise ??= this.load();
    return this.initPromise;
  }

  private async load() {
    const [items, bins, rooms, settings] = await Promise.all([
      docs.getAll<Item>('items'),
      docs.getAll<Bin>('bins'),
      docs.getAll<RoomState>('rooms'),
      docs.getMeta<Settings>('settings'),
    ]);
    items.forEach((i) => this.items.set(i.id, i));
    bins.forEach((b) => this.bins.set(b.id, b));
    rooms.forEach((r) => this.rooms.set(r.id, r));
    if (settings) this.settings = { ...this.settings, ...settings };
    if (!this.liveBins().length) {
      const now = Date.now();
      const bin: Bin = { id: newId(), name: '기본 통', themeId: 'afternoon', createdAt: now, updatedAt: now };
      this.bins.set(bin.id, bin);
      void docs.putMany('bins', [bin]);
    }
    if (!this.bins.get(this.settings.currentBinId) || this.bins.get(this.settings.currentBinId)?.deletedAt) {
      this.settings.currentBinId = this.liveBins()[0].id;
      void this.persistSettings();
    }
    this.ready = true;
    this.emit();
  }

  // ---------- 구독 ----------
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  /** 사용자가 로컬에서 바꾼 경우에만 불린다(동기화 트리거) */
  onLocalChange(l: Listener) {
    this.localListeners.add(l);
    return () => this.localListeners.delete(l);
  }
  private emit(local = false) {
    this.version++;
    this.listeners.forEach((l) => l());
    if (local) this.localListeners.forEach((l) => l());
  }

  // ---------- 조회 ----------
  liveBins() {
    return [...this.bins.values()].filter((b) => !b.deletedAt).sort((a, b) => a.createdAt - b.createdAt);
  }
  currentBin(): Bin {
    return this.bins.get(this.settings.currentBinId) ?? this.liveBins()[0];
  }
  binItems(binId = this.settings.currentBinId): Item[] {
    return [...this.items.values()].filter((i) => i.binId === binId && !i.deletedAt).sort((a, b) => b.createdAt - a.createdAt);
  }
  allTags(binId = this.settings.currentBinId): string[] {
    const count = new Map<string, number>();
    for (const i of this.binItems(binId)) for (const t of i.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }

  // ---------- 변경 ----------
  private write<T extends Entity>(col: Collection, map: Map<string, T>, docs_: T[]) {
    for (const d of docs_) map.set(d.id, d);
    docs.putMany(col, docs_).catch((e) => console.warn('[store] 저장 실패', e));
    this.emit(true);
  }

  addItem(draft: ItemDraft): Item {
    const now = Date.now();
    const id = draft.id ?? newId();
    const item: Item = {
      tags: [], lastSeenAt: null, seenCount: 0, color: colorFor(id), ...draft,
      id, binId: this.settings.currentBinId, createdAt: now, updatedAt: now,
    };
    this.write('items', this.items, [item]);
    return item;
  }

  updateItem(id: string, patch: Partial<Item>) {
    const cur = this.items.get(id);
    if (!cur) return;
    this.write('items', this.items, [{ ...cur, ...patch, id, updatedAt: Date.now() }]);
  }

  deleteItem(id: string) {
    this.updateItem(id, { deletedAt: Date.now() });
  }

  markSeen(ids: string[]) {
    const now = Date.now();
    const list = ids.map((id) => this.items.get(id)).filter((i): i is Item => !!i);
    if (!list.length) return;
    this.write('items', this.items, list.map((i) => ({ ...i, lastSeenAt: now, seenCount: i.seenCount + 1, updatedAt: now })));
  }

  addBin(name: string, themeId = 'afternoon'): Bin {
    const now = Date.now();
    const bin: Bin = { id: newId(), name, themeId, createdAt: now, updatedAt: now };
    this.write('bins', this.bins, [bin]);
    return bin;
  }

  updateBin(id: string, patch: Partial<Bin>) {
    const cur = this.bins.get(id);
    if (cur) this.write('bins', this.bins, [{ ...cur, ...patch, id, updatedAt: Date.now() }]);
  }

  saveRoom(room: RoomState) {
    this.write('rooms', this.rooms, [{ ...room, id: room.binId }]);
  }

  setCurrentBin(id: string) {
    this.setSettings({ currentBinId: id });
  }

  setSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    void this.persistSettings();
    this.emit();
  }

  private persistSettings() {
    return docs.setMeta('settings', this.settings);
  }

  // ---------- 동기화 ----------
  changedSince(ts: number): RemoteChange[] {
    const out: RemoteChange[] = [];
    const push = (collection: Collection, list: Iterable<Entity>) => {
      for (const doc of list) if (doc.updatedAt > ts) out.push({ collection, doc });
    };
    push('bins', this.bins.values());
    push('items', this.items.values());
    push('rooms', this.rooms.values());
    return out;
  }

  /** 마지막 쓰기 우선(LWW). 서버에서 온 변경은 updatedAt 을 건드리지 않는다. */
  applyRemote(changes: RemoteChange[]) {
    const byCol: Record<Collection, Entity[]> = { items: [], bins: [], rooms: [] };
    for (const { collection, doc } of changes) {
      const map = this.mapOf(collection);
      const cur = map.get(doc.id);
      if (!cur || doc.updatedAt > cur.updatedAt) {
        map.set(doc.id, doc as never);
        byCol[collection].push(doc);
      }
    }
    (Object.keys(byCol) as Collection[]).forEach((c) => byCol[c].length && docs.putMany(c, byCol[c]));
    if (changes.length) this.emit();
  }

  /**
   * 다른 기기의 계정에 연결한 직후: 이 기기에서 만든 빈 통은 치우고, 받아온 통 중 가장 찬 통을 연다.
   * (새 기기는 처음 켤 때 빈 "기본 통"을 하나 만들어 두기 때문)
   */
  adoptRemoteBins(localBinIds: Set<string>) {
    const remote = this.liveBins().filter((b) => !localBinIds.has(b.id));
    if (!remote.length) return;
    for (const id of localBinIds) if (!this.binItems(id).length) this.updateBin(id, { deletedAt: Date.now() });
    const fullest = remote.sort((a, b) => this.binItems(b.id).length - this.binItems(a.id).length)[0];
    this.setCurrentBin(fullest.id);
  }

  private mapOf(col: Collection): Map<string, Entity> {
    return col === 'items' ? this.items : col === 'bins' ? this.bins : this.rooms;
  }
}

export const store = new AppStore();

/** 스토어가 바뀔 때마다 다시 그린다. selector 는 매 렌더 호출되므로 가볍게 유지한다. */
export function useStore<T>(selector: (s: AppStore) => T): T {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return selector(store);
}
