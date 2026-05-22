import { useEffect } from 'react';

export function ToastMessage({ message, onClose, tone = 'info' }) {
  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      onClose?.();
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) {
    return null;
  }

  const role = tone === 'error' ? 'alert' : 'status';

  return (
    <div className={`toast-message toast-message--${tone}`} role={role}>
      {message}
    </div>
  );
}
