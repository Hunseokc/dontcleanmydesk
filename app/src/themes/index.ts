// 기본 테마: 오후 햇살 책상(2D). 아침·밤은 같은 책상에 5·6번 레이어(나뭇잎 그림자, 빛 번짐·비네팅)만 바꾼 변형이다.
import type { ThemeManifest } from './types';

export type { ThemeManifest } from './types';

const afternoon: ThemeManifest = {
  id: 'afternoon',
  name: '오후 햇살',
  desk: { base: '#c8915a', grain: '#8e5a31', grainScale: 34, grainContrast: 0.55, brush: 0.5 },
  stains: { count: 9, colors: ['#6b3d1e', '#7a4a26', '#5a341c'], scratches: 7 },
  props: [
    { kind: 'plant', x: 0.02, y: 0.04, size: 0.42, rotation: 0.3, color: '#5c7a3a' },
    { kind: 'notebook', x: 1.0, y: 0.1, size: 0.36, rotation: -0.35, color: '#b5473a' },
    { kind: 'bottle', x: 0.95, y: 0.93, size: 0.15, rotation: 0, color: '#7fa39a' },
    { kind: 'mug', x: 0.05, y: 0.9, size: 0.16, rotation: 0.6, color: '#efe3cf' },
    { kind: 'pencil', x: 0.55, y: 0.98, size: 0.3, rotation: 0.12, color: '#e0a53a' },
  ],
  skins: { text: 'memo', image: 'polaroid', video: 'film', music: 'cassette', link: 'newspaper' },
  paper: { memo: '#f6ecd4', polaroid: '#fbf8f1', cassette: '#3b2f2a', newspaper: '#e9dfc6', film: '#231c19' },
  crumple: { creases: 9, depth: 1.0 },
  light: {
    direction: [-0.8, -0.6],
    shadowColor: '#4a2511',
    shadowStrength: 0.42,
    shadowBlur: 9,
    leaves: { enabled: true, color: '#3d2010', opacity: 0.24, sway: 1, scale: 1 },
    bloom: { color: '#ffd38a', intensity: 0.55, center: [0.18, 0.12], radius: 0.85 },
    vignette: { color: '#2b1408', strength: 0.55, dither: 0.6 },
  },
  physics: { friction: 0.4, restitution: 0.35, gravity: 1.1, frictionAir: 0.012 },
  motion: { throwMs: 620, spreadMs: 900, unfoldMs: 420 },
  quality: { low: { shadowBlur: false, leafBlur: false, bloom: true, stainScale: 0.5 } },
  ui: {
    background: '#e9c99b', ink: '#3a2414', inkSoft: '#7a5a40', panel: '#fbf3e4', accent: '#c4622d',
    bin: '#a56b3c', binDark: '#6e4223',
  },
};

const morning: ThemeManifest = {
  ...afternoon,
  id: 'morning',
  name: '아침',
  light: {
    ...afternoon.light,
    direction: [0.7, -0.7],
    shadowColor: '#5a3a24',
    shadowStrength: 0.3,
    shadowBlur: 12,
    leaves: { enabled: true, color: '#4a3424', opacity: 0.18, sway: 0.6, scale: 1.3 },
    bloom: { color: '#fff2d0', intensity: 0.45, center: [0.85, 0.08], radius: 1.0 },
    vignette: { color: '#3a2a1c', strength: 0.3, dither: 0.4 },
  },
  ui: { ...afternoon.ui, background: '#efdcbc' },
};

const night: ThemeManifest = {
  ...afternoon,
  id: 'night',
  name: '밤',
  light: {
    ...afternoon.light,
    direction: [0.2, -1],
    shadowColor: '#120a14',
    shadowStrength: 0.6,
    shadowBlur: 14,
    leaves: { enabled: false, color: '#000000', opacity: 0, sway: 0, scale: 1 },
    bloom: { color: '#ffb35c', intensity: 0.6, center: [0.5, 0.42], radius: 0.6 },
    vignette: { color: '#0b0712', strength: 0.92, dither: 0.8 },
  },
  ui: { ...afternoon.ui, background: '#2c2230', ink: '#f3e6d2', inkSoft: '#b9a58e', panel: '#3a2e3c', bin: '#7c5132', binDark: '#4b2e1b' },
};

export const THEMES: Record<string, ThemeManifest> = { afternoon, morning, night };

export const themeById = (id: string | undefined): ThemeManifest => THEMES[id ?? ''] ?? afternoon;
