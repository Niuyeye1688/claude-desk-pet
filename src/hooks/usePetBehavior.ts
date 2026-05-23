import { useEffect, useRef, useCallback } from 'react';
import { usePetStore } from '../stores/petStore';

export function usePetBehavior() {
  const { state, setState, config } = usePetStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  const isPausedRef = useRef(false);

  stateRef.current = state;

  const getActivityInterval = useCallback(() => {
    switch (config.activityLevel) {
      case 'quiet':
        return 8000 + Math.random() * 12000;
      case 'active':
        return 2000 + Math.random() * 4000;
      default:
        return 4000 + Math.random() * 8000;
    }
  }, [config.activityLevel]);

  const decideNextAction = useCallback(() => {
    if (isPausedRef.current) {
      scheduleNext();
      return;
    }

    if (stateRef.current === 'click' || stateRef.current === 'type' || stateRef.current === 'happy') {
      scheduleNext();
      return;
    }

    const rand = Math.random();
    if (rand < 0.55) {
      setState('idle');
    } else {
      setState('walk');
      // Walk for a short duration then go back to idle
      setTimeout(() => {
        if (stateRef.current === 'walk') {
          setState('idle');
        }
      }, 2000 + Math.random() * 3000);
    }
    scheduleNext();
  }, [setState]);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(decideNextAction, getActivityInterval());
  }, [decideNextAction, getActivityInterval]);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    scheduleNext();
  }, [scheduleNext]);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // Init
  useEffect(() => {
    scheduleNext();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { state, resume, pause, isPaused: isPausedRef };
}
