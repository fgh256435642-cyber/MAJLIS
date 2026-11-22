import type { NotificationSoundId } from '../types/majlis';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx?.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

let ringtoneInterval: number | null = null;

export function playRingtone() {
  if (ringtoneInterval) return;
  const playOneBurst = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(480, now + 0.12);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  };

  playOneBurst();
  ringtoneInterval = window.setInterval(playOneBurst, 1800);
}

export function stopRingtone() {
  if (ringtoneInterval) {
    window.clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
}

export interface ChimeOptions {
  preset?: NotificationSoundId;
  volume?: number; // 0..100
}

export function playChime(
  type: 'message' | 'join' | 'leave' | 'mute' | 'call_end',
  options?: ChimeOptions
) {
  const preset = options?.preset ?? 'classic';
  if (type === 'message' && preset === 'none') return;

  const volScale = Math.max(0, Math.min(1, (options?.volume ?? 80) / 100));
  if (volScale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'message') {
    if (preset === 'chime') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(783.99, now + 0.06);
      gain.gain.setValueAtTime(0.07 * volScale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (preset === 'pop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.05);
      gain.gain.setValueAtTime(0.08 * volScale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (preset === 'bell') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, now);
      gain.gain.setValueAtTime(0.06 * volScale, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.32);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.06 * volScale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    }
  } else if (type === 'join') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(554.37, now + 0.07);
    gain.gain.setValueAtTime(0.06 * volScale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.18);
  } else if (type === 'leave' || type === 'call_end') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(554.37, now);
    osc.frequency.setValueAtTime(392, now + 0.07);
    gain.gain.setValueAtTime(0.06 * volScale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.18);
  } else {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, now);
    gain.gain.setValueAtTime(0.05 * volScale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.start(now);
    osc.stop(now + 0.08);
  }
}
