import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { ITEM_TYPE_LABEL, ITEM_TYPES } from '@/core/types';
import type { DeskFilter } from '@/desk/filter';
import type { ThemeManifest } from '@/themes/types';

export function FilterChips({ filter, onChange, tags, ui }: { filter: DeskFilter | null; onChange: (f: DeskFilter | null) => void; tags: string[]; ui: ThemeManifest['ui'] }) {
  const chip = (label: string, active: boolean, onPress: () => void, key: string) => (
    <Pressable key={key} onPress={onPress} style={[styles.chip, { backgroundColor: active ? ui.ink : ui.panel, borderColor: ui.inkSoft }]}>
      <Text style={{ color: active ? ui.panel : ui.ink, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chip('전체', !filter, () => onChange(null), 'all')}
      {ITEM_TYPES.map((t) => chip(ITEM_TYPE_LABEL[t], filter?.type === t, () => onChange(filter?.type === t ? null : { type: t }), t))}
      {tags.slice(0, 12).map((t) => chip('#' + t, filter?.tag === t, () => onChange(filter?.tag === t ? null : { tag: t }), 'tag-' + t))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingHorizontal: 12, alignItems: 'center' },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
});
