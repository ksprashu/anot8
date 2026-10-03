import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../src/components/export/ToastNotification';
import { PwaUpdatePrompt } from '../../src/components/pwa/PwaUpdatePrompt';

const pwa = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(() => Promise.resolve()),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [pwa.needRefresh, pwa.setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: pwa.updateServiceWorker,
  }),
}));

const renderPrompt = () =>
  render(
    <ToastProvider>
      <PwaUpdatePrompt />
    </ToastProvider>
  );

describe('PwaUpdatePrompt', () => {
  beforeEach(() => {
    pwa.needRefresh = false;
    pwa.setNeedRefresh.mockClear();
    pwa.updateServiceWorker.mockClear();
  });

  it('stays silent while no update is waiting', () => {
    renderPrompt();
    expect(screen.queryByText(/new version of Annot8/)).not.toBeInTheDocument();
  });

  it('offers a persistent reload toast and only updates when the user accepts', async () => {
    pwa.needRefresh = true;
    renderPrompt();

    expect(screen.getByText('A new version of Annot8 is available')).toBeInTheDocument();
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByTestId('toast-action-btn'));
    expect(pwa.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
