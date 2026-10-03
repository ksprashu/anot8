import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';
import { AppProvider } from '../../src/state/AppContext';
import { NotesSidebar } from '../../src/components/sidebar/NotesSidebar';
import { AnnotationDeleteButton } from '../../src/components/canvas/AnnotationDeleteButton';
import { writeCombinedToClipboard } from '../../src/export/clipboard';
import type { Annotation, BaseImage } from '../../src/types';

const image: BaseImage = {
  id: 'image-1',
  src: 'blob:image-1',
  naturalWidth: 1200,
  naturalHeight: 800,
  fileName: 'screen.png',
  fileSize: 1000,
};

const annotation = (id: string, geometry: Annotation['geometry'], index: number): Annotation => ({
  id,
  index,
  geometry,
  style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
  note: id,
  createdAt: index,
  updatedAt: index,
});

describe('approved audit regressions', () => {
  it('connects the app-level file picker to the replace button', async () => {
    const user = userEvent.setup();
    render(<App initialState={{ image }} />);

    const input = screen.getByTestId('global-image-file-input') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    await user.click(screen.getByTestId('replace-image-btn'));

    expect(click).toHaveBeenCalledOnce();
  });

  it('reorders visible notes by annotation identity when effects are interleaved', async () => {
    const user = userEvent.setup();
    const items = [
      annotation('highlight', { type: 'highlight', x: 0, y: 0, width: 20, height: 20 }, 1),
      annotation('box', { type: 'box', x: 0, y: 0, width: 20, height: 20 }, 2),
      annotation('pin', { type: 'pin', x: 10, y: 10 }, 3),
    ];
    render(
      <AppProvider initialState={{ annotations: items, isSidebarOpen: true }}>
        <NotesSidebar />
      </AppProvider>
    );

    await user.click(screen.getByTestId('btn-move-up-pin'));
    expect(screen.getAllByTestId(/^note-card-(box|pin)$/).map((card) => card.dataset.annotationId))
      .toEqual(['pin', 'box']);
  });

  it('reports an image-only combined clipboard write as a partial fallback', async () => {
    const write = vi.spyOn(navigator.clipboard, 'write');
    write.mockRejectedValueOnce(new Error('multi mime unsupported')).mockResolvedValueOnce(undefined);

    const result = await writeCombinedToClipboard(
      new Blob(['png'], { type: 'image/png' }),
      '# Notes',
      { autoDownloadFallback: false }
    );

    expect(result.fallbackUsed).toBe(true);
    expect(result.partial).toBe('image-only');
  });

  it('lets keyboard users activate the SVG delete control', () => {
    const onDelete = vi.fn();
    render(
      <svg>
        <AnnotationDeleteButton position={{ x: 10, y: 10 }} annotationId="ann-1" onDelete={onDelete} />
      </svg>
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Delete annotation' }), { key: 'Enter' });
    expect(onDelete).toHaveBeenCalledWith('ann-1');
  });
});
