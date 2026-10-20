// 첫 화면 하단 절반 이상: 바로 작성 가능한 공간. 텍스트 즉시 입력, 첨부, 클립보드 링크 제안.
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { classifyText, domainOf } from '@/core/classify';
import { ITEM_TYPE_LABEL } from '@/core/types';
import type { ThemeManifest } from '@/themes/types';

import { attachmentType, type Attachment } from './save';
import { useClipboardLink } from './webCollect';

interface Props {
  text: string;
  onText: (t: string) => void;
  attachments: Attachment[];
  onAttach: (a: Attachment[]) => void;
  onRemove: (i: number) => void;
  onSubmit: () => void;
  ui: ThemeManifest['ui'];
}

function fromPicker(a: { uri: string; mimeType?: string | null; name?: string | null; fileName?: string | null; file?: File }): Attachment {
  return {
    uri: a.uri,
    mime: a.mimeType ?? a.file?.type ?? '',
    name: a.name ?? a.fileName ?? a.file?.name ?? 'file',
    blob: a.file,
  };
}

export function Composer({ text, onText, attachments, onAttach, onRemove, onSubmit, ui }: Props) {
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const clip = useClipboardLink();
  const guess = text.trim() ? classifyText(text) : null;
  const canSave = !!text.trim() || attachments.length > 0;

  useEffect(() => {
    // 앱을 켜면 바로 쓸 수 있게
    const t = setTimeout(() => input.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const pickMedia = async (kind: 'images' | 'videos') => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind], allowsMultipleSelection: true, quality: 1 });
    if (!r.canceled) onAttach(r.assets.map(fromPicker));
  };
  const pickFile = async (type: string) => {
    const r = await DocumentPicker.getDocumentAsync({ type, multiple: true, copyToCacheDirectory: true });
    if (!r.canceled) onAttach(r.assets.map(fromPicker));
  };

  return (
    <View style={[styles.panel, { backgroundColor: ui.panel }]}>
      {clip.link && clip.link !== text.trim() ? (
        <View style={[styles.suggest, { backgroundColor: ui.background }]}>
          <Text numberOfLines={1} style={{ color: ui.ink, flex: 1 }}>
            📋 {domainOf(clip.link)} 링크를 붙여넣을까요?
          </Text>
          <Pressable onPress={() => { onText(clip.link!); clip.dismiss(); }}>
            <Text style={{ color: ui.accent, fontWeight: '700' }}>붙여넣기</Text>
          </Pressable>
          <Pressable onPress={clip.dismiss} hitSlop={8}>
            <Text style={{ color: ui.inkSoft }}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      <TextInput
        ref={input}
        value={text}
        onChangeText={onText}
        multiline
        placeholder="떠오른 걸 그냥 던져 넣으세요. 글, 링크, 사진, 음악, 영상 무엇이든."
        placeholderTextColor={ui.inkSoft}
        style={[styles.input, { color: ui.ink }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
        textAlignVertical="top"
      />

      {attachments.length ? (
        <ScrollView horizontal contentContainerStyle={styles.attachRow} showsHorizontalScrollIndicator={false}>
          {attachments.map((a, i) => {
            const type = attachmentType(a);
            return (
              <View key={a.uri + i} style={[styles.attach, { borderColor: ui.inkSoft }]}>
                {type === 'image' ? <Image source={{ uri: a.uri }} style={styles.attachImg} /> : <Text style={{ fontSize: 22 }}>{type === 'video' ? '🎞' : type === 'music' ? '🎵' : '📄'}</Text>}
                <Text numberOfLines={1} style={[styles.attachName, { color: ui.ink }]}>{a.name}</Text>
                {!type ? <Text style={{ color: '#b4442e', fontSize: 10 }}>지원 안 함</Text> : null}
                <Pressable onPress={() => onRemove(i)} style={styles.attachX} hitSlop={6}>
                  <Text style={{ color: ui.inkSoft }}>✕</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.toolbar}>
        <Tool label="사진" onPress={() => pickMedia('images')} ui={ui} />
        <Tool label="영상" onPress={() => pickMedia('videos')} ui={ui} />
        <Tool label="음악" onPress={() => pickFile('audio/*')} ui={ui} />
        <Tool label="파일" onPress={() => pickFile('*/*')} ui={ui} />
        {clip.canAsk && !clip.link ? <Tool label="📋" onPress={clip.ask} ui={ui} /> : null}
        <View style={{ flex: 1 }} />
        {guess ? <Text style={{ color: ui.inkSoft, fontSize: 12, marginRight: 8 }}>{ITEM_TYPE_LABEL[guess.type]}</Text> : null}
        <Pressable onPress={onSubmit} disabled={!canSave} style={[styles.send, { backgroundColor: canSave ? ui.accent : ui.inkSoft, opacity: canSave ? 1 : 0.4 }]}>
          <Text style={styles.sendText}>통에 던지기</Text>
        </Pressable>
      </View>
      {Platform.OS === 'web' ? <Text style={[styles.hint, { color: ui.inkSoft }]}>Ctrl/⌘ + Enter · 파일은 끌어다 놓거나 붙여넣어도 돼요</Text> : null}
    </View>
  );
}

function Tool({ label, onPress, ui }: { label: string; onPress: () => void; ui: ThemeManifest['ui'] }) {
  return (
    <Pressable onPress={onPress} style={[styles.tool, { borderColor: ui.inkSoft }]}>
      <Text style={{ color: ui.ink, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 10, shadowColor: '#3a1a08', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: -4 } },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  input: { flex: 1, fontSize: 18, lineHeight: 27, minHeight: 120 },
  attachRow: { gap: 8 },
  attach: { width: 96, height: 92, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', padding: 4, gap: 2 },
  attachImg: { width: 60, height: 50, borderRadius: 4 },
  attachName: { fontSize: 10, maxWidth: 86 },
  attachX: { position: 'absolute', top: 2, right: 5 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tool: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  send: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  sendText: { color: '#fff', fontWeight: '700' },
  hint: { fontSize: 11, textAlign: 'right' },
});
