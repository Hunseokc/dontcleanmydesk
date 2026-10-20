// 펼치기 화면. 어질러져 있던 방에 들어가는 느낌.
// 레이어: 1 책상 → 2 얼룩 → 3 소품 (구운 이미지) → 4 카드+그림자 → 5 나뭇잎 그림자(multiply, 흔들림) → 6 빛 번짐(screen)+비네팅
import { Canvas, Group, Image, Path, Rect, Skia, useClock, type SkImage } from '@shopify/react-native-skia';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sfx } from '@/fx/sfx';
import { useShake } from '@/fx/shake';
import { resolveRef } from '@/store/refs';
import { store, useStore } from '@/store/store';
import { THEMES, themeById } from '@/themes';
import { FilterChips } from '@/ui/Chips';
import { ItemDetail } from '@/ui/ItemDetail';

import { Card } from './Card';
import type { DeskFilter } from './filter';
import { cardDims, cardUnit } from './geometry';
import { useBakedLayers } from './layers';
import { useDeskController } from './useDeskController';

// ---------- 썸네일 → SkImage 캐시 ----------
const imageCache = new Map<string, SkImage | null>();
const loading = new Set<string>();

function useSkImages(refs: (string | null | undefined)[]) {
  const [, setTick] = useState(0);
  const key = refs.join('|');
  useEffect(() => {
    for (const ref of refs) {
      if (!ref || imageCache.has(ref) || loading.has(ref)) continue;
      loading.add(ref);
      resolveRef(ref)
        .then(async (uri) => {
          if (!uri) return null;
          const data = await Skia.Data.fromURI(uri);
          return Skia.Image.MakeImageFromEncoded(data);
        })
        .catch(() => null)
        .then((img) => {
          imageCache.set(ref, img);
          loading.delete(ref);
          setTick((t) => t + 1);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return imageCache;
}

// ---------- 저사양 자동 감지 ----------
function guessLowEnd() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const n = navigator as Navigator & { deviceMemory?: number };
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 4;
}

function useFrameBudget(active: boolean, onSlow: () => void) {
  useEffect(() => {
    if (!active) return;
    let frames = 0;
    let start = 0;
    let id = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      frames++;
      if (t - start < 3000) id = requestAnimationFrame(tick);
      else if ((t - start) / frames > 32) onSlow();
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, onSlow]);
}

export default function DeskView() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const bin = useStore((s) => s.currentBin());
  const settings = useStore((s) => s.settings);
  const tags = useStore((s) => s.allTags(bin.id));
  const itemCount = useStore((s) => s.binItems(bin.id).length);
  const theme = themeById(bin.themeId);
  const [filter, setFilter] = useState<DeskFilter | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [slow, setSlow] = useState(guessLowEnd);
  const low = settings.quality === 'low' || (settings.quality === 'auto' && slow);
  const [seed] = useState(() => Math.floor(Math.random() * 1e6));
  const dpr = Math.min(2, PixelRatio.get());

  const unit = cardUnit(width, height);
  const dims = useCallback(
    (itemId: string) => {
      const it = store.items.get(itemId);
      return cardDims(theme.skins[it?.type ?? 'text'], unit);
    },
    [theme, unit],
  );

  const ctrl = useDeskController({
    binId: bin.id, width, height, unit, filter, dims,
    intruderEverySec: settings.intruderEverySec, unfoldMs: theme.motion.unfoldMs,
  });

  const baked = useBakedLayers(theme, width, height, low, seed, dpr);
  useFrameBudget(!!baked && settings.quality === 'auto' && !slow, useCallback(() => setSlow(true), []));
  const images = useSkImages(ctrl.cards.map((c) => store.items.get(c.itemId)?.thumbnail));

  // 5. 나뭇잎 그림자는 아주 천천히 흔들린다
  const clock = useClock();
  const sway = theme.light.leaves.sway;
  const leafTransform = useDerivedValue(() => [
    { translateX: Math.sin(clock.value / 4200) * 9 * sway },
    { translateY: Math.cos(clock.value / 5300) * 5 * sway },
    { rotate: Math.sin(clock.value / 6100) * 0.01 * sway },
  ]);

  const rummage = useCallback(() => {
    if (ctrl.rummageNow()) sfx.rustle();
  }, [ctrl]);
  useShake(rummage);

  // ---------- 제스처 ----------
  const drag = useRef<{ id: string | null; ox: number; oy: number; sx: number; sy: number; moved: boolean; corner: boolean; fired: boolean } | null>(null);
  const point = (e: GestureResponderEvent) => [e.nativeEvent.pageX, e.nativeEvent.pageY] as const;
  const CORNER = Math.max(90, unit * 0.7);

  const onGrant = (e: GestureResponderEvent) => {
    const [x, y] = point(e);
    const id = ctrl.hitTestAt(x, y);
    if (id) {
      const c = ctrl.cardOf(id)!;
      drag.current = { id, ox: c.x - x, oy: c.y - y, sx: x, sy: y, moved: false, corner: false, fired: false };
      ctrl.beginDrag(id);
    } else {
      drag.current = { id: null, ox: 0, oy: 0, sx: x, sy: y, moved: false, corner: x > width - CORNER && y > height - CORNER, fired: false };
    }
  };
  const onMove = (e: GestureResponderEvent) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = point(e);
    if (Math.hypot(x - d.sx, y - d.sy) > 6) d.moved = true;
    if (d.id) ctrl.dragTo(d.id, x + d.ox, y + d.oy);
    else if (d.corner && !d.fired && d.sx - x + (d.sy - y) > 70) {
      // 구석 끌어당기기 → 하나 더 꺼낸다
      d.fired = true;
      rummage();
    }
  };
  const onRelease = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.id) return;
    ctrl.endDrag(d.id, d.moved);
    if (!d.moved) {
      const id = d.id;
      sfx.rustle();
      store.markSeen([id]);
      void ctrl.unfold(id).then(() => setOpenId(id));
    }
  };

  const closeDetail = () => {
    if (openId) ctrl.refold(openId);
    setOpenId(null);
  };

  const cycleTheme = () => {
    const ids = Object.keys(THEMES);
    store.updateBin(bin.id, { themeId: ids[(ids.indexOf(theme.id) + 1) % ids.length] });
  };

  const ui = theme.ui;
  const cornerHint = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    p.moveTo(width, height - CORNER * 0.75);
    p.lineTo(width - CORNER * 0.75, height);
    p.lineTo(width, height);
    p.close();
    return p.build();
  }, [width, height, CORNER]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.desk.base }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        {baked ? <Image image={baked.background} x={0} y={0} width={width} height={height} fit="fill" /> : <Rect x={0} y={0} width={width} height={height} color={theme.desk.base} />}

        {/* 구석에 깔린 종이 더미 — 끌어당기면 하나씩 나온다 */}
        <Group opacity={0.9}>
          <Path path={cornerHint} color={theme.paper.memo} transform={[{ translateX: 6 }, { translateY: 4 }]} />
          <Path path={cornerHint} color={theme.paper.newspaper} transform={[{ translateX: -4 }, { translateY: 10 }]} />
          <Path path={cornerHint} color={theme.paper.polaroid} transform={[{ translateX: 12 }, { translateY: 14 }]} />
        </Group>

        {ctrl.cards.map((c) => {
          const it = store.items.get(c.itemId);
          if (!it) return null;
          const skin = theme.skins[it.type];
          const d = cardDims(skin, unit);
          return (
            <Card
              key={c.itemId}
              x={c.x} y={c.y} rot={c.rot} w={d.w} h={d.h} scale={c.scale}
              skin={skin}
              image={(it.thumbnail && images.get(it.thumbnail)) || null}
              fallbackColor={it.color}
              crumple={c.crumple}
              seed={c.seed}
              lift={c.lift}
              theme={theme}
              shadowBlur={!low || theme.quality.low.shadowBlur}
            />
          );
        })}

        {baked?.leaves ? (
          <Group blendMode="multiply" transform={leafTransform}>
            <Image image={baked.leaves} x={-30} y={-30} width={width + 60} height={height + 60} fit="fill" />
          </Group>
        ) : null}
        {baked?.bloom ? (
          <Group blendMode="screen">
            <Image image={baked.bloom} x={0} y={0} width={width} height={height} fit="fill" />
          </Group>
        ) : null}
        {baked ? (
          <Group blendMode="multiply">
            <Image image={baked.vignette} x={0} y={0} width={width} height={height} fit="fill" />
          </Group>
        ) : null}
      </Canvas>

      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
        onResponderTerminate={onRelease}
        onResponderTerminationRequest={() => false}
      />

      <View style={[styles.toolbar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.row} pointerEvents="box-none">
          <ToolButton label="← 통" onPress={() => router.back()} ui={ui} />
          <Text style={[styles.title, { color: ui.panel }]} numberOfLines={1}>
            {bin.name} · {itemCount}
          </Text>
          <View style={{ flex: 1 }} />
          <ToolButton label="뒤지기" onPress={rummage} ui={ui} />
          <ToolButton label="순서 보기" onPress={() => router.push('/list')} ui={ui} />
          <ToolButton label={theme.name} onPress={cycleTheme} ui={ui} />
        </View>
        <FilterChips filter={filter} onChange={setFilter} tags={tags} ui={ui} />
      </View>

      {itemCount === 0 ? (
        <View style={styles.empty} pointerEvents="none">
          <Text style={[styles.emptyText, { color: ui.panel }]}>통이 비어 있어요. 돌아가서 아무거나 던져 넣어 보세요.</Text>
        </View>
      ) : null}

      {openId ? <ItemDetail itemId={openId} onClose={closeDetail} onSendBack={ctrl.sendBack} ui={ui} /> : null}
    </View>
  );
}

function ToolButton({ label, onPress, ui }: { label: string; onPress: () => void; ui: { panel: string; ink: string } }) {
  return (
    <Pressable onPress={onPress} style={[styles.toolBtn, { backgroundColor: ui.panel }]}>
      <Text style={{ color: ui.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: { position: 'absolute', left: 0, right: 0, top: 0, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  title: { fontSize: 15, fontWeight: '700', marginLeft: 4, textShadowColor: 'rgba(40,20,5,0.6)', textShadowRadius: 6, flexShrink: 1 },
  toolBtn: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8, opacity: 0.92 },
  empty: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 16, textAlign: 'center', textShadowColor: 'rgba(40,20,5,0.7)', textShadowRadius: 8 },
});
