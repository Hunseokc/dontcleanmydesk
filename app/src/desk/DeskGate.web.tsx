// 웹: Skia(CanvasKit WASM)는 무거우므로 첫 화면(입력)에서는 받지 않고, 펼치기 화면에 들어올 때 지연 로딩한다.
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

function Loading() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <ActivityIndicator color="#7a4a26" />
      <Text style={styles.text}>통을 엎는 중…</Text>
    </View>
  );
}

export function DeskGate() {
  return <WithSkiaWeb getComponent={() => import('./DeskView')} opts={{ locateFile: (file: string) => `/${file}` }} fallback={<Loading />} />;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#c8915a' },
  text: { color: '#3a2414' },
});
