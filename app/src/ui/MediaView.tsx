// 모바일: 재생기는 모바일 단계에서 expo-video / expo-audio 로 붙인다. 지금은 썸네일 + 외부 열기.
import type { Ref } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';

export interface MediaHandle {
  currentTime(): number;
}

export function MediaView({ uri, poster }: { uri: string; kind: 'video' | 'audio'; poster?: string | null; ref?: Ref<MediaHandle> }) {
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      {poster ? <Image source={{ uri: poster }} style={{ width: 220, height: 220, borderRadius: 8 }} /> : null}
      <Pressable onPress={() => Linking.openURL(uri)}>
        <Text style={{ textDecorationLine: 'underline' }}>재생하기</Text>
      </Pressable>
    </View>
  );
}
