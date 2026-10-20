// 테마 = 매니페스트(JSON) + 에셋. 아이템은 내용만 갖고, 겉모습은 전부 테마가 정한다.
// 지금은 아트 에셋 없이 모든 레이어를 절차적으로 그린다. 매니페스트는 JSON 으로 직렬화 가능해야 한다
// (다운로드형 테마 팩을 앱 업데이트 없이 배포하기 위해).
import type { ItemType } from '@/core/types';

export type SkinKind = 'memo' | 'polaroid' | 'cassette' | 'newspaper' | 'film';

export type PropKind = 'plant' | 'notebook' | 'bottle' | 'mug' | 'pencil';

export interface PropSpec {
  kind: PropKind;
  /** 책상 기준 위치(0..1). 가장자리 밖으로 나가 잘려도 된다. */
  x: number;
  y: number;
  /** 짧은 변 대비 크기 */
  size: number;
  rotation: number;
  color: string;
}

export interface ThemeManifest {
  id: string;
  name: string;
  /** 1. 책상 텍스처 */
  desk: {
    base: string;
    grain: string;
    /** 나뭇결 간격(px) */
    grainScale: number;
    grainContrast: number;
    /** 페인터리한 붓 자국 세기 */
    brush: number;
  };
  /** 2. 얼룩·자국 디테일 (매번 랜덤 배치) */
  stains: { count: number; colors: string[]; scratches: number };
  /** 3. 테두리 소품 */
  props: PropSpec[];
  /** 물건 스킨: 유형별 겉모습 */
  skins: Record<ItemType, SkinKind>;
  paper: Record<SkinKind, string>;
  /** 구김 셰이더 */
  crumple: { creases: number; depth: number };
  /** 4~6. 빛 */
  light: {
    /** 빛이 오는 방향 (화면 기준, 정규화 전) — 그림자는 반대로 진다 */
    direction: [number, number];
    shadowColor: string;
    shadowStrength: number;
    shadowBlur: number;
    leaves: { enabled: boolean; color: string; opacity: number; sway: number; scale: number };
    bloom: { color: string; intensity: number; center: [number, number]; radius: number };
    vignette: { color: string; strength: number; dither: number };
  };
  physics: { friction: number; restitution: number; gravity: number; frictionAir: number };
  motion: { throwMs: number; spreadMs: number; unfoldMs: number };
  /** 저사양 기기용 품질 단계 */
  quality: { low: { shadowBlur: boolean; leafBlur: boolean; bloom: boolean; stainScale: number } };
  /** 첫 화면(Skia 없이 그리는 부분)에서 쓰는 색 */
  ui: { background: string; ink: string; inkSoft: string; panel: string; accent: string; bin: string; binDark: string };
}
