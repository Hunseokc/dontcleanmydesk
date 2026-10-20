// 통 관리, 테마, 동기화, 웹 수집 도구(북마클릿·PWA), 품질.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_URL } from '@/api/client';
import { store, useStore, type Quality } from '@/store/store';
import { disableSync, enableSync, syncNow } from '@/sync/sync';
import { THEMES, themeById } from '@/themes';
import type { ThemeManifest } from '@/themes/types';

type UI = ThemeManifest['ui'];

function Section({ title, children, ui }: { title: string; children: React.ReactNode; ui: UI }) {
  return (
    <View style={[styles.section, { backgroundColor: ui.panel }]}>
      <Text style={[styles.sectionTitle, { color: ui.ink }]}>{title}</Text>
      {children}
    </View>
  );
}

function Btn({ label, onPress, ui, active }: { label: string; onPress: () => void; ui: UI; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.btn, { borderColor: ui.inkSoft, backgroundColor: active ? ui.ink : 'transparent' }]}>
      <Text style={{ color: active ? ui.panel : ui.ink, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bins = useStore((s) => s.liveBins());
  const current = useStore((s) => s.currentBin());
  const settings = useStore((s) => s.settings);
  const ui = themeById(current.themeId).ui;
  const [newBin, setNewBin] = useState('');
  const [code, setCode] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);

  const origin = Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : '';
  const bookmarklet = `javascript:(()=>{window.open('${origin}/?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank')})()`;

  const doSync = async (fn: () => Promise<void>) => {
    setSyncBusy(true);
    setSyncErr(null);
    try {
      await fn();
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: ui.background }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, gap: 14, paddingBottom: insets.bottom + 40 }}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: ui.ink, fontSize: 15 }}>← 돌아가기</Text>
      </Pressable>

      <Section title="통" ui={ui}>
        {bins.map((b) => (
          <View key={b.id} style={styles.binRow}>
            <Pressable onPress={() => store.setCurrentBin(b.id)} style={{ flex: 1 }}>
              <Text style={{ color: ui.ink, fontWeight: b.id === current.id ? '700' : '400' }}>
                {b.id === current.id ? '● ' : '○ '}
                {b.name} <Text style={{ color: ui.inkSoft }}>({store.binItems(b.id).length})</Text>
              </Text>
            </Pressable>
            <View style={styles.wrap}>
              {Object.values(THEMES).map((t) => (
                <Btn key={t.id} label={t.name} active={b.themeId === t.id} onPress={() => store.updateBin(b.id, { themeId: t.id })} ui={ui} />
              ))}
            </View>
          </View>
        ))}
        <View style={styles.inline}>
          <TextInput value={newBin} onChangeText={setNewBin} placeholder="새 통 이름" placeholderTextColor={ui.inkSoft} style={[styles.input, { color: ui.ink, borderColor: ui.inkSoft }]} />
          <Btn
            label="만들기"
            onPress={() => {
              if (!newBin.trim()) return;
              store.setCurrentBin(store.addBin(newBin.trim()).id);
              setNewBin('');
            }}
            ui={ui}
          />
        </View>
      </Section>

      <Section title="동기화 · 백업" ui={ui}>
        <Text style={{ color: ui.inkSoft, fontSize: 13, lineHeight: 19 }}>
          브라우저는 로컬 데이터를 지울 수 있어요. 서버({API_URL})에 백업하고 다른 기기와 맞춥니다.
        </Text>
        {settings.sync ? (
          <>
            <Text style={{ color: ui.ink }}>
              연결 코드 <Text style={{ fontWeight: '700', letterSpacing: 2 }}>{settings.sync.code}</Text> — 다른 기기에서 이 코드를 입력하세요.
            </Text>
            <Text style={{ color: ui.inkSoft, fontSize: 12 }}>
              마지막 동기화: {settings.sync.lastSyncAt ? new Date(settings.sync.lastSyncAt).toLocaleString() : '아직 없음'}
              {settings.sync.error ? `  ·  오류: ${settings.sync.error}` : ''}
            </Text>
            <View style={styles.wrap}>
              <Btn label={syncBusy ? '동기화 중…' : '지금 동기화'} onPress={() => doSync(syncNow)} ui={ui} />
              <Btn label="연결 끊기" onPress={disableSync} ui={ui} />
            </View>
          </>
        ) : (
          <>
            <Btn label={syncBusy ? '연결 중…' : '이 기기로 새로 시작'} onPress={() => doSync(() => enableSync())} ui={ui} />
            <View style={styles.inline}>
              <TextInput value={code} onChangeText={setCode} placeholder="다른 기기의 연결 코드" autoCapitalize="characters" placeholderTextColor={ui.inkSoft} style={[styles.input, { color: ui.ink, borderColor: ui.inkSoft }]} />
              <Btn label="연결" onPress={() => code.trim() && doSync(() => enableSync(code))} ui={ui} />
            </View>
          </>
        )}
        {syncErr ? <Text style={{ color: '#b4442e', fontSize: 12 }}>{syncErr}</Text> : null}
      </Section>

      {Platform.OS === 'web' ? (
        <Section title="어디서든 넣기 (웹)" ui={ui}>
          <Text style={{ color: ui.inkSoft, fontSize: 13, lineHeight: 19 }}>
            • 북마클릿: 아래 링크를 북마크바로 끌어다 두면, 보고 있는 페이지를 바로 통에 넣을 수 있어요.{'\n'}
            • 홈 화면에 추가(PWA)하면 안드로이드 공유 시트에도 나타나요.{'\n'}
            • 파일은 첫 화면에 끌어다 놓거나 붙여넣기(Ctrl/⌘+V) 하면 돼요.
          </Text>
          {/* RN Web 의 Text href 는 <a> 로 렌더링되어 북마크바로 끌 수 있다 */}
          <Text {...({ href: bookmarklet } as object)} style={[styles.bookmarklet, { backgroundColor: ui.accent }]}>
            ＋ 어질러진 방에 넣기
          </Text>
        </Section>
      ) : null}

      <Section title="책상" ui={ui}>
        <Text style={{ color: ui.inkSoft, fontSize: 13 }}>그래픽 품질 (저사양 기기에서는 자동으로 낮춥니다)</Text>
        <View style={styles.wrap}>
          {(['auto', 'high', 'low'] as Quality[]).map((q) => (
            <Btn key={q} label={{ auto: '자동', high: '높음', low: '낮음' }[q]} active={settings.quality === q} onPress={() => store.setSettings({ quality: q })} ui={ui} />
          ))}
        </View>
        <Text style={{ color: ui.inkSoft, fontSize: 13 }}>필터 중 침입자가 굴러 들어오는 간격</Text>
        <View style={styles.wrap}>
          {[6, 12, 30, 60].map((s) => (
            <Btn key={s} label={`${s}초`} active={settings.intruderEverySec === s} onPress={() => store.setSettings({ intruderEverySec: s })} ui={ui} />
          ))}
        </View>
      </Section>

      <Text style={{ color: ui.inkSoft, fontSize: 11, textAlign: 'center' }}>어질러진 방 · 개발 초안 기반 웹 우선 빌드</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: 14, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  binRow: { gap: 6, paddingVertical: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  inline: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  btn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  bookmarklet: { alignSelf: 'flex-start', color: '#fff', fontWeight: '700', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, overflow: 'hidden' },
});
