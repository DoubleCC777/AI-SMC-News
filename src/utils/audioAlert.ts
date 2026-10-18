// Web Audio API Synthesizer - Zero External Asset Dependencies

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Plays a modern, crisp 4-chord institutional buy signal chime (D Major 9th)
 */
export function playBuyAlertSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Frequencies: D5 (587.3Hz), F#5 (739.9Hz), A5 (880.0Hz), D6 (1174.6Hz)
    const notes = [
      { freq: 587.33, time: 0.00, duration: 0.45 },
      { freq: 739.99, time: 0.09, duration: 0.50 },
      { freq: 880.00, time: 0.18, duration: 0.55 },
      { freq: 1174.66, time: 0.27, duration: 0.85 }
    ];

    notes.forEach(({ freq, time, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Warm chime waveform
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      // Attack and exponential smooth decay
      gain.gain.setValueAtTime(0.0001, now + time);
      gain.gain.linearRampToValueAtTime(0.28, now + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + time + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + duration);
    });
  } catch (err) {
    console.warn('[AudioAlert] Web Audio playback failed:', err);
  }
}

/**
 * Quick confirmation sound for test button
 */
export function playTestChime(): void {
  playBuyAlertSound();
}
