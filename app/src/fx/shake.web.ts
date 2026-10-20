// 흔들기로 뒤지기. 모바일 브라우저의 devicemotion 을 쓴다(iOS 는 첫 탭에서 권한을 요청한다).
import { useEffect } from 'react';

export function useShake(onShake: () => void) {
  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;
    let lastFire = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      const now = Date.now();
      if (mag > 24 && now - lastFire > 1500) {
        lastFire = now;
        onShake();
      }
    };
    const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    const askOnce = () => void DM.requestPermission?.().catch(() => {});
    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('pointerdown', askOnce, { once: true });
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('pointerdown', askOnce);
    };
  }, [onShake]);
}
