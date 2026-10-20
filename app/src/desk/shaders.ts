// Skia 셰이더. 이 모듈은 CanvasKit 이 로드된 뒤(펼치기 화면 진입 후)에만 import 된다.
import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

function make(name: string, src: string): SkRuntimeEffect {
  const effect = Skia.RuntimeEffect.Make(src);
  if (!effect) throw new Error(`셰이더 컴파일 실패: ${name}`);
  return effect;
}

/** 1. 책상 텍스처: 페인터리한 나무 결. 정적이라 한 번만 구워 이미지로 쓴다. */
export const woodEffect = make(
  'wood',
  `
uniform float4 base;
uniform float4 grain;
uniform float scale;
uniform float contrast;
uniform float brush;
uniform float seed;

float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7)) + seed) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p); float2 f = fract(p); float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), u.x), mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), u.x), u.y);
}
float fbm(float2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

half4 main(float2 xy) {
  float2 p = xy / scale;
  float plankH = 5.2;
  float plank = floor(p.y / plankH);
  float2 q = float2(p.x * 0.08 + plank * 13.7, p.y);
  float warp = fbm(float2(q.x * 0.6, q.y * 0.35 + plank * 3.1)) * 3.0;
  float rings = sin((q.y + warp) * 3.4557);
  float g = smoothstep(-0.2, 1.0, rings) * contrast;
  float fine = fbm(float2(p.x * 0.9, p.y * 6.0)) * 0.25;
  float stroke = (fbm(xy / (scale * 6.0) + 7.0) - 0.5) * brush;
  float3 col = mix(base.rgb, grain.rgb, clamp(g * 0.6 + fine, 0.0, 1.0));
  col *= 1.0 + stroke * 0.35;
  float f = fract(p.y / plankH);
  float seam = smoothstep(0.03, 0.0, min(f, 1.0 - f));
  col = mix(col, grain.rgb * 0.6, seam * 0.55);
  col *= 0.93 + 0.14 * hash(float2(plank, 3.0));
  return half4(half3(col), 1.0);
}
`,
);

/** 6. 비네팅 + 도트·디더링 가장자리. multiply 로 얹으므로 흰색 = 변화 없음. */
export const vignetteEffect = make(
  'vignette',
  `
uniform float2 resolution;
uniform float4 color;
uniform float strength;
uniform float dither;

float bayer2(float2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(float2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

half4 main(float2 xy) {
  float2 uv = xy / resolution - 0.5;
  uv.x *= resolution.x / resolution.y;
  float d = length(uv) / (0.5 * length(float2(resolution.x / resolution.y, 1.0)));
  float v = smoothstep(0.45, 1.05, d) * strength;
  // 가장자리에서는 매끈한 그라데이션 대신 계단 + 디더 점으로 끊어 그린다
  float b = bayer4(xy / 3.0);
  float stepped = floor(v * 7.0 + (b - 0.5) * dither * 1.6 + 0.5) / 7.0;
  float k = clamp(mix(v, stepped, smoothstep(0.05, 0.35, v)), 0.0, 1.0);
  return half4(half3(mix(float3(1.0), color.rgb, k)), 1.0);
}
`,
);

// 구김: 접힌 선(크리스)들로 높이장 기울기를 만들고, 광원 방향으로 음영을 준다.
// 카드마다 seed 만 다르면 되므로 그림을 따로 만들 필요가 없다. crumple 0 이면 완전히 펴진 종이.
const CREASE = `
uniform float2 cardSize;
uniform float crumple;
uniform float seed;
uniform float creases;
uniform float depth;
uniform float2 light;

float h1(float n) { return fract(sin(n * 12.9898 + seed * 78.233) * 43758.5453); }

float shadeAt(float2 p) {
  float2 uv = p / cardSize + 0.5;
  float2 g = float2(0.0);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    if (fi >= creases) { break; }
    float a = h1(fi * 3.1 + 1.0) * 6.2831;
    float2 n = float2(cos(a), sin(a));
    float2 c = float2(h1(fi * 5.7 + 2.0), h1(fi * 7.3 + 3.0));
    float d = dot(uv - c, n);
    float w = 0.35 + 0.65 * h1(fi * 9.1 + 4.0);
    float valley = h1(fi * 11.3 + 5.0) > 0.5 ? 1.0 : -1.0;
    g += n * valley * w * clamp(d * 60.0, -1.0, 1.0) * exp(-abs(d) * 3.0);
  }
  float3 N = normalize(float3(-g * depth * crumple * 0.9, 1.0));
  float3 L = normalize(float3(light, 0.85));
  // 가장자리로 갈수록 살짝 어둡게(종이가 들뜬 느낌)
  float2 e = abs(uv - 0.5) * 2.0;
  float edge = 1.0 - 0.12 * crumple * smoothstep(0.7, 1.0, max(e.x, e.y));
  return (1.0 + (dot(N, L) - L.z) * 0.95) * edge;
}
`;

export const crumpleImageEffect = make(
  'crumple-image',
  `
uniform shader image;
uniform float sepia;
${CREASE}
half4 main(float2 p) {
  half4 c = image.eval(p);
  float3 col = c.rgb;
  float gray = dot(col, float3(0.299, 0.587, 0.114));
  col = mix(col, float3(gray * 1.07, gray * 0.98, gray * 0.82), sepia);
  return half4(half3(col * shadeAt(p)), c.a);
}
`,
);

export const crumpleSolidEffect = make(
  'crumple-solid',
  `
uniform float4 color;
${CREASE}
half4 main(float2 p) {
  return half4(half3(color.rgb * shadeAt(p)), 1.0);
}
`,
);
