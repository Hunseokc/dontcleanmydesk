// 모바일: 드래그·붙여넣기 대신 공유 시트와 위젯이 수집 경로가 된다(모바일 단계).
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { soleUrl } from '@/core/classify';

import type { Attachment } from './save';

export function useWebDropAndPaste(_onFiles: (a: Attachment[]) => void, _onSubmit: () => void) {
  return false;
}

export function useClipboardLink() {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    // hasUrlAsync 는 iOS 에서 붙여넣기 권한 알림 없이 확인할 수 있다
    const check = async () => {
      if (await Clipboard.hasUrlAsync().catch(() => false)) setLink('');
    };
    void check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => sub.remove();
  }, []);
  return {
    link: link || null,
    dismiss: () => setLink(null),
    canAsk: link === '',
    ask: async () => setLink(soleUrl(await Clipboard.getStringAsync())),
  };
}
