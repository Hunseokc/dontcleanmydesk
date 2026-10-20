// 결정적 랜덤과 해시. 절차적 썸네일·책상 얼룩·구김 시드가 모두 여기서 나온다.

export type Rng = () => number;

/** 문자열 → 32bit 해시 (FNV-1a) */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

export const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** 따뜻한 오후 책상에 어울리는 아이템 기본 색 */
const ITEM_PALETTE = [
  '#e8b04f', '#d9774b', '#c95f4a', '#a8794d', '#7f9a62', '#5f8f8a',
  '#6a7fa8', '#9b6fa0', '#d69a9a', '#c9b38a', '#8a6e4f', '#e2c46f',
];

export function colorFor(seed: string): string {
  return ITEM_PALETTE[hashString(seed) % ITEM_PALETTE.length];
}

export function hexToRgba(hex: string, alpha = 1): [number, number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}
