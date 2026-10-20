// 책상 레이어 1·2·3(정적)과 5·6(분위기)을 한 번만 그려 이미지로 굽는다.
// 매 프레임에는 구운 이미지 몇 장 + 카드만 그리므로 저사양에서도 가볍다.
import {
  BlurMask, Circle, drawAsImage, Fill, Group, Line, Oval, Path, RadialGradient, Rect, RoundedRect, Shader,
  Skia, vec, type SkImage,
} from '@shopify/react-native-skia';
import { useEffect, useState, type ReactElement } from 'react';

import { hexToRgba, range, seededRng, type Rng } from '@/core/random';
import type { PropSpec, ThemeManifest } from '@/themes/types';

import { vignetteEffect, woodEffect } from './shaders';

export interface Baked {
  background: SkImage;
  leaves: SkImage | null;
  bloom: SkImage | null;
  vignette: SkImage;
}

function withAlpha(hex: string, a: number) {
  const [r, g, b] = hexToRgba(hex);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}

// ---------- 2. 얼룩·자국 ----------
function Stains({ theme, w, h, rng, scale }: { theme: ThemeManifest; w: number; h: number; rng: Rng; scale: number }) {
  const n = Math.round(theme.stains.count * scale);
  const els: ReactElement[] = [];
  for (let i = 0; i < n; i++) {
    const color = theme.stains.colors[i % theme.stains.colors.length];
    const x = range(rng, 0, w);
    const y = range(rng, 0, h);
    const r = range(rng, 18, 46);
    const kind = rng();
    if (kind < 0.55) {
      // 컵 자국: 바깥 고리 + 옅은 안쪽
      els.push(
        <Group key={'s' + i} opacity={range(rng, 0.16, 0.3)}>
          <Circle cx={x} cy={y} r={r} color={withAlpha(color, 0.25)} />
          <Circle cx={x} cy={y} r={r} style="stroke" strokeWidth={range(rng, 1.5, 3.5)} color={color}>
            <BlurMask blur={1.2} style="normal" />
          </Circle>
        </Group>,
      );
    } else {
      // 잉크·물 얼룩: 불규칙한 점들
      for (let k = 0; k < 5; k++)
        els.push(
          <Circle key={`d${i}-${k}`} cx={x + range(rng, -r, r)} cy={y + range(rng, -r, r) * 0.6} r={range(rng, 2, r * 0.4)} color={withAlpha(color, range(rng, 0.08, 0.2))}>
            <BlurMask blur={2} style="normal" />
          </Circle>,
        );
    }
  }
  for (let i = 0; i < theme.stains.scratches; i++) {
    const x = range(rng, 0, w);
    const y = range(rng, 0, h);
    const a = range(rng, -0.4, 0.4);
    const len = range(rng, 30, 140);
    els.push(
      <Line key={'k' + i} p1={vec(x, y)} p2={vec(x + Math.cos(a) * len, y + Math.sin(a) * len)} color="rgba(255,236,200,0.16)" strokeWidth={1} />,
    );
  }
  return <>{els}</>;
}

