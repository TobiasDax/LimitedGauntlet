// A short two-tone chime via Web Audio, synthesized rather than an
// audio file — no asset to ship, no CSP concerns, works offline.
// Played as the 10-minutes-remaining warning.
export function playChime(): void {
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();

  const tone = (freq: number, startAt: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const t = ctx.currentTime + startAt;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.65, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.start(t);
    osc.stop(t + duration + 0.05);
  };

  tone(880, 0, 0.35);
  tone(1174.66, 0.18, 0.45);

  setTimeout(() => ctx.close(), 1200);
}

// Countdown bell played when a round's timer hits zero.
export function playEndChime(): void {
  const audio = new Audio("/sounds/countdown-bell.mp3");
  void audio.play();
}
