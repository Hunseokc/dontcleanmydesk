// 웹 수집 보완: 드래그 앤 드롭, 붙여넣기(이미지 포함), 클립보드 링크 제안, Ctrl/⌘+Enter 저장.
import { useEffect, useState } from 'react';

import { soleUrl } from '@/core/classify';

import type { Attachment } from './save';

function toAttachment(f: File): Attachment {
  return { uri: URL.createObjectURL(f), mime: f.type, name: f.name || 'clipboard', blob: f };
}

export function useWebDropAndPaste(onFiles: (a: Attachment[]) => void, onSubmit: () => void) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      depth++;
      setDragging(true);
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const list = [...(e.dataTransfer?.files ?? [])].map(toAttachment);
      if (list.length) onFiles(list);
    };
    const onPaste = (e: ClipboardEvent) => {
      const list = [...(e.clipboardData?.files ?? [])].map(toAttachment);
      if (list.length) {
        e.preventDefault();
        onFiles(list);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    // RN Web 의 TextInput 은 keydown 전파를 막으므로 캡처 단계에서 받는다
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onFiles, onSubmit]);
  return dragging;
}

/**
 * 클립보드에 링크가 있으면 붙여넣기를 제안한다.
 * 브라우저는 권한 없이 클립보드를 못 읽으므로, 이미 허용된 경우에만 조용히 확인하고
 * 아니면 "클립보드 확인" 버튼(사용자 제스처)으로 읽는다.
 */
export function useClipboardLink() {
  const [link, setLink] = useState<string | null>(null);
  const [canAsk, setCanAsk] = useState(false);

  const read = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setLink(soleUrl(t));
      setCanAsk(false);
    } catch {
      setCanAsk(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (!navigator.clipboard?.readText) return;
      try {
        const st = await navigator.permissions?.query({ name: 'clipboard-read' as PermissionName });
        if (!alive) return;
        if (st?.state === 'granted') await read();
        else setCanAsk(st?.state !== 'denied');
      } catch {
        // Firefox·Safari 는 이 권한 질의를 지원하지 않는다
        setCanAsk(true);
      }
    };
    void check();
    window.addEventListener('focus', check);
    return () => {
      alive = false;
      window.removeEventListener('focus', check);
    };
  }, []);

  return { link, dismiss: () => setLink(null), canAsk, ask: read };
}
