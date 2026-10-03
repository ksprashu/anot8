import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from '../export/ToastNotification';

/**
 * Registers the service worker and offers a reload when a new version is ready.
 * Updates never apply on their own, so in-progress annotations are not lost.
 */
export const PwaUpdatePrompt: React.FC = () => {
  const toast = useToast();
  // The toast context value changes identity on every render, so read it through a ref.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    const id = toastRef.current.info('A new version of Annot8 is available', {
      description: 'Reload to update. Unsaved annotations will be cleared.',
      duration: 0,
      action: {
        label: 'Reload',
        onClick: () => {
          setNeedRefresh(false);
          // On a first visit no worker controls the page yet: the new one is already active, so just reload.
          if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
            window.location.reload();
            return;
          }
          void updateServiceWorker(true);
        },
      },
    });
    return () => toastRef.current.dismissToast(id);
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
};

export default PwaUpdatePrompt;
