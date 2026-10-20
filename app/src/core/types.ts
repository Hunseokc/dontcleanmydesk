// 데이터 모델. 개발 초안의 "데이터 모델" 절을 그대로 옮긴다.
// 동기화를 위해 모든 엔티티는 updatedAt 과 소프트 삭제(deletedAt)를 가진다.

export type ItemType = 'text' | 'image' | 'video' | 'music' | 'link';

export const ITEM_TYPES: ItemType[] = ['text', 'image', 'video', 'music', 'link'];

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  text: '글',
  image: '사진',
  video: '영상',
  music: '음악',
  link: '링크',
};

/** 썸네일이 어디서 왔는지. 'user' 는 언제나 최우선이라 자동 생성이 덮어쓰지 않는다. */
export type ThumbnailSource =
  | 'user'
  | 'og'
  | 'oembed'
  | 'frame'
  | 'id3'
  | 'waveform'
  | 'original'
  | 'procedural';

export interface Entity {
  id: string;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface Item extends Entity {
  binId: string;
  type: ItemType;
  /** 텍스트 본문, 또는 파일 참조(`local:<key>`), 또는 URL */
  content: string;
  mime?: string | null;
  fileName?: string | null;
  title?: string | null;
  sourceUrl?: string | null;
  /** 깨끗한 원본 썸네일 참조(`local:<key>`). 구김은 테마가 렌더링 시점에 입힌다. */
  thumbnail?: string | null;
  thumbnailSource?: ThumbnailSource | null;
  tags: string[];
  color: string;
  createdAt: number;
  lastSeenAt: number | null;
  seenCount: number;
}

export interface Bin extends Entity {
  name: string;
  themeId: string;
  createdAt: number;
}

/** 책상 위 한 장의 자리. x, y 는 책상 크기에 대한 0..1 비율(가장자리 밖으로 살짝 나갈 수 있음). */
export interface Placement {
  itemId: string;
  x: number;
  y: number;
  /** 라디안 */
  rotation: number;
  z: number;
  /** 마지막으로 이 자리에 놓인 시각. 끌어서 옮기면 갱신된다. */
  placedAt: number;
}

/** 지난번 책상 배치. id 는 binId 와 같다. */
export interface RoomState extends Entity {
  binId: string;
  placements: Placement[];
}

export type Collection = 'items' | 'bins' | 'rooms';
