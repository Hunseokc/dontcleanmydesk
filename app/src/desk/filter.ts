// 보기 모드의 필터: 분류·태그로 특정 종류만 본다.
import type { Item, ItemType } from '@/core/types';

export interface DeskFilter {
  type?: ItemType;
  tag?: string;
}

export const filterKey = (f: DeskFilter | null) => (f ? `${f.type ?? ''}#${f.tag ?? ''}` : '');

export const matchesFilter = (f: DeskFilter | null) => (i: Item) =>
  !f || ((!f.type || i.type === f.type) && (!f.tag || i.tags.includes(f.tag)));
