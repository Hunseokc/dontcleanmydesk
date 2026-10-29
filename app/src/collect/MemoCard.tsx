// 서랍 아래 메모 목록의 카드 한 장. 찢어진 테두리는 몇 장에만, 아래 모서리 일부에만 작게 넣는다.
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { domainOf } from '@/core/classify';
import { hashString } from '@/core/random';
import { ITEM_TYPE_LABEL, type Item } from '@/core/types';
import { useResolved } from '@/store/refs';
import type { ThemeManifest } from '@/themes/types';

const TOOTH = 4;

/** 아래 모서리 일부를 메모 영역 바탕색 삼각형으로 파내서 찢긴 자국을 낸다 */
function TornEdge({ seed, color }: { seed: number; color: string }) {
  const teeth = 7 + (seed % 5);
  return (
    <View pointerEvents="none" style={[styles.torn, { left: `${12 + (seed % 40)}%` }]}>
      {Array.from({ length: teeth }, (_, i) => {
        const h = 2 + ((seed >> i) % 3);
        return <View key={i} style={[styles.tooth, { borderBottomWidth: h, borderBottomColor: color }]} />;
      })}
    </View>
  );
}

export function MemoCard({ item, onPress, ui }: { item: Item; onPress: () => void; ui: ThemeManifest['ui'] }) {
  const thumb = useResolved(item.thumbnail);
  const seed = hashString(item.id);
  const summary = item.type === 'text' ? item.content : item.title ?? item.fileName ?? domainOf(item.sourceUrl) ?? item.content;
  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: ui.panel, borderColor: ui.line }]}>
      {thumb ? <Image source={{ uri: thumb }} style={styles.thumb} /> : null}
      <View style={styles.body}>
        <Text numberOfLines={3} style={[styles.text, { color: ui.ink }]}>{summary}</Text>
        <Text style={[styles.meta, { color: ui.inkSoft }]}>
          {ITEM_TYPE_LABEL[item.type]} · {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
      {seed % 5 === 0 ? <TornEdge seed={seed} color={ui.sheet} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  thumb: { width: 44, height: 52, borderRadius: 2 },
  body: { flex: 1, gap: 4 },
  text: { fontSize: 15, lineHeight: 21 },
  meta: { fontSize: 11 },
  torn: { position: 'absolute', bottom: -StyleSheet.hairlineWidth, flexDirection: 'row' },
  tooth: { width: 0, height: 0, borderLeftWidth: TOOTH, borderRightWidth: TOOTH, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
});
