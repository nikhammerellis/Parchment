import { useEffect } from 'react';
import { usePdfStore } from '../state/pdfStore';

const IDLE_DELAY_MS = 600;

export function useFocusModeIdle(): void {
  const focusMode = usePdfStore((s) => s.focusMode);

  useEffect(() => {
    if (!focusMode) {
      document.body.classList.remove('idle');
      return;
    }
    let timer: number | null = null;
    const reset = (): void => {
      if (timer !== null) window.clearTimeout(timer);
      document.body.classList.remove('idle');
      timer = window.setTimeout(() => document.body.classList.add('idle'), IDLE_DELAY_MS);
    };
    reset();
    const events: Array<keyof DocumentEventMap> = ['mousemove', 'keydown', 'wheel', 'focusin'];
    events.forEach((e) => document.addEventListener(e, reset, { passive: true }));
    return (): void => {
      if (timer !== null) window.clearTimeout(timer);
      events.forEach((e) => document.removeEventListener(e, reset));
      document.body.classList.remove('idle');
    };
  }, [focusMode]);
}
