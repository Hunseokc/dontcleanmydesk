import type { ItemType } from '@/core/types';
import type { FileData } from '@/store/db.types';

export interface ProceduralInput {
  id: string;
  type: ItemType;
  color: string;
  /** 썸네일에 찍을 글자(본문 일부, 도메인 등) */
  text: string;
  caption?: string | null;
}

export interface RenderedImage {
  data: FileData;
  mime: string;
}

/** 썸네일을 실제로 그리는 쪽. 웹은 canvas 2D, 모바일은 Skia 오프스크린. */
export interface ThumbRenderer {
  /** 내용의 해시에서 색과 패턴을 뽑아 즉시 만든다. 기본 폴백. */
  procedural(input: ProceduralInput): Promise<RenderedImage>;
  /** 원본 축소본 */
  downscale(uri: string, max?: number): Promise<RenderedImage | null>;
  /** 영상 파일의 한 장면. at 은 초, 없으면 임의 시점 */
  videoFrame(uri: string, at?: number): Promise<RenderedImage | null>;
  /** 음악 파형 이미지 */
  waveform(uri: string, color: string): Promise<RenderedImage | null>;
}
