import { useEffect, useState } from 'react';

/*
 * Tracks `window.devicePixelRatio` with live updates.
 *
 * `matchMedia("(resolution: {dpr}dppx)")` fires a `change` event whenever the
 * DPR leaves the currently-watched bucket — typically when the window is
 * dragged between monitors with different scaling, or when the OS display
 * scale changes. Each listener only watches one exact DPR value, so we re-arm
 * the listener inside the effect whenever `dpr` changes.
 *
 * Fallback to 1 for headless / non-browser test environments.
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState<number>(() =>
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mm = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = (): void => {
      setDpr(window.devicePixelRatio || 1);
    };
    mm.addEventListener('change', onChange);
    return (): void => {
      mm.removeEventListener('change', onChange);
    };
  }, [dpr]);

  return dpr;
}
