// 모션·소리: 종이 구기는 소리, 툭 떨어지는 소리. 음원 파일 없이 WebAudio 로 합성한다.
let ctx: AudioContext | null = null;

function audio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBurst(c: AudioContext, at: number, dur: number, freq: number, gain: number) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 0.9;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(c.destination);
  src.start(at);
}

export const sfx = {
  crumple() {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 9; i++) noiseBurst(c, t + i * 0.035 + Math.random() * 0.02, 0.05 + Math.random() * 0.05, 2500 + Math.random() * 3000, 0.18);
  },
  thud() {
    const c = audio();
    if (!c) return;
    noiseBurst(c, c.currentTime, 0.09, 380, 0.5);
  },
  rustle() {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 4; i++) noiseBurst(c, t + i * 0.06, 0.12, 1800 + Math.random() * 1500, 0.08);
  },
};
