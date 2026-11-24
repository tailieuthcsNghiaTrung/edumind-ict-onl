// Procedural Web Audio API sound effects (zero external file dependencies)

let audioCtx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function setSoundMuted(next: boolean) {
  muted = next;
}

export function isSoundMuted(): boolean {
  return muted;
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.12,
  delay = 0
) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playCorrectSound() {
  playTone(523.25, 0.12, 'triangle', 0.14, 0);
  playTone(659.25, 0.12, 'triangle', 0.14, 0.08);
  playTone(783.99, 0.2, 'triangle', 0.15, 0.16);
}

export function playWrongSound() {
  playTone(260, 0.15, 'sawtooth', 0.08, 0);
  playTone(195, 0.22, 'sawtooth', 0.08, 0.12);
}

export function playJumpSound() {
  playTone(360, 0.09, 'sine', 0.11, 0);
  playTone(540, 0.12, 'sine', 0.11, 0.06);
}

export function playBoostSound() {
  playTone(440, 0.1, 'triangle', 0.12, 0);
  playTone(587.33, 0.1, 'triangle', 0.12, 0.06);
  playTone(880, 0.22, 'triangle', 0.14, 0.12);
}

export function playHarvestSound() {
  playTone(587.33, 0.1, 'sine', 0.12, 0);
  playTone(739.99, 0.1, 'sine', 0.12, 0.07);
  playTone(880, 0.12, 'sine', 0.12, 0.14);
  playTone(1174.66, 0.22, 'sine', 0.13, 0.21);
}

export function playVictorySound() {
  playTone(523.25, 0.12, 'triangle', 0.14, 0);
  playTone(659.25, 0.12, 'triangle', 0.14, 0.1);
  playTone(783.99, 0.14, 'triangle', 0.14, 0.2);
  playTone(1046.5, 0.32, 'triangle', 0.16, 0.32);
}
