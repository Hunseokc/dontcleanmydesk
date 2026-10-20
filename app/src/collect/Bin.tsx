// 통. 저장한 아이디어는 구겨진 종이 공이 되어 통 안에 matter.js 로 쌓인다.
// 첫 화면이라 Skia 없이 RN View 로만 그린다(웹 초기 로딩을 가볍게).
import Matter from 'matter-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { hashString } from '@/core/random';
import type { Item } from '@/core/types';
import { useResolved } from '@/store/refs';
import type { ThemeManifest } from '@/themes/types';
import { crumpledBallTexture } from '@/thumbs/render';

const MAX_BALLS = 40;

interface BallPos {
  x: number;
  y: number;
  angle: number;
}

function jiggle(b: Matter.Body) {
  Matter.Sleeping.set(b, false);
  Matter.Body.setVelocity(b, { x: (Math.random() - 0.5) * 6, y: -Math.random() * 6 });
}
const WALL = 14;

interface Props {
  width: number;
  height: number;
  items: Item[];
  /** 아직 날아가는 중이라 통에 넣지 않을 아이템 */
  pending: Set<string>;
  theme: ThemeManifest;
  onOpen: () => void;
}

function Ball({ item, r, x, y, angle, texture }: { item: Item; r: number; x: number; y: number; angle: number; texture: string | null }) {
  const thumb = useResolved(item.thumbnail);
  return (
    <View
      style={[
        styles.ball,
        { width: r * 2, height: r * 2, borderRadius: r, left: x - r, top: y - r, backgroundColor: item.color, transform: [{ rotate: `${angle}rad` }] },
      ]}
    >
      {thumb ? <Image source={{ uri: thumb }} style={[StyleSheet.absoluteFill, { opacity: 0.75 }]} /> : null}
      {texture ? <Image source={{ uri: texture }} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

export function Bin({ width, height, items, pending, theme, onOpen }: Props) {
  const engine = useMemo(() => {
    const e = Matter.Engine.create({ enableSleeping: true });
    e.gravity.y = theme.physics.gravity;
    return e;
  }, [theme.physics.gravity]);
  const bodies = useRef(new Map<string, Matter.Body>());
  const raf = useRef<number | null>(null);
  const mounted = useRef(false);
  // 렌더용 위치 스냅샷 (몸체는 ref 에 두고 프레임마다 복사)
  const [pos, setPos] = useState<Map<string, BallPos>>(() => new Map());
  const texture = useMemo(() => crumpledBallTexture(), []);
  const [tip] = useState(() => new Animated.Value(0));
  const [tipping, setTipping] = useState(false);

  const innerW = width - WALL * 2;
  const radius = (id: string) => Math.max(12, Math.min(innerW / 7, 14 + (hashString(id) % 10) * 1.1));

  // 벽: 바닥 + 양옆
  useEffect(() => {
    const opts = { isStatic: true, friction: theme.physics.friction };
    const walls = [
      Matter.Bodies.rectangle(width / 2, height + 20 - WALL, width * 2, 40, opts),
      Matter.Bodies.rectangle(WALL - 20, height / 2 - height, 40, height * 4, opts),
      Matter.Bodies.rectangle(width - WALL + 20, height / 2 - height, 40, height * 4, opts),
    ];
    Matter.Composite.add(engine.world, walls);
    return () => {
      Matter.Composite.remove(engine.world, walls);
    };
  }, [engine, width, height, theme.physics.friction]);

  const snapshot = () =>
    setPos(new Map([...bodies.current].map(([id, b]) => [id, { x: b.position.x, y: b.position.y, angle: b.angle }])));

  const run = () => {
    if (raf.current != null) return;
    const step = () => {
      Matter.Engine.update(engine, 1000 / 60);
      snapshot();
      const awake = [...bodies.current.values()].some((b) => !b.isSleeping);
      raf.current = awake ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
  };

  // 아이템 목록과 몸체를 맞춘다
  const visible = items.filter((i) => !pending.has(i.id)).slice(0, MAX_BALLS);
  const visibleKey = visible.map((i) => i.id).join(',');
  useEffect(() => {
    const want = new Set(visible.map((i) => i.id));
    for (const [id, b] of bodies.current) {
      if (!want.has(id)) {
        Matter.Composite.remove(engine.world, b);
        bodies.current.delete(id);
      }
    }
    const first = !mounted.current;
    for (const it of [...visible].reverse()) {
      if (bodies.current.has(it.id)) continue;
      const r = radius(it.id);
      const x = WALL + r + Math.random() * Math.max(1, innerW - r * 2);
      // 처음엔 통 안 여기저기에 두고 미리 가라앉힌다. 이후 새로 들어오는 건 위에서 떨어진다.
      const y = first ? Math.random() * height * 0.8 : -r * 2;
      const b = Matter.Bodies.circle(x, y, r, {
        restitution: theme.physics.restitution,
        friction: theme.physics.friction,
        frictionAir: theme.physics.frictionAir,
        angle: Math.random() * Math.PI * 2,
      });
      bodies.current.set(it.id, b);
      Matter.Composite.add(engine.world, b);
    }
    if (first) {
      for (let i = 0; i < 240; i++) Matter.Engine.update(engine, 1000 / 60);
      mounted.current = true;
      snapshot();
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, engine]);

  useEffect(() => () => void (raf.current != null && cancelAnimationFrame(raf.current)), []);

  /** 탭하면 통이 살짝 흔들리고 책상으로 */
  const poke = () => {
    for (const b of bodies.current.values()) jiggle(b);
    run();
  };

  // 아래로 끌면 통을 엎는다
  const dragStart = useRef<number | null>(null);
  const onGrant = (e: GestureResponderEvent) => {
    dragStart.current = e.nativeEvent.pageY;
  };
  const onMove = (e: GestureResponderEvent) => {
    if (dragStart.current == null || tipping) return;
    const dy = e.nativeEvent.pageY - dragStart.current;
    tip.setValue(Math.max(0, Math.min(1, dy / 140)) * 0.4);
    if (dy > 70) {
      setTipping(true);
      dragStart.current = null;
      Animated.timing(tip, { toValue: 1, duration: 380, useNativeDriver: false }).start(() => {
        onOpen();
        tip.setValue(0);
        setTipping(false);
      });
    }
  };
  const onRelease = (e: GestureResponderEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (tipping) return;
    Animated.spring(tip, { toValue: 0, useNativeDriver: false }).start();
    if (start != null && Math.abs(e.nativeEvent.pageY - start) < 8) {
      poke();
      setTimeout(onOpen, 260);
    }
  };

  const ui = theme.ui;
  const rotate = tip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '118deg'] });
  const translateY = tip.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.35] });

  return (
    <Animated.View
      style={{ width, height, transform: [{ translateY }, { rotate }] }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
      onResponderRelease={onRelease}
      accessibilityRole="button"
      accessibilityLabel="통 펼치기"
    >
      {/* 뒷벽 */}
      <View style={[styles.back, { backgroundColor: ui.binDark, borderBottomLeftRadius: width * 0.18, borderBottomRightRadius: width * 0.18 }]} />
      {/* 공들 */}
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderBottomLeftRadius: width * 0.18, borderBottomRightRadius: width * 0.18 }]}>
        {visible.map((it) => {
          const p = pos.get(it.id);
          if (!p) return null;
          return <Ball key={it.id} item={it} r={radius(it.id)} x={p.x} y={p.y} angle={p.angle} texture={texture} />;
        })}
      </View>
      {/* 앞쪽 엮음 살 */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.front, { borderColor: ui.bin, borderBottomLeftRadius: width * 0.18, borderBottomRightRadius: width * 0.18 }]}>
        {Array.from({ length: 9 }, (_, i) => (
          <View key={i} style={{ position: 'absolute', left: ((i + 0.5) / 9) * width - 3, top: 10, bottom: 6, width: 6, backgroundColor: ui.bin, opacity: 0.45, borderRadius: 3 }} />
        ))}
        {[0.35, 0.65].map((t) => (
          <View key={t} style={{ position: 'absolute', left: 4, right: 4, top: height * t, height: 5, backgroundColor: ui.bin, opacity: 0.4 }} />
        ))}
      </View>
      <View pointerEvents="none" style={[styles.rim, { backgroundColor: ui.bin }]} />
      {!items.length ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={{ color: ui.panel, opacity: 0.8 }}>빈 통</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  back: { ...StyleSheet.absoluteFill, top: 8 },
  front: { borderWidth: 5, borderTopWidth: 0 },
  rim: { position: 'absolute', left: -6, right: -6, top: 0, height: 14, borderRadius: 7 },
  ball: { position: 'absolute', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(60,30,10,0.35)' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
