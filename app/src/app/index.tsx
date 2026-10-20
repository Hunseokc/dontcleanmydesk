// 첫 화면: 위에는 통, 아래 절반 이상은 바로 쓸 수 있는 입력 공간.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutRectangle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bin } from '@/collect/Bin';
import { Composer } from '@/collect/Composer';
import { FlyingPaper } from '@/collect/FlyingPaper';
import { saveIdea, type Attachment } from '@/collect/save';
import { useWebDropAndPaste } from '@/collect/webCollect';
import type { Item } from '@/core/types';
import { sfx } from '@/fx/sfx';
import { store, useStore } from '@/store/store';
import { themeById } from '@/themes';

export default function CollectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // 북마클릿·PWA 공유 대상(share_target)으로 들어온 값
  const params = useLocalSearchParams<{ url?: string; text?: string; title?: string }>();
  const bin = useStore((s) => s.currentBin());
  const bins = useStore((s) => s.liveBins());
  const items = useStore((s) => s.binItems(bin.id));
  const theme = themeById(bin.themeId);
  const ui = theme.ui;

  const [text, setText] = useState(() => params.url || [params.title, params.text].filter(Boolean).join('\n'));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [flights, setFlights] = useState<Item[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [binBox, setBinBox] = useState<LayoutRectangle | null>(null);
  const [composerBox, setComposerBox] = useState<LayoutRectangle | null>(null);
  const [menu, setMenu] = useState(false);
  // 키보드 단축키 리스너가 오래된 렌더의 값을 붙잡지 않도록 항상 최신 입력을 읽는다
  const latest = useRef({ text, attachments });
  useLayoutEffect(() => {
    latest.current = { text, attachments };
  });

  const onAttach = useCallback((a: Attachment[]) => setAttachments((cur) => [...cur, ...a]), []);

  const submit = useCallback(async () => {
    const { text: t, attachments: a } = latest.current;
    if (!t.trim() && !a.length) return;
    // 입력은 즉시 비운다 — 저장이 끝나기 전에 다음 생각을 바로 쓸 수 있게
    latest.current = { text: '', attachments: [] };
    setText('');
    setAttachments([]);
    if (params.url || params.text) router.setParams({ url: undefined, text: undefined, title: undefined });
    try {
      const saved = await saveIdea(t, a);
      if (saved.length) {
        sfx.crumple();
        setPending((p) => new Set([...p, ...saved.map((i) => i.id)]));
        setFlights((f) => [...f, ...saved]);
      }
    } catch (e) {
      console.warn('[collect] 저장 실패', e);
      setText((cur) => (cur ? cur : t));
      setAttachments((cur) => [...a, ...cur]);
    }
  }, [params.url, params.text, router]);

  const dragging = useWebDropAndPaste(onAttach, submit);

  const landed = useCallback((id: string) => {
    sfx.thud();
    setFlights((f) => f.filter((i) => i.id !== id));
    setPending((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
  }, []);

  const binAreaH = height * 0.4;
  const binW = Math.min(340, width * 0.7);
  const binH = Math.min(binAreaH * 0.66, binW * 0.72);

  return (
    <View style={[styles.root, { backgroundColor: ui.background }]}>
      <View style={[styles.top, { paddingTop: insets.top + 10, height: binAreaH + insets.top }]}>
        <View style={styles.bar}>
          <Pressable onPress={() => setMenu((m) => !m)} style={styles.binName}>
            <Text style={[styles.binText, { color: ui.ink }]}>{bin.name} ▾</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => router.push('/list')} style={styles.barBtn}>
            <Text style={{ color: ui.ink }}>순서 보기</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} style={styles.barBtn}>
            <Text style={{ color: ui.ink }}>설정</Text>
          </Pressable>
        </View>

        <View style={styles.binWrap} onLayout={(e) => setBinBox(e.nativeEvent.layout)}>
          <Bin width={binW} height={binH} items={items} pending={pending} theme={theme} onOpen={() => router.push('/desk')} />
          <Text style={[styles.binHint, { color: ui.inkSoft }]}>{items.length}개 · 눌러서 펼치기 · 아래로 끌어 엎기</Text>
        </View>

        {menu ? (
          <View style={[styles.menu, { backgroundColor: ui.panel, top: insets.top + 48 }]}>
            {bins.map((b) => (
              <Pressable key={b.id} onPress={() => { store.setCurrentBin(b.id); setMenu(false); }} style={styles.menuItem}>
                <Text style={{ color: ui.ink, fontWeight: b.id === bin.id ? '700' : '400' }}>{b.name}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => { setMenu(false); router.push('/settings'); }} style={styles.menuItem}>
              <Text style={{ color: ui.accent }}>+ 새 통 / 관리</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom }]} onLayout={(e) => setComposerBox(e.nativeEvent.layout)}>
        <Composer
          text={text}
          onText={setText}
          attachments={attachments}
          onAttach={onAttach}
          onRemove={(i) => setAttachments((a) => a.filter((_, j) => j !== i))}
          onSubmit={submit}
          ui={ui}
        />
      </View>

      {flights.map((it) => (
        <FlyingPaper
          key={it.id}
          item={it}
          from={{ x: width / 2, y: (composerBox?.y ?? height * 0.6) + (composerBox?.height ?? 300) * 0.3 }}
          // 통은 binWrap 아래쪽(안내 문구 위)에 붙어 있다 → 통 입구 바로 아래로 떨어뜨린다
          to={{ x: width / 2, y: binBox ? binBox.y + binBox.height - 40 - binH * 0.75 : binAreaH * 0.5 }}
          durationMs={theme.motion.throwMs}
          onDone={landed}
        />
      ))}

      {dragging ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.drop]}>
          <Text style={styles.dropText}>여기에 놓으면 통으로 들어가요</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  top: { paddingHorizontal: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  binName: { paddingVertical: 6, paddingRight: 8 },
  binText: { fontSize: 17, fontWeight: '700' },
  barBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  binWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingBottom: 14 },
  binHint: { fontSize: 12 },
  menu: { position: 'absolute', left: 12, minWidth: 180, borderRadius: 10, paddingVertical: 6, zIndex: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12 },
  menuItem: { paddingHorizontal: 14, paddingVertical: 10 },
  bottom: { flex: 1 },
  drop: { backgroundColor: 'rgba(196,98,45,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderStyle: 'dashed', borderColor: '#c4622d' },
  dropText: { fontSize: 20, fontWeight: '700', color: '#5a2a10' },
});
