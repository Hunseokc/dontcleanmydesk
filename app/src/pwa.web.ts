// 웹 수집 보완: PWA 설치(매니페스트 + 서비스 워커). 설치하면 안드로이드 공유 시트(share_target)에도 뜬다.
export function setupPwa() {
  if (typeof document === 'undefined') return;
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.webmanifest';
    document.head.appendChild(link);
  }
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}
