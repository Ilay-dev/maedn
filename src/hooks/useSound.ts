import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'maedn_sound_enabled';

export function useSound() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // ignore storage errors
    }
  }, [enabled]);

  const getContext = useCallback((): AudioContext | null => {
    if (!enabled || typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctxRef.current) {
      ctxRef.current = new AudioCtx();
    }
    if (ctxRef.current.state === 'suspended') {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }, [enabled]);

  const playTone = useCallback(
    (freq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.04) => {
      const ctx = getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    },
    [getContext]
  );

  const playDiceSound = useCallback(() => {
    playTone(300, 0.04, 'triangle', 0.035);
    setTimeout(() => playTone(460, 0.045, 'triangle', 0.03), 40);
  }, [playTone]);

  const playStepSound = useCallback(() => {
    playTone(390, 0.045, 'sine', 0.035);
  }, [playTone]);

  const playCaptureSound = useCallback(() => {
    playTone(200, 0.06, 'triangle', 0.055);
    setTimeout(() => playTone(145, 0.09, 'triangle', 0.05), 55);
  }, [playTone]);

  const playGoalSound = useCallback(() => {
    playTone(587.33, 0.09, 'sine', 0.045);
    setTimeout(() => playTone(880, 0.14, 'sine', 0.05), 80);
  }, [playTone]);

  const playTurnSound = useCallback(() => {
    playTone(520, 0.09, 'sine', 0.035);
  }, [playTone]);

  const playRejectSound = useCallback(() => {
    playTone(165, 0.07, 'triangle', 0.04);
  }, [playTone]);

  const playWinSound = useCallback(() => {
    playTone(523.25, 0.11, 'sine', 0.05);
    setTimeout(() => playTone(659.25, 0.11, 'sine', 0.05), 100);
    setTimeout(() => playTone(783.99, 0.2, 'sine', 0.06), 200);
  }, [playTone]);

  const toggleSound = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  return {
    soundEnabled: enabled,
    toggleSound,
    playDiceSound,
    playStepSound,
    playCaptureSound,
    playGoalSound,
    playTurnSound,
    playRejectSound,
    playWinSound,
  };
}
