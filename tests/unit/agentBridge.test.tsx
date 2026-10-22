import { act, render } from '@testing-library/react';
import { AgentSession, decodeSpecHash, encodeSpecHash, looksLikeSpec } from '../../src/bridge/agentSession';
import { AgentBridge } from '../../src/bridge/AgentBridge';
import { appReducer, createInitialState } from '../../src/state/appReducer';
import { AppProvider, useApp, AppContextValue } from '../../src/state/AppContext';
import { ToastProvider } from '../../src/components/export/ToastNotification';
import { RenderBackend } from '../../src/export/canvasExporter';
import { AppAction, AppState } from '../../src/types';

const fakeBackend: RenderBackend = {
  createCanvas: () =>
    ({
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: () => 'data:image/png;base64,EMBEDDED',
    }) as unknown as HTMLCanvasElement,
  loadImage: async () => ({ naturalWidth: 800, naturalHeight: 500, width: 800, height: 500 }) as HTMLImageElement,
};

function createHost() {
  let state: AppState = createInitialState();
  const actions: AppAction[] = [];
  const host = {
    getState: () => state,
    dispatch: (action: AppAction) => {
      actions.push(action);
      state = appReducer(state, action);
    },
    backend: fakeBackend,
  };
  return { host, actions, session: new AgentSession(host) };
}

const SPEC = {
  version: 1,
  image: { source: 'https://example.test/screen.png' },
  frame: { padding: 10 },
  annotations: [
    { id: 'login', type: 'box', x: 100, y: 100, width: 200, height: 50 },
    { type: 'arrow', from: [600, 400], to: '@login.right' },
    { type: 'text', at: [10, 10], text: 'Hi' },
  ],
};

describe('AgentSession', () => {
  it('loads a spec: image, numbered annotations and frame', async () => {
    const { host, session } = createHost();
    const result = await session.loadSpec(SPEC);
    const state = host.getState();
    expect(state.image).toMatchObject({ src: SPEC.image.source, naturalWidth: 800, naturalHeight: 500, fileName: 'screen.png' });
    expect(result.annotations).toEqual([
      { id: 'login', type: 'box', index: 1 },
      { id: 'a1', type: 'arrow', index: 2 },
      { id: 'a2', type: 'text', index: 0 },
    ]);
    expect(state.frame).toEqual({ padding: 10 });
  });

  it('keeps anchors live across apply() while the canvas is untouched', async () => {
    const { host, session } = createHost();
    await session.loadSpec(SPEC);
    const { addedIds } = await session.apply([
      { op: 'update', id: 'login', set: { x: 300 } },
      { op: 'add', annotation: { type: 'pin', at: '@login.top' } },
    ]);
    expect(addedIds).toEqual(['a3']);
    const arrow = host.getState().annotations.find((a) => a.id === 'a1')!;
    expect(arrow.geometry).toMatchObject({ endX: 500, endY: 125 });
    expect((await session.getSpec()).annotations[1]).toMatchObject({ to: '@login.right' });
  });

  it('falls back to a pixel spec after a manual edit', async () => {
    const { host, session } = createHost();
    await session.loadSpec(SPEC);
    host.dispatch({
      type: 'UPDATE_ANNOTATION_GEOMETRY',
      payload: { id: 'login', geometry: { type: 'box', x: 0, y: 0, width: 10, height: 10 } },
    });
    const spec = await session.getSpec();
    expect(spec.annotations[1]).toMatchObject({ type: 'arrow', to: [300, 125] });
    await session.apply([{ op: 'delete', id: 'a2' }]);
    expect(host.getState().annotations.map((a) => a.id)).toEqual(['login', 'a1']);
  });

  it('leaves state untouched when a spec is invalid', async () => {
    const { host, actions, session } = createHost();
    await expect(
      session.loadSpec({ ...SPEC, annotations: [{ type: 'pin', at: '@nope' }] })
    ).rejects.toMatchObject({ issues: [{ path: 'annotations[0].at' }] });
    expect(actions).toEqual([]);
    expect(host.getState().image).toBeNull();
  });

  it('embeds blob: images in getSpec and recognizes them when loaded back', async () => {
    const { host, actions, session } = createHost();
    host.dispatch({
      type: 'SET_IMAGE',
      payload: { id: 'img', src: 'blob:http://x/1', naturalWidth: 800, naturalHeight: 500, fileName: 'a.png', fileSize: 1 },
    });
    const spec = await session.getSpec();
    expect(spec.image.source).toBe('data:image/png;base64,EMBEDDED');
    const image = host.getState().image;
    actions.length = 0;
    await session.loadSpec({ ...spec, annotations: [{ type: 'box', x: 1, y: 1, width: 5, height: 5 }] });
    expect(actions.map((a) => a.type)).toEqual(['SET_ANNOTATIONS', 'SET_FRAME']);
    expect(host.getState().image).toBe(image);
  });

  it('exposes JSON Schemas and markdown', async () => {
    const { session } = createHost();
    expect(session.schema().spec.type).toBe('object');
    expect(session.schema().ops.type).toBe('array');
    await session.loadSpec({ ...SPEC, annotations: [{ type: 'box', x: 1, y: 1, width: 5, height: 5, note: 'Login form' }] });
    expect(session.markdown()).toContain('Login form');
  });
});

describe('spec hash and detection', () => {
  it('round-trips specs through a base64url hash, including unicode', () => {
    const spec = { ...SPEC, annotations: [{ type: 'text', at: [0, 0], text: 'Café ✓' }] };
    const hash = encodeSpecHash(spec);
    expect(hash).toMatch(/^#spec=[A-Za-z0-9_-]+$/);
    expect(decodeSpecHash(hash)).toEqual(spec);
    expect(decodeSpecHash('#other')).toBeNull();
  });

  it('detects spec-shaped values', () => {
    expect(looksLikeSpec(SPEC)).toBe(true);
    expect(looksLikeSpec({ version: 1 })).toBe(false);
    expect(looksLikeSpec('nope')).toBe(false);
  });
});

describe('AgentBridge', () => {
  it('installs window.annot8 and agent edits are undoable', async () => {
    let app: AppContextValue | null = null;
    const Probe = () => {
      app = useApp();
      return null;
    };
    const { unmount } = render(
      <AppProvider>
        <ToastProvider>
          <AgentBridge />
          <Probe />
        </ToastProvider>
      </AppProvider>
    );
    const session = window.annot8!;
    expect(session).toBeInstanceOf(AgentSession);
    (session as unknown as { host: { backend: RenderBackend } }).host.backend = fakeBackend;

    await act(async () => {
      await session.loadSpec(SPEC);
    });
    await act(async () => {
      await session.apply([
        { op: 'delete', id: 'a2' },
        { op: 'update', id: 'login', set: { x: 0 } },
      ]);
    });
    expect(app!.state.annotations.map((a) => a.id)).toEqual(['login', 'a1']);
    expect(app!.state.annotations[1].geometry).toMatchObject({ endX: 200, endY: 125 });

    act(() => app!.undo());
    expect(app!.state.annotations.map((a) => a.id)).toEqual(['login', 'a1', 'a2']);
    expect(app!.state.annotations[1].geometry).toMatchObject({ endX: 300, endY: 125 });

    unmount();
    expect(window.annot8).toBeUndefined();
  });
});
