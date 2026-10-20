// 웹 썸네일 렌더러: canvas 2D. 시스템 글꼴을 쓸 수 있어 한글 텍스트 썸네일도 바로 그린다.
import { hashString, range, seededRng, type Rng } from '@/core/random';

import type { ProceduralInput, RenderedImage, ThumbRenderer } from './render.types';

const W = 320;
const H = 400;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toImage(c: HTMLCanvasElement, mime = 'image/jpeg', quality = 0.86): Promise<RenderedImage> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve({ data: b, mime }) : reject(new Error('toBlob 실패'))), mime, quality),
  );
}

function mix(hex: string, toward: string, t: number) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function pattern(g: CanvasRenderingContext2D, rng: Rng, color: string) {
  const ink = mix(color, '#2a1a10', 0.35);
  g.globalAlpha = 0.22;
  g.strokeStyle = ink;
  g.fillStyle = ink;
  const kind = Math.floor(rng() * 4);
  if (kind === 0) {
    g.lineWidth = range(rng, 6, 16);
    const step = range(rng, 28, 48);
    for (let i = -H; i < W + H; i += step) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i - H * 0.6, H);
      g.stroke();
    }
  } else if (kind === 1) {
    const step = range(rng, 22, 34);
    for (let y = step / 2; y < H; y += step)
      for (let x = step / 2; x < W; x += step) {
        g.beginPath();
        g.arc(x + (y / step) % 2 * (step / 2), y, step * 0.18, 0, Math.PI * 2);
        g.fill();
      }
  } else if (kind === 2) {
    const cx = range(rng, 0, W);
    const cy = range(rng, 0, H);
    g.lineWidth = range(rng, 5, 12);
    for (let r = 20; r < 520; r += range(rng, 22, 40)) {
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
    }
  } else {
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.ellipse(range(rng, 0, W), range(rng, 0, H), range(rng, 30, 120), range(rng, 20, 90), range(rng, 0, 3), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = '';
    for (const ch of para) {
      if (g.measureText(line + ch).width > maxW && line) {
        lines.push(line);
        line = ch.trimStart();
        if (lines.length >= maxLines) break;
      } else line += ch;
    }
    if (lines.length >= maxLines) break;
    if (line) lines.push(line);
  }
  if (lines.length > maxLines) lines.length = maxLines;
  const joined = lines.join('');
  if (joined.length < text.replace(/\n/g, '').length && lines.length) lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + '…';
  return lines;
}

const GLYPH: Record<string, string> = { music: '♪', video: '▶', image: '◐', link: '↗', text: '' };

async function procedural(input: ProceduralInput): Promise<RenderedImage> {
  const rng = seededRng(hashString(input.id + input.text));
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  g.fillStyle = mix(input.color, '#f7ecd6', 0.45);
  g.fillRect(0, 0, W, H);
  pattern(g, rng, input.color);

  const ink = '#2b1b10';
  const glyph = GLYPH[input.type];
  if (glyph) {
    g.fillStyle = mix(input.color, '#2a1a10', 0.5);
    g.globalAlpha = 0.85;
    g.font = '700 120px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(glyph, W / 2, H * (input.text ? 0.36 : 0.5));
    g.globalAlpha = 1;
  }

  if (input.text) {
    const big = input.type === 'text' && input.text.length < 24;
    const size = big ? 42 : input.type === 'text' ? 28 : 24;
    g.font = `600 ${size}px "Nanum Myeongjo", "Noto Serif KR", "Apple SD Gothic Neo", Georgia, serif`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = ink;
    const lines = wrap(g, input.text, W - 48, glyph ? 3 : big ? 4 : 8);
    const lh = size * 1.32;
    const top = glyph ? H * 0.6 : Math.max(28, (H - lines.length * lh) / 2 - (big ? 10 : 0));
    lines.forEach((l, i) => g.fillText(l, 24, top + i * lh));
  }
  if (input.caption) {
    g.font = '500 18px system-ui, sans-serif';
    g.fillStyle = mix(input.color, '#2a1a10', 0.6);
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    g.fillText(input.caption.slice(0, 28), 24, H - 20);
  }
  return toImage(c);
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 읽을 수 없음'));
    img.src = uri;
  });
}

