// Short tones made with Web Audio, so there are no sound files to ship.
// Call unlockAudio() from a click handler first (browsers block audio until then).

let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, start: number, length: number, volume = 0.25) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.05);
}

/** Soft tick when a rep or hold is counted. */
export function playRep() {
  tone(880, 0, 0.15, 0.15);
}

/** Clear beep for the walk's turn-around point. */
export function playBeep() {
  tone(660, 0, 0.25);
  tone(660, 0.3, 0.25);
}

/** Two quick rising notes when a thumbs-up is accepted. */
export function playConfirm() {
  tone(784, 0, 0.15);
  tone(1047, 0.12, 0.25);
}

/** Rising arpeggio when a routine is complete. */
export function playSuccess() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.15, 0.4));
}
