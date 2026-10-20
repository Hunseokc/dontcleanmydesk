// 웹: 브라우저 기본 video/audio 요소를 그대로 쓴다.
import { useImperativeHandle, useRef, type Ref } from 'react';

export interface MediaHandle {
  currentTime(): number;
}

export function MediaView({ uri, kind, poster, ref }: { uri: string; kind: 'video' | 'audio'; poster?: string | null; ref?: Ref<MediaHandle> }) {
  const el = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  useImperativeHandle(ref, () => ({ currentTime: () => el.current?.currentTime ?? 0 }));
  if (kind === 'audio')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        {poster ? <img src={poster} style={{ width: 180, height: 180, objectFit: 'cover', borderRadius: 8 }} /> : null}
        <audio ref={el} src={uri} controls style={{ width: '100%' }} />
      </div>
    );
  return <video ref={el} src={uri} poster={poster ?? undefined} controls playsInline style={{ width: '100%', maxHeight: '52vh', borderRadius: 8, background: '#000' }} />;
}
