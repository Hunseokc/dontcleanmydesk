// 카드를 탭하면 구김이 펴지며 열리는 내용. 태그는 여기서 언제든 붙인다(입력 단계에서 강요하지 않는다).
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { domainOf } from '@/core/classify';
import { ITEM_TYPE_LABEL } from '@/core/types';
import { isLocalRef, useResolved } from '@/store/refs';
import { store, useStore } from '@/store/store';
import type { ThemeManifest } from '@/themes/types';
import { setUserThumbnail, setVideoFrameThumbnail } from '@/thumbs/pipeline';

import { MediaView, type MediaHandle } from './MediaView';

const SOURCE_LABEL: Record<string, string> = {
  user: '직접 지정', og: '링크 미리보기', oembed: '임베드', frame: '영상 장면', id3: '앨범 커버',
  waveform: '파형', original: '원본', procedural: '자동 생성',
};

export function ItemDetail({ itemId, onClose, onSendBack, ui }: { itemId: string | null; onClose: () => void; onSendBack?: (id: string) => void; ui: ThemeManifest['ui'] }) {
  const item = useStore((s) => (itemId ? s.items.get(itemId) ?? null : null));
  const file = useResolved(item && isLocalRef(item.content) ? item.content : null);
  const thumb = useResolved(item?.thumbnail);
  const [tag, setTag] = useState('');
  const media = useRef<MediaHandle>(null);

  if (!item) return null;
  const link = item.sourceUrl ?? (item.type !== 'text' && !isLocalRef(item.content) ? item.content : null);

  const addTag = () => {
    const t = tag.trim().replace(/^#/, '');
    if (t && !item.tags.includes(t)) store.updateItem(item.id, { tags: [...item.tags, t] });
    setTag('');
  };

  const pickThumb = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!r.canceled && r.assets[0]) await setUserThumbnail(item.id, r.assets[0].uri);
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: ui.panel }]} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={{ gap: 14, padding: 20 }}>
            <View style={styles.head}>
              <Text style={[styles.kind, { color: ui.inkSoft }]}>
                {ITEM_TYPE_LABEL[item.type]} · {new Date(item.createdAt).toLocaleString()}
              </Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={{ color: ui.inkSoft, fontSize: 18 }}>✕</Text>
              </Pressable>
            </View>

            {item.title ? <Text style={[styles.title, { color: ui.ink }]}>{item.title}</Text> : null}

            {item.type === 'text' ? (
              <Text selectable style={[styles.body, { color: ui.ink }]}>{item.content}</Text>
            ) : item.type === 'image' && (file || link) ? (
              <Image source={{ uri: file ?? link! }} style={styles.image} resizeMode="contain" />
            ) : (item.type === 'video' || item.type === 'music') && file ? (
              <MediaView ref={media} uri={file} kind={item.type === 'video' ? 'video' : 'audio'} poster={thumb} />
            ) : thumb ? (
              <Image source={{ uri: thumb }} style={styles.image} resizeMode="contain" />
            ) : null}

            {link ? (
              <Pressable onPress={() => Linking.openURL(link)} style={[styles.linkBox, { borderColor: ui.inkSoft }]}>
                <Text style={{ color: ui.accent, fontWeight: '600' }}>{domainOf(link)} ↗</Text>
                <Text numberOfLines={1} style={{ color: ui.inkSoft, fontSize: 12 }}>{link}</Text>
              </Pressable>
            ) : null}

            <View style={styles.tags}>
              {item.tags.map((t) => (
                <Pressable key={t} onPress={() => store.updateItem(item.id, { tags: item.tags.filter((x) => x !== t) })} style={[styles.tag, { backgroundColor: ui.background }]}>
                  <Text style={{ color: ui.ink }}>#{t} ✕</Text>
                </Pressable>
              ))}
              <TextInput
                value={tag}
                onChangeText={setTag}
                onSubmitEditing={addTag}
                placeholder="+ 태그"
                placeholderTextColor={ui.inkSoft}
                style={[styles.tagInput, { color: ui.ink, borderColor: ui.inkSoft }]}
              />
            </View>

            <View style={styles.thumbRow}>
              {thumb ? <Image source={{ uri: thumb }} style={styles.thumb} /> : null}
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ color: ui.inkSoft, fontSize: 12 }}>얼굴: {SOURCE_LABEL[item.thumbnailSource ?? 'procedural']}</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Button label="이미지로 바꾸기" onPress={pickThumb} ui={ui} />
                  {item.type === 'video' && file && Platform.OS === 'web' ? (
                    <Button label="지금 장면으로" onPress={() => setVideoFrameThumbnail(item.id, media.current?.currentTime() ?? 0)} ui={ui} />
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.actions}>
              {onSendBack ? <Button label="통으로 돌려보내기" onPress={() => { onSendBack(item.id); onClose(); }} ui={ui} /> : null}
              <Button label="버리기" danger onPress={() => { store.deleteItem(item.id); onClose(); }} ui={ui} />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Button({ label, onPress, ui, danger }: { label: string; onPress: () => void; ui: ThemeManifest['ui']; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, { borderColor: danger ? '#b4442e' : ui.inkSoft }]}>
      <Text style={{ color: danger ? '#b4442e' : ui.ink, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(30,15,5,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '90%', borderRadius: 14, overflow: 'hidden' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kind: { fontSize: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 26 },
  image: { width: '100%', height: 320, borderRadius: 8 },
  linkBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, gap: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tagInput: { minWidth: 90, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, fontSize: 14 },
  thumbRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 64, height: 80, borderRadius: 4 },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  btn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
});
