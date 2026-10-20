// 카드 크기와 히트 테스트. Skia 에 의존하지 않는다.
import { clamp } from '@/core/random';
import type { SkinKind } from '@/themes/types';

const ASPECT: Record<SkinKind, [number, number]> = {
  memo: [1, 1.05],
  polaroid: [0.9, 1.08],
  cassette: [1.3, 0.84],
  newspaper: [0.95, 1.15],
  film: [1.25, 0.86],
};

/** 화면 짧은 변에 비례한 카드 기준 크기 */
export const cardUnit = (w: number, h: number) => clamp(Math.min(w, h) * 0.24, 110, 180);

export function cardDims(skin: SkinKind, unit: number) {
  const [aw, ah] = ASPECT[skin];
  return { w: unit * aw, h: unit * ah };
}

export interface CardBox {
  x: number;
  y: number;
  rot: number;
  w: number;
  h: number;
  scale?: number;
}

export function hitTest(px: number, py: number, c: CardBox) {
  const dx = px - c.x;
  const dy = py - c.y;
  const cos = Math.cos(-c.rot);
  const sin = Math.sin(-c.rot);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const s = c.scale ?? 1;
  return Math.abs(lx) <= (c.w * s) / 2 && Math.abs(ly) <= (c.h * s) / 2;
}

/** 화면 밖 가장 가까운 변으로 나가는 좌표 */
export function exitPoint(x: number, y: number, w: number, h: number): [number, number] {
  const d = [x, w - x, y, h - y];
  const i = d.indexOf(Math.min(...d));
  return i === 0 ? [-w * 0.25, y] : i === 1 ? [w * 1.25, y] : i === 2 ? [x, -h * 0.3] : [x, h * 1.3];
}
