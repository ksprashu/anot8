/**
 * Installs window.anot8 for agents driving the browser, and loads specs from a "#spec=" hash,
 * dropped .anot8.json files, or pasted spec JSON. Renders nothing.
 */
import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/export/ToastNotification';
import { SpecError } from '../spec';
import { AgentSession, decodeSpecHash, looksLikeSpec } from './agentSession';
import { dispatchDragReset } from '../hooks/useDragReset';

declare global {
  interface Window {
    anot8?: AgentSession;
  }
}

const MAX_DROPPED_SPEC_BYTES = 10 * 1024 * 1024;

function isSpecFile(file: File | undefined): file is File {
  return Boolean(file && typeof file.text === 'function' && (file.type === 'application/json' || /\.json$/i.test(file.name ?? '')));
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
}

export const AgentBridge: React.FC = () => {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const stateRef = useRef(state);
  stateRef.current = state;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    const session = new AgentSession({
      getState: () => stateRef.current,
      dispatch: (action) => flushSync(() => dispatch(action)),
    });
    window.anot8 = session;

    const loadFromUser = async (spec: unknown, origin: string) => {
      try {
        const { annotations } = await session.loadSpec(spec);
        toastRef.current.success('Loaded Anot8 spec', `${annotations.length} annotations from ${origin}`);
      } catch (err) {
        const detail =
          err instanceof SpecError
            ? err.issues.slice(0, 3).map((i) => `${i.path || '(root)'}: ${i.message}`).join('\n')
            : (err as Error).message;
        toastRef.current.error('Could not load Anot8 spec', detail);
      }
    };

    let hashSpec: unknown = null;
    try {
      hashSpec = decodeSpecHash(window.location.hash);
    } catch (err) {
      toastRef.current.error(
        'Could not read the #spec link',
        err instanceof Error && err.message ? err.message : 'The spec is not valid base64url JSON'
      );
    }
    if (hashSpec !== null) void loadFromUser(hashSpec, 'the link');

    // Capture phase runs before the image drop handlers, which would reject a JSON file.
    const onDrop = (e: DragEvent) => {
      const file = Array.from(e.dataTransfer?.files ?? []).find(isSpecFile);
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      dispatchDragReset();
      if (typeof file.size === 'number' && file.size > MAX_DROPPED_SPEC_BYTES) {
        toastRef.current.error('Could not read spec file', 'Spec file exceeds 10 MB limit');
        return;
      }
      file
        .text()
        .then((text) => loadFromUser(JSON.parse(text), file.name))
        .catch((err: Error) => toastRef.current.error('Could not read spec file', err.message));
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const data = e.clipboardData;
      const text = typeof data?.getData === 'function' ? data.getData('text/plain')?.trim() : undefined;
      if (!text?.startsWith('{')) return;
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        return;
      }
      if (!looksLikeSpec(value)) return;
      e.preventDefault();
      void loadFromUser(value, 'the clipboard');
    };

    window.addEventListener('drop', onDrop, true);
    window.addEventListener('paste', onPaste, true);
    return () => {
      window.removeEventListener('drop', onDrop, true);
      window.removeEventListener('paste', onPaste, true);
      if (window.anot8 === session) delete window.anot8;
    };
  }, [dispatch]);

  return null;
};
