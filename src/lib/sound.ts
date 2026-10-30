// Discreet "new order" chime using WebAudio. No external assets.
let ctx: AudioContext | null = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext) as typeof AudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function playChime() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  const notes = [880, 1320]; // A5, E6
  notes.forEach((freq, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, now + i * 0.16);
    g.gain.linearRampToValueAtTime(0.18, now + i * 0.16 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.35);
    o.connect(g).connect(c.destination);
    o.start(now + i * 0.16);
    o.stop(now + i * 0.16 + 0.4);
  });
}
