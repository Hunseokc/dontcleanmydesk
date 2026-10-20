// 서버 동기화. 웹 저장소는 브라우저가 지울 수 있으므로 서버 백업이 사실상 필수다.
// 로컬 우선: 바뀐 것만 올리고(push), 커서 이후 서버 변경을 받아(pull) LWW 로 합친다.
import { api } from '@/api/client';
import { docs, files } from '@/store/db';
import { isLocalRef, refKey } from '@/store/refs';
import { store, type SyncSettings } from '@/store/store';

const UPLOADED_KEY = 'uploadedFiles';
let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function syncNow(): Promise<void> {
  running ??= run().finally(() => (running = null));
  return running;
}

async function run() {
  const s = store.settings.sync;
  if (!s) return;
  const startedAt = Date.now();
  try {
    const changes = store.changedSince(s.lastPushAt);
    await uploadFiles(s);
    const res = await api.sync(s.token, s.cursor, changes);
    store.applyRemote(res.changes);
    patch({ cursor: res.cursor, lastPushAt: startedAt, lastSyncAt: Date.now(), error: null });
  } catch (e) {
    patch({ error: e instanceof Error ? e.message : String(e) });
  }
}

/** 아이템이 참조하는 로컬 파일(원본·썸네일) 중 아직 안 올린 것을 올린다. */
async function uploadFiles(s: SyncSettings) {
  const uploaded = new Set((await docs.getMeta<string[]>(UPLOADED_KEY)) ?? []);
  const keys = new Set<string>();
  for (const i of store.items.values()) {
    if (i.deletedAt) continue;
    for (const ref of [i.content, i.thumbnail]) if (isLocalRef(ref)) keys.add(refKey(ref));
  }
  let changed = false;
  for (const key of keys) {
    if (uploaded.has(key)) continue;
    const blob = await files.blob(key);
    if (!blob) continue;
    await api.uploadFile(s.token, key, blob);
    uploaded.add(key);
    changed = true;
  }
  if (changed) await docs.setMeta(UPLOADED_KEY, [...uploaded]);
}

function patch(p: Partial<SyncSettings>) {
  const cur = store.settings.sync;
  if (cur) store.setSettings({ sync: { ...cur, ...p } });
}

/** 로컬 변경 3초 뒤, 그리고 1분마다 동기화한다. */
export function startAutoSync() {
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 3000);
  };
  const off = store.onLocalChange(schedule);
  const interval = setInterval(() => void syncNow(), 60_000);
  void syncNow();
  return () => {
    off();
    clearInterval(interval);
    if (timer) clearTimeout(timer);
  };
}

export async function enableSync(linkCode?: string) {
  const acc = linkCode ? await api.linkAccount(linkCode.trim()) : await api.createAccount();
  const localBins = new Set(store.liveBins().map((b) => b.id));
  store.setSettings({
    sync: { accountId: acc.accountId, token: acc.token, code: acc.code, cursor: 0, lastPushAt: 0, lastSyncAt: null, error: null },
  });
  await syncNow();
  if (store.settings.sync?.error) throw new Error(store.settings.sync.error);
  if (linkCode) store.adoptRemoteBins(localBins);
}

export function disableSync() {
  store.setSettings({ sync: null });
}