function drawScaled(src: CanvasImageSource, sw: number, sh: number, max: number) {
  const s = Math.min(1, max / Math.max(sw, sh));
  const c = canvas(Math.max(1, Math.round(sw * s)), Math.max(1, Math.round(sh * s)));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

async function downscale(uri: string, max = 560): Promise<RenderedImage | null> {
  try {
    const img = await loadImage(uri);
    return toImage(drawScaled(img, img.naturalWidth, img.naturalHeight, max));
  } catch {
    return null;
  }
}

function videoFrame(uri: string, at?: number): Promise<RenderedImage | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    const done = (r: RenderedImage | null) => {
      v.removeAttribute('src');
      v.load();
      resolve(r);
    };
    const timeout = setTimeout(() => done(null), 15_000);
    v.onloadedmetadata = () => {
      const d = isFinite(v.duration) ? v.duration : 1;
      // 임의 시점: 앞뒤 10%는 검은 화면·크레딧일 가능성이 높아 피한다
      v.currentTime = at ?? d * range(Math.random, 0.15, 0.6);
    };
    v.onseeked = async () => {
      clearTimeout(timeout);
      try {
        done(await toImage(drawScaled(v, v.videoWidth, v.videoHeight, 560)));
      } catch {
        done(null);
      }
    };
    v.onerror = () => {
      clearTimeout(timeout);
      done(null);
    };
    v.src = uri;
  });
}

async function waveform(uri: string, color: string): Promise<RenderedImage | null> {
  try {
    const buf = await (await fetch(uri)).arrayBuffer();
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(buf);
    void ctx.close();
    const data = audio.getChannelData(0);
    const c = canvas(W, H);
    const g = c.getContext('2d')!;
    g.fillStyle = mix(color, '#f7ecd6', 0.5);
    g.fillRect(0, 0, W, H);
    const bars = 48;
    const step = Math.floor(data.length / bars);
    g.fillStyle = mix(color, '#2a1a10', 0.45);
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      for (let j = i * step; j < (i + 1) * step; j += 64) peak = Math.max(peak, Math.abs(data[j]));
      const h = Math.max(4, peak * H * 0.7);
      g.fillRect(16 + i * ((W - 32) / bars), H / 2 - h / 2, (W - 32) / bars - 2, h);
    }
    return toImage(c);
  } catch {
    return null;
  }
}

export const renderer: ThumbRenderer = { procedural, downscale, videoFrame, waveform };

let ballTextureCache: string | null = null;

/** 통 안의 구겨진 종이 공 질감(투명 PNG). 첫 화면은 Skia 없이 그리므로 canvas 로 한 번 만들어 둔다. */
export function crumpledBallTexture(): string | null {
  if (ballTextureCache) return ballTextureCache;
  const S = 128;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  const rng = seededRng(42);
  const grad = g.createRadialGradient(S * 0.36, S * 0.32, S * 0.05, S / 2, S / 2, S * 0.52);
  grad.addColorStop(0, 'rgba(255,250,235,0.55)');
  grad.addColorStop(0.6, 'rgba(255,240,215,0.0)');
  grad.addColorStop(1, 'rgba(60,30,10,0.45)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = range(rng, 0, S);
    const y = range(rng, 0, S);
    const a = range(rng, 0, Math.PI);
    const len = range(rng, 18, 60);
    const dark = rng() < 0.6;
    g.strokeStyle = dark ? 'rgba(60,32,14,0.35)' : 'rgba(255,248,230,0.5)';
    g.lineWidth = range(rng, 0.8, 2.2);
    g.beginPath();
    g.moveTo(x - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2);
    g.lineTo(x + range(rng, -6, 6), y + range(rng, -6, 6));
    g.lineTo(x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2);
    g.stroke();
  }
  // 몇 개의 면을 밝게/어둡게 칠해 각진 느낌
  for (let i = 0; i < 9; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(60,30,10,0.12)' : 'rgba(255,250,240,0.14)';
    g.beginPath();
    const cx = range(rng, 0, S);
    const cy = range(rng, 0, S);
    g.moveTo(cx, cy);
    for (let k = 0; k < 3; k++) g.lineTo(cx + range(rng, -40, 40), cy + range(rng, -40, 40));
    g.closePath();
    g.fill();
  }
  ballTextureCache = c.toDataURL('image/png');
  return ballTextureCache;
}

