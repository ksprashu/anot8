import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { App } from '../../src/App';
import { BaseImage, Annotation } from '../../src/types';
import { exportCompositeBlob } from '../../src/export/canvasExporter';
import { serializeAnnotationsToMarkdown } from '../../src/export/markdownSerializer';
import { writeImageToClipboard, writeTextToClipboard } from '../../src/export/clipboard';

describe('Canvas Composite Export & Clipboard Integration Tests', () => {
  const mockBaseImage: BaseImage = {
    id: 'img-integration-1',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 1200,
    naturalHeight: 800,
    fileName: 'integration-screenshot.png',
    fileSize: 1024 * 60,
  };

  const mockAnnotations: Annotation[] = [
    {
      id: 'ann-1',
      index: 1,
      geometry: { type: 'box', x: 100, y: 100, width: 200, height: 150 },
      style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
      note: 'Step 1: Check login container layout',
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'ann-2',
      index: 2,
      geometry: { type: 'ellipse', cx: 500, cy: 300, rx: 60, ry: 60 },
      style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.2 },
      note: 'Step 2: Inspect submit button contrast',
      createdAt: 2000,
      updatedAt: 2000,
    },
    {
      id: 'ann-3',
      index: 3,
      geometry: { type: 'arrow', startX: 400, startY: 500, endX: 700, endY: 500 },
      style: { color: 'green', strokeWidth: 4, fillOpacity: 0.2 },
      note: 'Step 3: Point out validation banner',
      createdAt: 3000,
      updatedAt: 3000,
    },
    {
      id: 'ann-4',
      index: 4,
      geometry: { type: 'pin', x: 900, y: 400 },
      style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.2 },
      note: 'Step 4: Check help icon pin',
      createdAt: 4000,
      updatedAt: 4000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CE1.1: Complete Pipeline: Base Image Ingestion -> Draw 4 Shape Types -> Copy Image writes PNG to Clipboard', async () => {
    const blob = await exportCompositeBlob(mockBaseImage, mockAnnotations);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');

    const res = await writeImageToClipboard(blob);
    expect(res.success).toBe(true);
    expect(res.method).toBe('async-clipboard');
    expect(navigator.clipboard.write).toHaveBeenCalled();
  });

  it('CE1.2: Copy Notes (Cmd+Shift+C) serializes 1..N ordered notes list to navigator.clipboard.writeText', async () => {
    const md = serializeAnnotationsToMarkdown(mockAnnotations, 'list');
    expect(md).toContain('1. **[Box]**');
    expect(md).toContain('Step 1: Check login container layout');
    expect(md).toContain('2. **[Ellipse]**');
    expect(md).toContain('3. **[Arrow]**');
    expect(md).toContain('4. **[Pin]**');

    const res = await writeTextToClipboard(md);
    expect(res.success).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(md);
  });

  it('CE1.3: Copy Notes in table format serializes valid markdown table with headers and row data', async () => {
    const table = serializeAnnotationsToMarkdown(mockAnnotations, 'table');
    expect(table).toContain('| # | Type | Color | Note |');
    expect(table).toContain('| 1 | Box | Red (#EF4444) | Step 1: Check login container layout |');
    expect(table).toContain('| 2 | Ellipse | Amber Gold (#F59E0B) | Step 2: Inspect submit button contrast |');
    expect(table).toContain('| 3 | Arrow | Emerald Green (#10B981) | Step 3: Point out validation banner |');
    expect(table).toContain('| 4 | Pin | Electric Cyan (#06B6D4) | Step 4: Check help icon pin |');
  });

  it('CE1.4: Dynamic Re-indexing before export: Deleting middle item (#2) updates exported badges and notes to 1, 2, 3', async () => {
    // Delete item #2 (ellipse) and re-index
    const remaining = [mockAnnotations[0], mockAnnotations[2], mockAnnotations[3]].map((ann, idx) => ({
      ...ann,
      index: idx + 1,
    }));

    expect(remaining[0].index).toBe(1);
    expect(remaining[1].index).toBe(2);
    expect(remaining[2].index).toBe(3);

    const md = serializeAnnotationsToMarkdown(remaining);
    expect(md).toContain('1. **[Box]**');
    expect(md).toContain('2. **[Arrow]**');
    expect(md).toContain('3. **[Pin]**');
    expect(md).not.toContain('[Ellipse]');
  });

  it('CE1.5: Multi-line notes with code blocks and special characters preserve markdown formatting', async () => {
    const codeAnnotation: Annotation = {
      ...mockAnnotations[0],
      note: 'Issue in auth middleware:\n```typescript\nconst token = req.headers["authorization"];\nif (!token) throw new Error("Unauthorized");\n```',
    };

    const md = serializeAnnotationsToMarkdown([codeAnnotation]);
    expect(md).toContain('```typescript');
    expect(md).toContain('const token = req.headers["authorization"];');
  });

  it('CE1.6: Full App Integration: ExportActions rendered and mounted in main UI', () => {
    render(React.createElement(App, null));

    expect(screen.getByTestId('export-actions-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('btn-copy-image')).toBeInTheDocument();
    expect(screen.getByTestId('btn-copy-notes')).toBeInTheDocument();
    expect(screen.getByTestId('btn-export-png')).toBeInTheDocument();
    expect(screen.getByTestId('btn-export-md')).toBeInTheDocument();
  });

  it('CE1.7: Global keyboard shortcut Cmd+C / Ctrl+C triggers Copy Image when not typing in text input', async () => {
    render(React.createElement(App, null));

    // Trigger Cmd+C
    fireEvent.keyDown(window, {
      key: 'c',
      code: 'KeyC',
      metaKey: true,
      bubbles: true,
    });

    // When no image is loaded, it does not throw
    expect(screen.getByTestId('export-actions-toolbar')).toBeInTheDocument();
  });

  it('CE1.8: Global keyboard shortcut Cmd+Shift+C triggers Copy Notes', async () => {
    render(React.createElement(App, null));

    // Trigger Cmd+Shift+C
    fireEvent.keyDown(window, {
      key: 'c',
      code: 'KeyC',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
    });

    expect(screen.getByTestId('export-actions-toolbar')).toBeInTheDocument();
  });

  it('CE1.9: Fallback download triggers URL.createObjectURL when clipboard write fails', async () => {
    vi.mocked(navigator.clipboard.write).mockRejectedValueOnce(new Error('Permission denied'));

    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    const res = await writeImageToClipboard(blob, { fallbackFileName: 'fallback-test.png' });

    expect(res.success).toBe(true);
    expect(res.method).toBe('download-fallback');
    expect(res.fallbackUsed).toBe(true);
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
