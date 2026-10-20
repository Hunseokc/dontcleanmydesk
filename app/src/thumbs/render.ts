// 모바일 썸네일 렌더러: Skia 오프스크린. 영상 프레임·파형은 모바일 단계(로드맵 7·8)에서 채운다.
import { matchFont, Skia } from '@shopify/react-native-skia';

import { hashString, range, seededRng } from '@/core/random';

import type { ProceduralInput, RenderedImage, ThumbRenderer } from './render.types';

const W = 320;
const H = 400;

async function procedural(input: ProceduralInput): Promise<RenderedImage> {
  const rng = seededRng(hashString(input.id + input.text));
  const surface = Skia.Surface.MakeOffscreen(W, H) ?? Skia.Surface.Make(W, H);
  if (!surface) throw new Error('Skia surface 를 만들 수 없음');
  const c = surface.getCanvas();
  c.drawColor(Skia.Color(input.color));
  c.drawColor(Skia.Color('rgba(247,236,214,0.45)'));
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('rgba(42,26,16,0.18)'));
  for (let i = 0; i < 7; i++) c.drawCircle(range(rng, 0, W), range(rng, 0, H), range(rng, 20, 90), paint);

  if (input.text) {
    const font = matchFont({ fontFamily: 'System', fontSize: 28, fontWeight: '600' });
    const ink = Skia.Paint();
    ink.setColor(Skia.Color('#2b1b10'));
    const chars = [...input.text.replace(/\n+/g, ' ')];
    let line = '';
    let y = 60;
    for (const ch of chars) {
      if (font.measureText(line + ch).width > W - 48) {
        c.drawText(line, 24, y, ink, font);
        line = ch;
        y += 38;
        if (y > H - 30) break;
      } else line += ch;
    }
    if (y <= H - 30 && line) c.drawText(line, 24, y, ink, font);
  }
  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes();
  return { data: bytes, mime: 'image/png' };
}

export const renderer: ThumbRenderer = {
  procedural,
  // 원본을 그대로 쓴다(축소는 expo-image-manipulator 도입 시)
  downscale: async (uri) => ({ data: uri, mime: 'image/jpeg' }),
  videoFrame: async () => null,
  waveform: async () => null,
};

export function crumpledBallTexture(): string | null {
  return null;
}