// ---------- 3. 테두리 소품 (위에서 내려다본 2D) ----------
function Prop({ spec, w, h, theme, rng }: { spec: PropSpec; w: number; h: number; theme: ThemeManifest; rng: Rng }) {
  const s = Math.min(w, h) * spec.size;
  const cx = spec.x * w;
  const cy = spec.y * h;
  const [lx, ly] = theme.light.direction;
  const shadow = withAlpha(theme.light.shadowColor, theme.light.shadowStrength + 0.1);
  const sh = { dx: -lx * s * 0.08, dy: -ly * s * 0.08 };
  const transform = [{ translateX: cx }, { translateY: cy }, { rotate: spec.rotation }];
  let body: ReactElement;

  switch (spec.kind) {
    case 'plant': {
      const leaves: ReactElement[] = [];
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + range(rng, -0.2, 0.2);
        const len = s * range(rng, 0.38, 0.55);
        const lw = len * 0.42;
        const p = Skia.PathBuilder.Make();
        p.moveTo(0, 0);
        p.quadTo(lw, -len * 0.5, 0, -len);
        p.quadTo(-lw, -len * 0.5, 0, 0);
        leaves.push(
          <Group key={i} transform={[{ rotate: a }]}>
            <Path path={p.build()} color={i % 2 ? spec.color : withAlpha('#7c9a4a', 1)} />
            <Line p1={vec(0, 0)} p2={vec(0, -len * 0.9)} color="rgba(30,50,20,0.35)" strokeWidth={1.2} />
          </Group>,
        );
      }
      body = (
        <>
          <Circle cx={sh.dx * 2} cy={sh.dy * 2} r={s * 0.5} color={shadow}>
            <BlurMask blur={s * 0.06} style="normal" />
          </Circle>
          <Circle cx={0} cy={0} r={s * 0.24} color="#b5603a" />
          <Circle cx={0} cy={0} r={s * 0.2} color="#4a2e1c" />
          {leaves}
        </>
      );
      break;
    }
    case 'notebook':
      body = (
        <>
          <RoundedRect x={-s * 0.4 + sh.dx} y={-s * 0.55 + sh.dy} width={s * 0.8} height={s * 1.1} r={6} color={shadow}>
            <BlurMask blur={s * 0.04} style="normal" />
          </RoundedRect>
          <RoundedRect x={-s * 0.38} y={-s * 0.53} width={s * 0.78} height={s * 1.06} r={4} color="#efe4cc" />
          <RoundedRect x={-s * 0.4} y={-s * 0.55} width={s * 0.76} height={s * 1.06} r={6} color={spec.color} />
          <Rect x={-s * 0.4} y={-s * 0.55} width={s * 0.08} height={s * 1.06} color="rgba(0,0,0,0.18)" />
          <Rect x={s * 0.22} y={-s * 0.55} width={s * 0.035} height={s * 1.06} color="rgba(40,20,10,0.55)" />
        </>
      );
      break;
    case 'bottle':
      body = (
        <>
          <Circle cx={sh.dx * 2.5} cy={sh.dy * 2.5} r={s * 0.5} color={shadow}>
            <BlurMask blur={s * 0.08} style="normal" />
          </Circle>
          <Circle cx={0} cy={0} r={s * 0.5} color={withAlpha(spec.color, 0.75)} />
          <Circle cx={0} cy={0} r={s * 0.36} color={withAlpha('#ffffff', 0.12)} />
          <Circle cx={0} cy={0} r={s * 0.16} color="#5b4434" />
          <Oval x={-s * 0.32} y={-s * 0.38} width={s * 0.22} height={s * 0.12} color="rgba(255,255,255,0.55)" />
        </>
      );
      break;
    case 'mug':
      body = (
        <>
          <Circle cx={sh.dx * 2} cy={sh.dy * 2} r={s * 0.52} color={shadow}>
            <BlurMask blur={s * 0.08} style="normal" />
          </Circle>
          <RoundedRect x={s * 0.38} y={-s * 0.1} width={s * 0.3} height={s * 0.2} r={s * 0.1} color={spec.color} />
          <Circle cx={0} cy={0} r={s * 0.5} color={spec.color} />
          <Circle cx={0} cy={0} r={s * 0.4} color="#4b2a16" />
          <Oval x={-s * 0.25} y={-s * 0.26} width={s * 0.22} height={s * 0.1} color="rgba(255,230,190,0.25)" />
        </>
      );
      break;
    case 'pencil':
      body = (
        <>
          <Rect x={-s * 0.5 + sh.dx} y={-s * 0.03 + sh.dy} width={s} height={s * 0.06} color={shadow}>
            <BlurMask blur={2} style="normal" />
          </Rect>
          <Rect x={-s * 0.4} y={-s * 0.03} width={s * 0.82} height={s * 0.06} color={spec.color} />
          <Rect x={-s * 0.5} y={-s * 0.03} width={s * 0.1} height={s * 0.06} color="#d98a8a" />
          <Path path={`M ${s * 0.42} ${-s * 0.03} L ${s * 0.55} 0 L ${s * 0.42} ${s * 0.03} Z`} color="#e8c9a0" />
          <Path path={`M ${s * 0.51} ${-s * 0.008} L ${s * 0.55} 0 L ${s * 0.51} ${s * 0.008} Z`} color="#3a3a3a" />
        </>
      );
      break;
  }
  return <Group transform={transform}>{body}</Group>;
}

function BackgroundLayer({ theme, w, h, rng, stainScale }: { theme: ThemeManifest; w: number; h: number; rng: Rng; stainScale: number }) {
  const d = theme.desk;
  return (
    <Group>
      <Fill>
        <Shader
          source={woodEffect}
          uniforms={{
            base: hexToRgba(d.base),
            grain: hexToRgba(d.grain),
            scale: d.grainScale,
            contrast: d.grainContrast,
            brush: d.brush,
            seed: range(rng, 0, 100),
          }}
        />
      </Fill>
      <Stains theme={theme} w={w} h={h} rng={rng} scale={stainScale} />
      {theme.props.map((p, i) => (
        <Prop key={i} spec={p} w={w} h={h} theme={theme} rng={rng} />
      ))}
    </Group>
  );
}

