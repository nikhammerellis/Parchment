import { useEffect, useState } from 'react';
import { usePdfStore } from '../state/pdfStore';

export function Toast(): JSX.Element {
  const toast = usePdfStore((s) => s.toast);
  const dismissToast = usePdfStore((s) => s.dismissToast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const delay = toast.duration ?? (toast.isError ? 5000 : 2200);
    const timer = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(() => dismissToast(toast.id), 200);
    }, delay);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, [toast, dismissToast]);

  const isError = toast?.isError ?? false;
  const text = toast ? (isError ? `Error: ${toast.text}` : toast.text) : '';
  const className = [visible ? 'show' : '', isError ? 'error' : ''].filter(Boolean).join(' ');

  return (
    <div
      id="toast"
      className={className}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {text}
    </div>
  );
}
