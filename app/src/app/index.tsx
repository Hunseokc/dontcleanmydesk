// 첫 화면: 위에는 정면에서 본 얕은 서랍 한 칸, 넉넉한 간격 아래로 메모 목록.
// 책상을 그리지 않고 배경색과 간격만으로 서랍과 작업 공간을 나눈다.
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Composer } from '@/collect/Composer';
import { Drawer, slitY } from '@/collect/Drawer';
import { FlyingPaper } from '@/collect/FlyingPaper';
import { MemoCard } from '@/collect/MemoCard';
import { saveIdea, type Attachment } from '@/collect/save';
import { useWebDropAndPaste } from '@/collect/webCollect';
import type { Item } from '@/core/types';
import { sfx } from '@/fx/sfx';
import { useStore } from '@/store/store';
import { themeById } from '@/themes';
import { ItemDetail } from '@/ui/ItemDetail';

const MAX_W = 560;

export default function CollectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // 북마클릿·PWA 공유 대상(share_target)으로 들어온 값
  const params = useLocalSearchParams<{ url?: string; text?: string; title?: string }>();
  const bin = useStore((s) => s.currentBin());
  const items = useStore((s) => s.binItems(bin.id));
  const theme = themeById(bin.themeId);
  const ui = theme.ui;

  const [text, setText] = useState(() => params.url || [params.title, params.text].filter(Boolean).join('\n'));
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [composing, setComposing] = useState(() => !!text);
  const [flights, setFlights] = useState<Item[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [landedCount, setLandedCount] = useState(0);
  const [pouring, setPouring] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const composerRef = useRef<React.ComponentRef<typeof View>>(null);
  const [composerBox, setComposerBox] = useState<{ x: number; y: number } | null>(null);
  // 키보드 단축키 리스너가 오래된 렌더의 값을 붙잡지 않도록 항상 최신 입력을 읽는다
  const latest = useRef({ text, attachments });
  useLayoutEffect(() => {
    latest.current = { text, attachments };
  });

  // 책상에서 돌아오면 서랍은 닫혀 있어야 한다
  useFocusEffect(useCallback(() => setPouring(false), []));

  const onAttach = useCallback((a: Attachment[]) => {
    setAttachments((cur) => [...cur, ...a]);
    setComposing(true);
  }, []);

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
    setLandedCount((n) => n + 1);
    setFlights((f) => f.filter((i) => i.id !== id));
    setPending((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
  }, []);

  const pour = () => {
    setComposing(false);
    setPouring(true);
  };

  const contentW = Math.min(width, MAX_W);
  // 서랍은 화면 위쪽 약 20%
  const drawerH = insets.top + Math.max(110, Math.min(190, height * 0.2));
  const shown = items.filter((i) => !pending.has(i.id));

  return (
    <View style={[styles.root, { backgroundColor: ui.sheet }]}>
      <View style={[styles.top, { backgroundColor: ui.drawerArea, borderBottomColor: ui.line }]}>
        <Drawer
          width={contentW}
          height={drawerH}
          topInset={insets.top}
          filled={items.length > 0}
          pouring={pouring}
          onPoured={() => router.push('/desk')}
          onPress={pour}
          bump={landedCount}
          ui={ui}
          paper={theme.paper.memo}
        />
        <Pressable onPress={pour} style={styles.pourBtn} hitSlop={8}>
          <Text style={[styles.pourText, { color: ui.ink }]}>서랍 열어보기</Text>
        </Pressable>
      </View>

      <View style={[styles.memos, { width: contentW, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={[styles.headerText, { color: ui.ink }]}>메모</Text>
          <Pressable
            onPress={() => setComposing((c) => !c)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={composing ? '작성 닫기' : '메모 쓰기'}
          >
            <Text style={[styles.plus, { color: ui.ink }]}>{composing ? '×' : '+'}</Text>
          </Pressable>
        </View>

        {composing ? (
          <View
            ref={composerRef}
            style={styles.composer}
            onLayout={() => composerRef.current?.measureInWindow((x, y, w, h) => setComposerBox({ x: x + w / 2, y: y + h * 0.3 }))}
          >
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
        ) : null}

        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <MemoCard item={item} onPress={() => setOpenId(item.id)} ui={ui} />}
          ListEmptyComponent={<Text style={[styles.empty, { color: ui.inkSoft }]}>서랍이 비어 있어요. + 를 눌러 첫 메모를 넣어 보세요.</Text>}
        />
      </View>

      {flights.map((it) => (
        <FlyingPaper
          key={it.id}
          item={it}
          from={composerBox ?? { x: width / 2, y: height * 0.6 }}
          // 종이는 서랍 틈으로 빨려 들어간다
          to={{ x: width / 2, y: slitY(insets.top) }}
          durationMs={theme.motion.throwMs}
          onDone={landed}
        />
      ))}

      {openId ? <ItemDetail itemId={openId} onClose={() => setOpenId(null)} ui={ui} /> : null}

      {dragging ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.drop]}>
          <Text style={styles.dropText}>여기에 놓으면 서랍으로 들어가요</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', alignItems: 'center' },
  // 쏟아지는 종이가 메모 영역 위로 겹쳐 보이도록 위에 둔다
  top: { alignSelf: 'stretch', alignItems: 'center', zIndex: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  pourBtn: { paddingTop: 14, paddingBottom: 16 },
  pourText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  // 서랍 아래 넉넉한 여백 자체가 서랍장과 작업 공간의 경계다
  memos: { flex: 1, paddingTop: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10 },
  headerText: { fontSize: 15, fontWeight: '700' },
  plus: { fontSize: 24, lineHeight: 26, fontWeight: '300' },
  composer: { height: 230, marginHorizontal: 16, marginBottom: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 13 },
  drop: { backgroundColor: 'rgba(196,98,45,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderStyle: 'dashed', borderColor: '#c4622d' },
  dropText: { fontSize: 20, fontWeight: '700', color: '#5a2a10' },
});
