import { useEffect, useRef } from 'react';
import { usePetStore } from '../stores/petStore';

export function usePetBehavior() {
  const { state, setState, config } = usePetStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPausedRef = useRef(false);

  // Refs to latest values (no stale closures)
  const stateRef = useRef(state);
  const setStateRef = useRef(setState);
  const activityRef = useRef(config.activityLevel);

  stateRef.current = state;
  setStateRef.current = setState;
  activityRef.current = config.activityLevel;

  const getInterval = () => {
    switch (activityRef.current) {
      case 'quiet':
        return 8000 + Math.random() * 12000;
      case 'active':
        return 2000 + Math.random() * 4000;
      default:
        return 4000 + Math.random() * 8000;
    }
  };

  // Core scheduling function (captured once by the initial useEffect)
  const schedule = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (isPausedRef.current) {
        schedule();
        return;
      }
      if (stateRef.current === 'click' || stateRef.current === 'type' || stateRef.current === 'happy') {
        schedule();
        return;
      }
      if (stateRef.current === 'idle' && Math.random() < 0.35) {
        setStateRef.current('walk');
      } else if (stateRef.current === 'walk' && Math.random() < 0.6) {
        setStateRef.current('idle');
      }
      schedule();
    }, getInterval());
  };

  // Init on mount only
  useEffect(() => {
    schedule();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const pause = () => {
    isPausedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const resume = () => {
    isPausedRef.current = false;
    schedule();
  };

  return { state, resume, pause, isPaused: isPausedRef };
}
