// 순서 보기: 같은 데이터를 시간순 리스트로. 지원은 하되 기본값은 아니다.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { domainOf } from '@/core/classify';
import { ITEM_TYPE_LABEL, type Item } from '@/core/types';
import { matchesFilter, type DeskFilter } from '@/desk/filter';
import { useResolved } from '@/store/refs';
import { useStore } from '@/store/store';
import { themeById } from '@/themes';
import type { ThemeManifest } from '@/themes/types';
import { FilterChips } from '@/ui/Chips';
import { ItemDetail } from '@/ui/ItemDetail';

function Row({ item, onPress, ui }: { item: Item; onPress: () => void; ui: ThemeManifest['ui'] }) {
  const thumb = useResolved(item.thumbnail);
  const summary = item.type === 'text' ? item.content : item.title ?? item.fileName ?? domainOf(item.sourceUrl) ?? item.content;
  return (
    <Pressable onPress={onPress} style={[styles.row, { backgroundColor: ui.panel }]}>
      {thumb ? <Image source={{ uri: thumb }} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: item.color }]} />}
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={2} style={{ color: ui.ink, fontSize: 15 }}>{summary}</Text>
        <Text style={{ color: ui.inkSoft, fontSize: 12 }}>
          {ITEM_TYPE_LABEL[item.type]} · {new Date(item.createdAt).toLocaleDateString()}
          {item.tags.length ? ' · ' + item.tags.map((t) => '#' + t).join(' ') : ''}
        </Text>
      </View>
    </Pressable>
  );
}

export default function ListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bin = useStore((s) => s.currentBin());
  const items = useStore((s) => s.binItems(bin.id));
  const tags = useStore((s) => s.allTags(bin.id));
  const ui = themeById(bin.themeId).ui;
  const [filter, setFilter] = useState<DeskFilter | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = items.filter(matchesFilter(filter));

  return (
    <View style={[styles.root, { backgroundColor: ui.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={{ color: ui.ink, fontSize: 15 }}>← 돌아가기</Text>
        </Pressable>
        <Text style={[styles.title, { color: ui.ink }]}>{bin.name} · 순서 보기</Text>
      </View>
      <View style={{ height: 40 }}>
        <FilterChips filter={filter} onChange={setFilter} tags={tags} ui={ui} />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => <Row item={item} onPress={() => setOpenId(item.id)} ui={ui} />}
        ListEmptyComponent={<Text style={{ color: ui.inkSoft, textAlign: 'center', marginTop: 40 }}>아직 아무것도 없어요.</Text>}
      />
      {openId ? <ItemDetail itemId={openId} onClose={() => setOpenId(null)} ui={ui} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 12, marginBottom: 6 },
  back: { paddingVertical: 6 },
  title: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 10, alignItems: 'center' },
  thumb: { width: 52, height: 64, borderRadius: 4 },
});
