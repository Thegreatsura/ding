import type { ToastType } from './types';

/**
 * A tiny built-in synth: soft mallet tones from sine partials, no audio files. Off by default.
 * Browsers keep audio locked until a user gesture, so the first sound must follow a click or key press.
 */
let ctx: AudioContext | undefined;

// [frequency Hz, start offset s, level]. Rising = good news, falling = bad news.
const CUES: Partial<Record<ToastType, [number, number, number][]>> = {
  success: [[392, 0, 1], [523.3, 0.1, 1]],
  error: [[233.1, 0, 1], [185, 0.13, 1]],
  warning: [[349.2, 0, 0.8], [349.2, 0.16, 0.6]],
  info: [[466.2, 0, 0.9]],
};

// Soft mallet: a warm low tone with a faint octave, no sharp overtones. Slightly off-pitch each time, like a real strike.
function tone(c: AudioContext, out: AudioNode, freq: number, at: number, level: number) {
  const t = c.currentTime + at;
  const f = freq * (1 + (Math.random() - 0.5) * 0.008);
  for (const [mult, gain, decay] of [[1, 0.6, 0.5], [2, 0.06, 0.15]] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.frequency.value = f * mult;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain * level, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }
}

/** Play the cue for a toast type. Silent for types without one, and wherever Web Audio is missing or still locked. */
export function chime(type: ToastType, volume = 0.5): void {
  const cue = CUES[type];
  if (!cue || typeof AudioContext === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (ctx.state === 'closed') return;
    const master = ctx.createGain();
    master.gain.value = Math.min(1, Math.max(0, volume)) * 0.45;
    // rounded off highs, plus one faint echo so it sounds like it happened in a room
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 1300;
    const echo = ctx.createDelay();
    echo.delayTime.value = 0.11;
    const wet = ctx.createGain();
    wet.gain.value = 0.1;
    master.connect(soften);
    soften.connect(ctx.destination);
    soften.connect(echo).connect(wet).connect(ctx.destination);
    for (const [f, at, level] of cue) tone(ctx, master, f, at, level);
  } catch {
    // audio is a nicety: never let it break a toast
  }
}
