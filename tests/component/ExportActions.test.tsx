import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ExportActions, sanitizeBaseFilename } from '../../src/components/export/ExportActions';
import { AppProvider, useApp } from '../../src/state/AppContext';
import { ToastProvider } from '../../src/components/export/ToastNotification';
import { BaseImage, Annotation } from '../../src/types';

describe('ExportActions Component Suite', () => {
  const mockBaseImage: BaseImage = {
    id: 'img-1',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 800,
    naturalHeight: 600,
    fileName: 'test-screen.png',
    fileSize: 5000,
  };

  const mockAnnotation: Annotation = {
    id: 'ann-1',
    index: 1,
    geometry: { type: 'box', x: 50, y: 50, width: 100, height: 100 },
    style: { color: 'red', strokeWidth: 4, fillOpacity: 0.18 },
    note: 'Header check',
    createdAt: 1000,
    updatedAt: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const TestWrapper: React.FC<{
    initialImage?: BaseImage | null;
    initialAnnotations?: Annotation[];
    children?: React.ReactNode;
  }> = ({ initialImage = null, initialAnnotations = [], children }) => {
    return (
      <AppProvider>
        <ToastProvider>
          <StateHydrator image={initialImage} annotations={initialAnnotations} />
          {children || <ExportActions />}
        </ToastProvider>
      </AppProvider>
    );
  };

  const StateHydrator: React.FC<{ image: BaseImage | null; annotations: Annotation[] }> = ({
    image,
    annotations,
  }) => {
    const { dispatch } = useApp();
    React.useEffect(() => {
      if (image) {
        dispatch({ type: 'SET_IMAGE', payload: image });
        for (const ann of annotations) {
          dispatch({ type: 'ADD_ANNOTATION', payload: ann });
        }
      } else {
        dispatch({ type: 'CLEAR_IMAGE' });
      }
    }, [image, annotations, dispatch]);

    return null;
  };

  describe('Rendering & Disabled States', () => {
    it('renders toolbar with all 5 export buttons', () => {
      render(<TestWrapper initialImage={mockBaseImage} initialAnnotations={[mockAnnotation]} />);

      expect(screen.getByTestId('export-actions-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('btn-copy-image')).toBeInTheDocument();
      expect(screen.getByTestId('btn-copy-notes')).toBeInTheDocument();
      expect(screen.getByTestId('btn-copy-combined')).toBeInTheDocument();
      expect(screen.getByTestId('btn-export-png')).toBeInTheDocument();
      expect(screen.getByTestId('btn-export-md')).toBeInTheDocument();
    });

    it('disables image-dependent buttons when state.image is null', () => {
      render(<TestWrapper initialImage={null} initialAnnotations={[]} />);

      expect(screen.getByTestId('btn-copy-image')).toBeDisabled();
      expect(screen.getByTestId('btn-copy-notes')).toBeDisabled();
      expect(screen.getByTestId('btn-copy-combined')).toBeDisabled();
      expect(screen.getByTestId('btn-export-png')).toBeDisabled();
      expect(screen.getByTestId('btn-export-md')).toBeDisabled();
    });

    it('disables notes export button when there are no annotations', () => {
      render(<TestWrapper initialImage={mockBaseImage} initialAnnotations={[]} />);

      expect(screen.getByTestId('btn-copy-image')).not.toBeDisabled();
      expect(screen.getByTestId('btn-export-png')).not.toBeDisabled();
      expect(screen.getByTestId('btn-copy-combined')).not.toBeDisabled();
      expect(screen.getByTestId('btn-copy-notes')).toBeDisabled();
      expect(screen.getByTestId('btn-export-md')).toBeDisabled();
    });
  });

  describe('Interactions and Callbacks', () => {
    it('executes custom onCopyImage callback when provided', async () => {
      const mockCopyImage = vi.fn().mockResolvedValue(undefined);
      render(
        <TestWrapper initialImage={mockBaseImage}>
          <ExportActions onCopyImage={mockCopyImage} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('btn-copy-image'));
      await waitFor(() => {
        expect(mockCopyImage).toHaveBeenCalledTimes(1);
      });
    });

    it('executes custom onCopyNotes callback when provided', async () => {
      const mockCopyNotes = vi.fn().mockResolvedValue(undefined);
      render(
        <TestWrapper initialImage={mockBaseImage} initialAnnotations={[mockAnnotation]}>
          <ExportActions onCopyNotes={mockCopyNotes} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('btn-copy-notes'));
      await waitFor(() => {
        expect(mockCopyNotes).toHaveBeenCalledTimes(1);
      });
    });

    it('executes custom onExportPng and onExportMarkdown callbacks', async () => {
      const mockExportPng = vi.fn().mockResolvedValue(undefined);
      const mockExportMd = vi.fn().mockResolvedValue(undefined);

      render(
        <TestWrapper initialImage={mockBaseImage} initialAnnotations={[mockAnnotation]}>
          <ExportActions onExportPng={mockExportPng} onExportMarkdown={mockExportMd} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('btn-export-png'));
      expect(mockExportPng).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('btn-export-md'));
      expect(mockExportMd).toHaveBeenCalledTimes(1);
    });

    it('executes custom onCopyCombined callback', async () => {
      const mockCopyCombined = vi.fn().mockResolvedValue(undefined);

      render(
        <TestWrapper initialImage={mockBaseImage} initialAnnotations={[mockAnnotation]}>
          <ExportActions onCopyCombined={mockCopyCombined} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('btn-copy-combined'));
      expect(mockCopyCombined).toHaveBeenCalledTimes(1);
    });

    it('sanitizeBaseFilename utility derives clean base name', () => {
      expect(sanitizeBaseFilename('my-dashboard.png')).toBe('my-dashboard');
      expect(sanitizeBaseFilename('screen with spaces & special!.jpg')).toBe('screen_with_spaces___special_');
      expect(sanitizeBaseFilename(undefined)).toMatch(/^anot8-\d{4}-\d{2}-\d{2}/);
    });
  });
});
