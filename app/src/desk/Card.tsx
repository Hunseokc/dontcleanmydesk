// 4. 아이템 + 광원 방향에 맞춘 그림자(회색 금지, 따뜻한 갈색).
// 겉모습(스킨)은 테마가 정하고, 구김은 셰이더가 썸네일 위에 렌더링 시점에 입힌다.
import { BlurMask, Circle, Group, ImageShader, Path, Rect, RoundedRect, Shader, Skia, type SkImage } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import { hexToRgba, range, seededRng } from '@/core/random';
import type { SkinKind, ThemeManifest } from '@/themes/types';

import { crumpleImageEffect, crumpleSolidEffect } from './shaders';

export interface CardProps {
  x: number;
  y: number;
  rot: number;
  w: number;
  h: number;
  scale: number;
  skin: SkinKind;
  image: SkImage | null;
  fallbackColor: string;
  crumple: number;
  seed: number;
  /** 0 = 책상에 붙음, 1 = 들어 올림 */
  lift: number;
  theme: ThemeManifest;
  shadowBlur: boolean;
}

type Uniforms = Record<string, number | number[]>;

function Paper({ x, y, w, h, color, u }: { x: number; y: number; w: number; h: number; color: string; u: Uniforms }) {
  return (
    <Rect x={x} y={y} width={w} height={h}>
      <Shader source={crumpleSolidEffect} uniforms={{ ...u, color: hexToRgba(color) }} />
    </Rect>
  );
}

function Picture({ x, y, w, h, image, fallback, u, sepia = 0 }: { x: number; y: number; w: number; h: number; image: SkImage | null; fallback: string; u: Uniforms; sepia?: number }) {
  if (!image) return <Paper x={x} y={y} w={w} h={h} color={fallback} u={u} />;
  return (
    <Rect x={x} y={y} width={w} height={h}>
      <Shader source={crumpleImageEffect} uniforms={{ ...u, sepia }}>
        <ImageShader image={image} fit="cover" rect={{ x, y, width: w, height: h }} />
      </Shader>
    </Rect>
  );
}

function tornPath(w: number, h: number, seed: number) {
  const rng = seededRng(seed * 9973);
  const p = Skia.PathBuilder.Make();
  const x0 = -w / 2;
  const y0 = -h / 2;
  const jag = (n: number) => range(rng, -n, n);
  p.moveTo(x0 + jag(2), y0 + jag(2));
  for (let i = 1; i <= 14; i++) p.lineTo(x0 + (w * i) / 14, y0 + jag(4));
  for (let i = 1; i <= 16; i++) p.lineTo(x0 + w + jag(4), y0 + (h * i) / 16);
  for (let i = 13; i >= 0; i--) p.lineTo(x0 + (w * i) / 14, y0 + h + jag(5));
  for (let i = 15; i >= 1; i--) p.lineTo(x0 + jag(3), y0 + (h * i) / 16);
  p.close();
  return p.build();
}

