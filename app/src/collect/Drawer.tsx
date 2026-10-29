// 정면에서 본 얕은 서랍 한 칸. 앞판 · 앞판 위의 얇은 틈 · 틈에서 삐져나온 종이 모서리 · 짧은 손잡이, 네 요소뿐이다.
// 위쪽 테두리는 화면 밖으로 살짝 잘려서 책상 위 가구가 아니라 앱 안의 수납 공간처럼 보인다.
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import type { ThemeManifest } from '@/themes/types';

/** 서랍 테두리가 화면 위로 잘려 나가는 만큼 */
const CLIP = 24;
const GUTTER = 12;
const FRAME = 6;
const SLIT = 5;
/** 쏟을 때 앞판이 당겨져 나오는 거리 */
const OPEN = 20;
const POUR = 5;

interface Props {
  width: number;
  /** 화면 맨 위(안전 영역 포함)부터 앞판 아래까지 */
  height: number;
  topInset: number;
  /** 서랍이 비었으면 종이 모서리를 숨긴다 */
  filled: boolean;
  /** true 가 되면 열고 쏟은 뒤 onPoured. false 로 돌아오면 닫힌 상태로 되돌린다. */
  pouring: boolean;
  onPoured: () => void;
  onPress: () => void;
  /** 바뀔 때마다 종이가 들어온 것처럼 앞판이 살짝 들썩인다 */
  bump: number;
  ui: ThemeManifest['ui'];
  paper: string;
}

/** 틈의 세로 위치(서랍 영역 기준). 날아온 종이가 여기로 들어간다. */
export const slitY = (topInset: number) => topInset + 10 + SLIT / 2;

export function Drawer({ width, height, topInset, filled, pouring, onPoured, onPress, bump, ui, paper }: Props) {
  const [open] = useState(() => new Animated.Value(0));
  const [pour] = useState(() => new Animated.Value(0));
  const [nudge] = useState(() => new Animated.Value(0));
  // 쏟아지는 종이마다 퍼지는 방향·회전을 미리 정해 둔다
  const [flights] = useState(() =>
    Array.from({ length: POUR }, (_, i) => ({
      dx: (i - (POUR - 1) / 2) * 0.17 + (Math.random() - 0.5) * 0.06,
      dy: 0.8 + Math.random() * 0.5,
      spin: (Math.random() - 0.5) * 70,
    })),
  );

  useEffect(() => {
    if (!pouring) {
      open.setValue(0);
      pour.setValue(0);
      return;
    }
    Animated.sequence([
      Animated.timing(open, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(pour, { toValue: 1, duration: 340, easing: Easing.in(Easing.quad), useNativeDriver: false }),
    ]).start(({ finished }) => finished && onPoured());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pouring]);

  useEffect(() => {
    if (!bump) return;
    nudge.setValue(1);
    Animated.spring(nudge, { toValue: 0, friction: 4, tension: 160, useNativeDriver: false }).start();
  }, [bump, nudge]);

  const slitTop = topInset + 10;
  const frontTop = slitTop + SLIT;
  const frontH = height - frontTop - FRAME;
  const inner = width - (GUTTER + FRAME) * 2;
  const frontShift = Animated.add(
    open.interpolate({ inputRange: [0, 1], outputRange: [0, OPEN] }),
    nudge.interpolate({ inputRange: [0, 1], outputRange: [0, 3] }),
  );

  return (
    <View style={{ width, height }}>
      <View style={[styles.frame, { top: -CLIP, left: GUTTER, right: GUTTER, bottom: 0, backgroundColor: ui.drawerFrame }]} />
      {/* 틈 안쪽: 앞판이 당겨지면 이만큼 더 드러난다 */}
      <View style={[styles.slit, { top: slitTop, left: GUTTER + FRAME, right: GUTTER + FRAME, height: SLIT + OPEN, backgroundColor: ui.drawerSlit }]}>
        <View style={styles.slitShade} />
      </View>
      {filled ? (
        <View pointerEvents="none" style={[styles.corner, { top: slitTop - 7, left: GUTTER + FRAME + inner * 0.68, backgroundColor: paper }]} />
      ) : null}

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="서랍 열어보기"
        style={{ position: 'absolute', top: frontTop, left: GUTTER + FRAME, width: inner, height: frontH }}
      >
        <Animated.View
          style={[
            styles.front,
            {
              backgroundColor: ui.drawerFront,
              transform: [{ translateY: frontShift }, { scale: open.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: ui.drawerSlit }]} />
        </Animated.View>
      </Pressable>

      {/* 쏟아지는 종이: 틈에서 튀어나와 메모 영역 쪽으로 흩어진다 */}
      {flights.map((f, i) => {
        const p = pour.interpolate({ inputRange: [i * 0.08, Math.min(1, i * 0.08 + 0.7)], outputRange: [0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.sheet,
              {
                top: slitTop,
                left: width / 2 - 22,
                backgroundColor: paper,
                opacity: p.interpolate({ inputRange: [0, 0.05, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, f.dx * width] }) },
                  { translateY: p.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, -14, height * f.dy] }) },
                  { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${f.spin}deg`] }) },
                  { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', borderRadius: 10 },
  slit: { position: 'absolute', overflow: 'hidden' },
  // 틈 위쪽 가장자리에 고이는 안쪽 그림자
  slitShade: { height: 2, backgroundColor: '#000', opacity: 0.35 },
  corner: { position: 'absolute', width: 30, height: 30, transform: [{ rotate: '-38deg' }], borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' },
  front: { flex: 1, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  handle: { width: 46, height: 4, borderRadius: 2, opacity: 0.55 },
  sheet: { position: 'absolute', width: 44, height: 54, borderRadius: 2, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4 },
});