/** 5. 나뭇잎 그림자: 창밖 가지가 드리운 잎 덩어리들. 어두운 갈색, 흐릿하게. */
function LeavesLayer({ theme, w, h, rng, blur }: { theme: ThemeManifest; w: number; h: number; rng: Rng; blur: boolean }) {
  const L = theme.light.leaves;
  const els: ReactElement[] = [];
  const clusters = 5;
  for (let c = 0; c < clusters; c++) {
    // 빛이 들어오는 쪽(창가) 가장자리에 몰리게
    const edgeX = theme.light.direction[0] < 0 ? range(rng, -0.1, 0.55) : range(rng, 0.45, 1.1);
    const cx = edgeX * w;
    const cy = range(rng, -0.1, 0.75) * h;
    const branchA = range(rng, 0, Math.PI * 2);
    for (let i = 0; i < 16; i++) {
      const t = i / 16;
      const bx = cx + Math.cos(branchA) * t * 260 * L.scale + range(rng, -40, 40);
      const by = cy + Math.sin(branchA) * t * 260 * L.scale + range(rng, -40, 40);
      els.push(
        <Oval
          key={`${c}-${i}`}
          x={bx}
          y={by}
          width={range(rng, 26, 60) * L.scale}
          height={range(rng, 12, 24) * L.scale}
          color={L.color}
          transform={[{ rotate: range(rng, -0.6, 0.6) }]}
          origin={vec(bx, by)}
        >
          {/* 그룹에 건 마스크 필터는 자식에 전파되지 않아 잎마다 건다 */}
          {blur ? <BlurMask blur={9 * L.scale} style="normal" /> : null}
        </Oval>,
      );
    }
  }
  return (
    <Group>
      <Fill color="white" />
      <Group opacity={L.opacity}>{els}</Group>
    </Group>
  );
}

function BloomLayer({ theme, w, h }: { theme: ThemeManifest; w: number; h: number }) {
  const b = theme.light.bloom;
  const c = vec(b.center[0] * w, b.center[1] * h);
  const r = Math.hypot(w, h) * b.radius;
  return (
    <Fill>
      <RadialGradient c={c} r={r} colors={[withAlpha(b.color, b.intensity), withAlpha(b.color, b.intensity * 0.35), 'rgba(0,0,0,0)']} positions={[0, 0.45, 1]} />
    </Fill>
  );
}

function VignetteLayer({ theme, w, h }: { theme: ThemeManifest; w: number; h: number }) {
  const v = theme.light.vignette;
  return (
    <Fill>
      <Shader source={vignetteEffect} uniforms={{ resolution: [w, h], color: hexToRgba(v.color), strength: v.strength, dither: v.dither }} />
    </Fill>
  );
}

async function bake(el: ReactElement, w: number, h: number, dpr: number) {
  return drawAsImage(<Group transform={[{ scale: dpr }]}>{el}</Group>, { width: Math.ceil(w * dpr), height: Math.ceil(h * dpr) });
}

/** 책상 크기·테마·품질이 바뀔 때만 다시 굽는다. seed 는 방에 들어올 때마다 달라 "매번 조금씩 다른 책상". */
export function useBakedLayers(theme: ThemeManifest, w: number, h: number, low: boolean, seed: number, dpr: number): Baked | null {
  const [baked, setBaked] = useState<Baked | null>(null);
  useEffect(() => {
    if (w < 10 || h < 10) return;
    let alive = true;
    (async () => {
      const q = theme.quality.low;
      const rng = seededRng(seed);
      const background = await bake(<BackgroundLayer theme={theme} w={w} h={h} rng={rng} stainScale={low ? q.stainScale : 1} />, w, h, dpr);
      const leaves = theme.light.leaves.enabled
        ? await bake(<LeavesLayer theme={theme} w={w} h={h} rng={seededRng(seed + 1)} blur={!low || q.leafBlur} />, w, h, 1)
        : null;
      const bloom = !low || q.bloom ? await bake(<BloomLayer theme={theme} w={w} h={h} />, w, h, 1) : null;
      const vignette = await bake(<VignetteLayer theme={theme} w={w} h={h} />, w, h, dpr);
      if (alive && background && vignette) setBaked({ background, leaves, bloom, vignette });
    })().catch((e) => console.warn('[desk] 레이어 굽기 실패', e));
    return () => {
      alive = false;
    };
  }, [theme, w, h, low, seed, dpr]);
  return baked;
}
