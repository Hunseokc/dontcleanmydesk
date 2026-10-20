// 저장하면 카드가 구겨지며 통으로 떨어진다.
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text } from 'react-native';

import type { Item } from '@/core/types';
import { useResolved } from '@/store/refs';

interface Props {
  item: Item;
  from: { x: number; y: number };
  to: { x: number; y: number };
  durationMs: number;
  onDone: (id: string) => void;
}

const W = 200;
const H = 130;

export function FlyingPaper({ item, from, to, durationMs, onDone }: Props) {
  const [t] = useState(() => new Animated.Value(0));
  const thumb = useResolved(item.thumbnail);
  const [spin] = useState(() => (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random()));

  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: durationMs, easing: Easing.in(Easing.quad), useNativeDriver: false }).start(() => onDone(item.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lift = Math.min(90, Math.abs(from.y - to.y) * 0.3);
  const style = {
    left: t.interpolate({ inputRange: [0, 1], outputRange: [from.x - W / 2, to.x - W / 2] }),
    top: t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [from.y - H / 2, Math.min(from.y, to.y) - lift - H / 2, to.y - H / 2] }),
    borderRadius: t.interpolate({ inputRange: [0, 0.4, 1], outputRange: [10, 60, 100] }),
    transform: [
      { scale: t.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 0.45, 0.2] }) },
      { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0turn', `${spin}turn`] }) },
      { scaleX: t.interpolate({ inputRange: [0, 0.2, 0.4, 1], outputRange: [1, 0.8, 1.05, 1] }) },
    ],
  };

  return (
    <Animated.View pointerEvents="none" style={[styles.paper, { backgroundColor: item.color }, style]}>
      {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} /> : <Text numberOfLines={3} style={styles.text}>{item.content}</Text>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  paper: { position: 'absolute', width: W, height: H, overflow: 'hidden', justifyContent: 'center', padding: 12, shadowColor: '#3a1a08', shadowOpacity: 0.3, shadowRadius: 10 },
  text: { color: '#2b1b10', fontSize: 16 },
});