function CardImpl(props: CardProps) {
  const { x, y, rot, w, h, scale, skin, image, fallbackColor, crumple, seed, lift, theme, shadowBlur } = props;
  const L = theme.light;
  const paper = theme.paper[skin];

  // 광원 방향을 카드 로컬 좌표로 돌린다(카드가 기울어도 빛은 같은 쪽에서 온다)
  const len = Math.hypot(L.direction[0], L.direction[1]) || 1;
  const ldx = L.direction[0] / len;
  const ldy = L.direction[1] / len;
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const light = [ldx * c - ldy * s, ldx * s + ldy * c];

  const plastic = skin === 'cassette';
  const u: Uniforms = {
    cardSize: [w, h],
    crumple: crumple * (plastic ? 0.25 : 1),
    seed,
    creases: theme.crumple.creases,
    depth: theme.crumple.depth,
    light,
  };

  const torn = useMemo(() => (skin === 'newspaper' ? tornPath(w, h, seed) : null), [skin, w, h, seed]);

  // 그림자는 빛 반대쪽으로, 들어 올릴수록 멀고 흐리게
  const elev = 4 + lift * 16 + crumple * 3;
  const sdx = -ldx * elev;
  const sdy = -ldy * elev;
  const shadowColor = hexToRgba(L.shadowColor, L.shadowStrength * (1 - lift * 0.25));
  const shadowRgba = `rgba(${shadowColor.slice(0, 3).map((v) => Math.round(v * 255)).join(',')},${shadowColor[3]})`;

  const hw = w / 2;
  const hh = h / 2;
  let body: React.ReactNode;

  switch (skin) {
    case 'memo':
      body = (
        <>
          <Paper x={-hw} y={-hh} w={w} h={h} color={paper} u={u} />
          <Picture x={-hw + 6} y={-hh + 6} w={w - 12} h={h - 12} image={image} fallback={fallbackColor} u={u} />
          <Group transform={[{ translateY: -hh + 2 }, { rotate: ((seed % 7) - 3) * 0.03 }]}>
            <Rect x={-w * 0.18} y={-7} width={w * 0.36} height={14} color="rgba(250,240,210,0.6)" />
          </Group>
        </>
      );
      break;
    case 'polaroid':
      body = (
        <>
          <Paper x={-hw} y={-hh} w={w} h={h} color={paper} u={u} />
          <Picture x={-hw + 9} y={-hh + 9} w={w - 18} h={h - 40} image={image} fallback={fallbackColor} u={u} />
        </>
      );
      break;
    case 'film': {
      const holes: React.ReactNode[] = [];
      const n = Math.max(6, Math.round(w / 16));
      for (let i = 0; i < n; i++) {
        const hx = -hw + (w / n) * (i + 0.5) - 4;
        holes.push(<RoundedRect key={'t' + i} x={hx} y={-hh + 4} width={8} height={7} r={1.5} color={theme.desk.base} />);
        holes.push(<RoundedRect key={'b' + i} x={hx} y={hh - 11} width={8} height={7} r={1.5} color={theme.desk.base} />);
      }
      body = (
        <>
          <Paper x={-hw} y={-hh} w={w} h={h} color={paper} u={u} />
          {holes}
          <Picture x={-hw + 6} y={-hh + 16} w={w - 12} h={h - 32} image={image} fallback={fallbackColor} u={u} />
        </>
      );
      break;
    }
    case 'cassette':
      body = (
        <>
          <RoundedRect x={-hw} y={-hh} width={w} height={h} r={9}>
            <Shader source={crumpleSolidEffect} uniforms={{ ...u, color: hexToRgba(paper) }} />
          </RoundedRect>
          <Picture x={-hw + 12} y={-hh + 9} w={w - 24} h={h * 0.5} image={image} fallback={fallbackColor} u={u} />
          <RoundedRect x={-w * 0.28} y={hh - h * 0.36} width={w * 0.56} height={h * 0.2} r={h * 0.1} color="rgba(20,14,12,0.85)" />
          <Circle cx={-w * 0.17} cy={hh - h * 0.26} r={h * 0.075} color="#e9dcc3" />
          <Circle cx={w * 0.17} cy={hh - h * 0.26} r={h * 0.075} color="#e9dcc3" />
          <Circle cx={-w * 0.17} cy={hh - h * 0.26} r={h * 0.035} color="#2a201c" />
          <Circle cx={w * 0.17} cy={hh - h * 0.26} r={h * 0.035} color="#2a201c" />
          <Circle cx={-hw + 6} cy={-hh + 6} r={2} color="rgba(255,255,255,0.35)" />
          <Circle cx={hw - 6} cy={hh - 6} r={2} color="rgba(255,255,255,0.35)" />
        </>
      );
      break;
    case 'newspaper': {
      const lines: React.ReactNode[] = [];
      const top = -hh + 12 + (h - 24) * 0.58 + 8;
      for (let i = 0; top + i * 9 < hh - 10; i++) {
        const lw = (w - 26) * (i === 0 ? 0.8 : 0.55 + ((seed * (i + 3)) % 40) / 100);
        lines.push(<Rect key={i} x={-hw + 13} y={top + i * 9} width={lw} height={i === 0 ? 5 : 3} color={i === 0 ? 'rgba(40,30,20,0.7)' : 'rgba(60,50,40,0.35)'} />);
      }
      body = (
        <>
          <Path path={torn!}>
            <Shader source={crumpleSolidEffect} uniforms={{ ...u, color: hexToRgba(paper) }} />
          </Path>
          <Picture x={-hw + 12} y={-hh + 12} w={w - 24} h={(h - 24) * 0.58} image={image} fallback={fallbackColor} u={u} sepia={0.45} />
          {lines}
        </>
      );
      break;
    }
  }

  return (
    <Group>
      <Group transform={[{ translateX: x + sdx }, { translateY: y + sdy }, { rotate: rot }, { scale }]}>
        {torn ? (
          <Path path={torn} color={shadowRgba}>{shadowBlur ? <BlurMask blur={L.shadowBlur + lift * 8} style="normal" /> : null}</Path>
        ) : (
          <RoundedRect x={-hw} y={-hh} width={w} height={h} r={skin === 'cassette' ? 9 : 2} color={shadowRgba}>
            {shadowBlur ? <BlurMask blur={L.shadowBlur + lift * 8} style="normal" /> : null}
          </RoundedRect>
        )}
      </Group>
      <Group transform={[{ translateX: x }, { translateY: y }, { rotate: rot }, { scale }]}>{body}</Group>
    </Group>
  );
}

export const Card = memo(CardImpl);
