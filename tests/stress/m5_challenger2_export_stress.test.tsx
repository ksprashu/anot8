import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AppProvider } from '../../src/state/AppContext';
import { ExportActions, sanitizeBaseFilename } from '../../src/components/export/ExportActions';
import {
  ToastProvider,
  ToastCard,
  useToast,
  ToastItem,
} from '../../src/components/export/ToastNotification';
import {
  writeImageToClipboard,
  writeTextToClipboard,
  writeCombinedToClipboard,
  isAsyncClipboardSupported,
  isClipboardItemSupported,
  isClipboardWritePermissionGranted,
} from '../../src/export/clipboard';
import {
  serializeAnnotationsToMarkdown,
  serializeToNumberedList,
  serializeToMarkdownTable,
  serializeToFullReport,
  sanitizeFileName,
  generateExportFilename,
} from '../../src/export/markdownSerializer';
import {
  renderCompositeCanvas,
  exportCompositeBlob,
  exportCompositeDataUrl,
  hexToRgba,
  drawRoundRect,
  rasterizeAnnotation,
} from '../../src/export/canvasExporter';
import { BaseImage, Annotation } from '../../src/types';

// Mock 1200x900 base image
const mockBaseImage: BaseImage = {
  id: 'img-m5-stress',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1200,
  naturalHeight: 900,
  fileName: 'dashboard-prod-v2.png',
  fileSize: 154000,
};

function createMockAnnotation(
  id: string,
  index: number,
  type: 'box' | 'ellipse' | 'arrow' | 'pin' = 'box',
  note: string = `Annotation note #${index}`
): Annotation {
  let geometry: any;
  switch (type) {
    case 'ellipse':
      geometry = { type: 'ellipse', cx: 150 + index * 10, cy: 150 + index * 10, rx: 40, ry: 30 };
      break;
    case 'arrow':
      geometry = {
        type: 'arrow',
        startX: 50 + index * 10,
        startY: 50 + index * 10,
        endX: 200 + index * 10,
        endY: 200 + index * 10,
      };
      break;
    case 'pin':
      geometry = { type: 'pin', x: 300 + index * 10, y: 300 + index * 10 };
      break;
    case 'box':
    default:
      geometry = { type: 'box', x: 20 + index * 10, y: 20 + index * 10, width: 80, height: 50, borderRadius: 6 };
      break;
  }

  return {
    id,
    index,
    geometry,
    style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.18 },
    note,
    createdAt: 1700000000000 + index * 1000,
    updatedAt: 1700000000000 + index * 1000,
  };
}

describe('Milestone 5 Challenger 2: Adversarial Stress & Resiliency Suite', () => {
  let originalClipboard: any;
  let originalClipboardItem: any;
  let originalExecCommand: any;
  let originalPermissions: any;

  beforeEach(() => {
    vi.clearAllMocks();

    originalClipboard = navigator.clipboard;
    originalClipboardItem = (globalThis as any).ClipboardItem;
    originalExecCommand = document.execCommand;
    originalPermissions = navigator.permissions;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (navigator as any).clipboard = originalClipboard;
    (globalThis as any).ClipboardItem = originalClipboardItem;
    document.execCommand = originalExecCommand;
    (navigator as any).permissions = originalPermissions;
  });

  /* ========================================================================
   * 1. CLIPBOARD PERMISSION DENIAL & FALLBACK RESILIENCY
   * ======================================================================== */
  describe('1. Clipboard Permission Denial & Fallback Resiliency', () => {
    it('handles NotAllowedError on writeImageToClipboard and activates fallback download', async () => {
      vi.mocked(navigator.clipboard.write).mockRejectedValueOnce(
        new DOMException('Permission denied by user', 'NotAllowedError')
      );

      const blob = new Blob(['png-binary-stream'], { type: 'image/png' });
      const result = await writeImageToClipboard(blob, {
        fallbackFileName: 'permission-denied-fallback.png',
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('download-fallback');
      expect(result.fallbackUsed).toBe(true);
      expect(result.error?.message).toContain('Permission denied');
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('falls back to download when ClipboardItem constructor is missing', async () => {
      (globalThis as any).ClipboardItem = undefined;
      expect(isClipboardItemSupported()).toBe(false);

      const blob = new Blob(['png-bytes'], { type: 'image/png' });
      const result = await writeImageToClipboard(blob, {
        fallbackFileName: 'no-clipboard-item.png',
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('download-fallback');
      expect(result.fallbackUsed).toBe(true);
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('falls back to download when navigator.clipboard is entirely undefined', async () => {
      (navigator as any).clipboard = undefined;
      expect(isAsyncClipboardSupported()).toBe(false);

      const blob = new Blob(['png-bytes'], { type: 'image/png' });
      const result = await writeImageToClipboard(blob);

      expect(result.success).toBe(true);
      expect(result.method).toBe('download-fallback');
      expect(result.fallbackUsed).toBe(true);
    });

    it('executes 3-tier text clipboard fallback: Tier 1 (Async) -> Tier 2 (execCommand) -> Tier 3 (Download)', async () => {
      const markdownText = '### Annotation Notes\n1. Check layout';

      // Scenario A: Tier 1 fails, Tier 2 succeeds
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('Async write rejected'));
      document.execCommand = vi.fn().mockReturnValueOnce(true);

      const resTier2 = await writeTextToClipboard(markdownText);
      expect(resTier2.success).toBe(true);
      expect(resTier2.method).toBe('execCommand');
      expect(resTier2.fallbackUsed).toBe(true);
      expect(document.execCommand).toHaveBeenCalledWith('copy');

      // Scenario B: Both Tier 1 and Tier 2 fail -> Tier 3 download activates
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('Async write rejected'));
      document.execCommand = vi.fn().mockReturnValueOnce(false);

      const resTier3 = await writeTextToClipboard(markdownText, { fallbackFileName: 'tier3-notes.md' });
      expect(resTier3.success).toBe(true);
      expect(resTier3.method).toBe('download-fallback');
      expect(resTier3.fallbackUsed).toBe(true);
      expect(URL.createObjectURL).toHaveBeenCalled();

      // Scenario C: autoDownloadFallback is explicitly disabled -> throws error
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('Async write rejected'));
      document.execCommand = vi.fn().mockReturnValueOnce(false);

      await expect(
        writeTextToClipboard(markdownText, { autoDownloadFallback: false })
      ).rejects.toThrow(/Failed to copy text to clipboard/);
    });

    it('handles writeCombinedToClipboard fallback when multi-MIME is rejected', async () => {
      const blob = new Blob(['png-bytes'], { type: 'image/png' });
      const md = '# Full Report';

      // Make write fail on combined multi-MIME and fallback to single image, then fallback to dual download
      vi.mocked(navigator.clipboard.write).mockRejectedValue(new Error('Multi-MIME clipboard write blocked'));

      const result = await writeCombinedToClipboard(blob, md, {
        fallbackFileNameBase: 'combined-test',
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('download-fallback');
      expect(result.fallbackUsed).toBe(true);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(2); // One for PNG, one for MD
    });

    it('handles Permissions API denial and error queries gracefully', async () => {
      // Denied state
      (navigator as any).permissions = {
        query: vi.fn().mockResolvedValue({ state: 'denied' }),
      };
      const grantedDenied = await isClipboardWritePermissionGranted();
      expect(grantedDenied).toBe(false);

      // Throws TypeError (common in Firefox / Safari for clipboard-write query)
      (navigator as any).permissions = {
        query: vi.fn().mockRejectedValue(new TypeError('Unsupported permission name')),
      };
      const grantedFallback = await isClipboardWritePermissionGranted();
      expect(grantedFallback).toBe(true); // Should assume granted as fallback
    });
  });

  /* ========================================================================
   * 2. MARKDOWN TABLE PIPES, NEWLINES & ADVERSARIAL PAYLOADS
   * ======================================================================== */
  describe('2. Markdown Table Pipes, Newlines & Formatting Invariants', () => {
    it('escapes multiple adjacent, leading, and trailing pipe characters in table notes', () => {
      const annWithPipes: Annotation = {
        ...createMockAnnotation('ann-pipes', 1, 'box'),
        note: '|| Key | Value || Row 1 | Row 2 |||',
      };

      const tableMd = serializeToMarkdownTable([annWithPipes]);
      // Pipe chars in note should be escaped as \|
      expect(tableMd).toContain('\\|\\| Key \\| Value \\|\\| Row 1 \\| Row 2 \\|\\|\\|');
      // Table should still have 4 valid columns
      const lines = tableMd.trim().split('\n');
      const dataRow = lines.find((l) => l.startsWith('| 1 |'));
      expect(dataRow).toBeDefined();
    });

    it('converts Windows CRLF and Unix LF newlines to <br> in table rows', () => {
      const annWithNewlines: Annotation = {
        ...createMockAnnotation('ann-newlines', 1, 'ellipse'),
        note: 'Line 1: Issue\r\nLine 2: Proposed fix\nLine 3: Verified in v2.1',
      };

      const tableMd = serializeToMarkdownTable([annWithNewlines]);
      expect(tableMd).toContain('Line 1: Issue<br>Line 2: Proposed fix<br>Line 3: Verified in v2.1');
      // Must not create broken multi-line markdown table rows
      const dataRows = tableMd.split('\n').filter((line) => line.startsWith('| 1 |'));
      expect(dataRows).toHaveLength(1);
    });

    it('indents multi-line notes in numbered list serialization by exactly 3 spaces', () => {
      const annListMulti: Annotation = {
        ...createMockAnnotation('ann-list-multi', 1, 'box'),
        note: 'Primary finding\n- Sub-bullet 1\n- Sub-bullet 2\n\nFinal remark',
      };

      const listMd = serializeToNumberedList([annListMulti]);
      expect(listMd).toContain('1. **[Box]** (`#F59E0B`):\n   Primary finding\n   - Sub-bullet 1\n   - Sub-bullet 2\n   \n   Final remark');
    });

    it('sorts randomly ordered annotations into strict sequential ascending indices', () => {
      const unsorted = [
        createMockAnnotation('ann-9', 9, 'pin'),
        createMockAnnotation('ann-2', 2, 'arrow'),
        createMockAnnotation('ann-50', 50, 'box'),
        createMockAnnotation('ann-1', 1, 'ellipse'),
      ];

      const listMd = serializeToNumberedList(unsorted);
      const idx1 = listMd.indexOf('1. **[Ellipse]**');
      const idx2 = listMd.indexOf('2. **[Arrow]**');
      const idx9 = listMd.indexOf('9. **[Pin]**');
      const idx50 = listMd.indexOf('50. **[Box]**');

      expect(idx1).toBeLessThan(idx2);
      expect(idx2).toBeLessThan(idx9);
      expect(idx9).toBeLessThan(idx50);
    });

    it('generates full comprehensive report with metadata, stats, and custom formatting', () => {
      const annotations = [
        createMockAnnotation('ann-rep-1', 1, 'box', 'First check'),
        createMockAnnotation('ann-rep-2', 2, 'arrow', 'Second check'),
      ];

      const report = serializeToFullReport(annotations, mockBaseImage, {
        format: 'table',
        includeSummaryStats: true,
      });

      expect(report).toContain(`# Annotation Report: ${mockBaseImage.fileName}`);
      expect(report).toContain(`| **Native Resolution** | 1200 × 900 px |`);
      expect(report).toContain(`| **File Size** | 150.4 KB |`);
      expect(report).toContain(`| **Total Annotations** | 2 |`);
      expect(report).toContain(`| # | Type | Color | Note |`);
    });

    it('formats empty notes and empty annotation sets gracefully', () => {
      const emptyNoteAnn = createMockAnnotation('ann-empty', 1, 'box', '   ');
      const listMd = serializeToNumberedList([emptyNoteAnn]);
      expect(listMd).toContain('_No description provided._');

      const emptyListMd = serializeAnnotationsToMarkdown([]);
      expect(emptyListMd).toBe('_No annotations recorded._');
    });
  });

  /* ========================================================================
   * 3. FILENAME SANITIZATION & PATH TRAVERSAL DEFENSE
   * ======================================================================== */
  describe('3. Filename Sanitization & Path Traversal Attack Defense', () => {
    it('strips directory traversal vectors and null bytes', () => {
      const attacks = [
        '../../../../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\cmd.exe',
        'report-\x00-payload.png',
        'nested/subfolder/file.png',
        '../../../test/../../../shadow.png',
      ];

      for (const attack of attacks) {
        const sanitized = sanitizeFileName(attack, 'export', 'png');
        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toContain('/');
        expect(sanitized).not.toContain('\\');
        expect(sanitized).not.toContain('\x00');
        expect(sanitized.endsWith('.png')).toBe(true);
      }
    });

    it('sanitizes OS-forbidden characters and preserves valid extension', () => {
      const forbidden = 'my:screenshot*file<name>?with"quotes|and%percent.png';
      const clean = sanitizeFileName(forbidden, 'export', 'png');
      expect(clean).not.toMatch(/[/\\?%*:|"<>]/);
      expect(clean).toBe('my-screenshot-file-name-with-quotes-and-percent.png');
    });

    it('handles empty, whitespace-only, and dot-only filenames with timestamped fallback', () => {
      const emptyInputs = ['', '   ', '...', '---', '.-.-.'];
      for (const input of emptyInputs) {
        const clean = sanitizeFileName(input, 'fallback', 'png');
        expect(clean).toMatch(/^fallback-\d+\.png$/);
      }
    });

    it('generates export filenames consistently from base image metadata', () => {
      const img1: BaseImage = {
        ...mockBaseImage,
        fileName: 'checkout-v2.modal.png',
      };
      const pngName = generateExportFilename(img1, 'png', 'annotated');
      expect(pngName).toBe('checkout-v2.modal-annotated.png');

      const mdName = generateExportFilename(img1, 'md', 'notes');
      expect(mdName).toBe('checkout-v2.modal-notes.md');

      const nullImgName = generateExportFilename(null, 'png', 'annotated');
      expect(nullImgName).toMatch(/^anot8-export-\d+\.png$/);
    });

    it('sanitizeBaseFilename handles undef and special characters', () => {
      expect(sanitizeBaseFilename(undefined)).toMatch(/^anot8-\d{4}-\d{2}-\d{2}/);
      expect(sanitizeBaseFilename('test file #1 (copy).png')).toBe('test_file__1__copy_');
    });
  });

  /* ========================================================================
   * 4. TOAST DISMISSAL TIMERS, PAUSE-ON-HOVER & BURST LIFECYCLE
   * ======================================================================== */
  describe('4. Toast Dismissal Timers, Pause-on-Hover & Burst Lifecycle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('accurately dismisses toast after exact timer duration (1500ms)', () => {
      const onDismiss = vi.fn();
      const toast: ToastItem = {
        id: 'toast-timer-test',
        type: 'success',
        message: 'Timer test',
        duration: 1500,
        createdAt: Date.now(),
      };

      render(<ToastCard toast={toast} onDismiss={onDismiss} />);

      act(() => {
        vi.advanceTimersByTime(1499);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onDismiss).toHaveBeenCalledWith('toast-timer-test');
    });

    it('maintains remaining time accurately across multiple rapid hover/unhover cycles', () => {
      const onDismiss = vi.fn();
      const toast: ToastItem = {
        id: 'toast-hover-cycles',
        type: 'info',
        message: 'Multi hover toast',
        duration: 4000,
        createdAt: Date.now(),
      };

      render(<ToastCard toast={toast} onDismiss={onDismiss} />);
      const card = screen.getByTestId('toast-item');

      // 1. Advance 1000ms (3000ms remaining)
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // 2. Hover for 2000ms (timer should pause)
      fireEvent.mouseEnter(card);
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      // 3. Unhover and advance 1000ms (2000ms remaining)
      fireEvent.mouseLeave(card);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      // 4. Hover again for 3000ms (timer pauses again)
      fireEvent.mouseEnter(card);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      // 5. Unhover and advance remaining 2000ms -> should dismiss
      fireEvent.mouseLeave(card);
      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(onDismiss).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(onDismiss).toHaveBeenCalledWith('toast-hover-cycles');
    });

    it('handles burst of 20 rapid toast dispatches and clearAllToasts cleanly', () => {
      const TestBurst: React.FC = () => {
        const { success, toasts, clearAllToasts } = useToast();
        return (
          <div>
            <button
              data-testid="btn-burst"
              onClick={() => {
                for (let i = 1; i <= 20; i++) {
                  success(`Toast #${i}`, `Description #${i}`);
                }
              }}
            >
              Dispatch Burst
            </button>
            <button data-testid="btn-clear" onClick={clearAllToasts}>
              Clear All
            </button>
            <span data-testid="toast-count">{toasts.length}</span>
          </div>
        );
      };

      render(
        <ToastProvider>
          <TestBurst />
        </ToastProvider>
      );

      fireEvent.click(screen.getByTestId('btn-burst'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('20');
      expect(screen.getAllByTestId('toast-item')).toHaveLength(20);

      // Clear all
      fireEvent.click(screen.getByTestId('btn-clear'));
      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      expect(screen.queryByTestId('toast-container')).not.toBeInTheDocument();
    });

    it('supports persistent toast when duration is 0', () => {
      const onDismiss = vi.fn();
      const toast: ToastItem = {
        id: 'toast-persistent',
        type: 'warning',
        message: 'Persistent message',
        duration: 0,
        createdAt: Date.now(),
      };

      render(<ToastCard toast={toast} onDismiss={onDismiss} />);

      act(() => {
        vi.advanceTimersByTime(100000);
      });
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  /* ========================================================================
   * 5. EXPORT TOOLBAR RAPID BURST & ASYNC STATE LOCKING
   * ======================================================================== */
  describe('5. Export Toolbar Rapid Burst & Async State Locking', () => {
    it('disables export buttons when image is missing or annotations array is empty', () => {
      const { unmount } = render(
        <AppProvider initialState={{ image: null, annotations: [] }}>
          <ExportActions />
        </AppProvider>
      );

      // No image -> Copy Image, Combined, PNG disabled
      expect(screen.getByTestId('btn-copy-image')).toBeDisabled();
      expect(screen.getByTestId('btn-copy-combined')).toBeDisabled();
      expect(screen.getByTestId('btn-export-png')).toBeDisabled();

      // No annotations -> Copy Notes, MD disabled
      expect(screen.getByTestId('btn-copy-notes')).toBeDisabled();
      expect(screen.getByTestId('btn-export-md')).toBeDisabled();
      unmount();

      // Render fresh instance with image and annotations
      render(
        <AppProvider
          initialState={{
            image: mockBaseImage,
            annotations: [createMockAnnotation('ann-1', 1, 'box')],
          }}
        >
          <ExportActions />
        </AppProvider>
      );

      expect(screen.getByTestId('btn-copy-image')).not.toBeDisabled();
      expect(screen.getByTestId('btn-copy-notes')).not.toBeDisabled();
      expect(screen.getByTestId('btn-copy-combined')).not.toBeDisabled();
      expect(screen.getByTestId('btn-export-png')).not.toBeDisabled();
      expect(screen.getByTestId('btn-export-md')).not.toBeDisabled();
    });

    it('locks toolbar during async export operation and displays spinner', async () => {
      let resolveWrite: (val: any) => void = () => {};
      const pendingWrite = new Promise((res) => {
        resolveWrite = res;
      });

      vi.mocked(navigator.clipboard.write).mockImplementationOnce(() => pendingWrite as any);

      render(
        <ToastProvider>
          <AppProvider
            initialState={{
              image: mockBaseImage,
              annotations: [createMockAnnotation('ann-1', 1, 'box')],
            }}
          >
            <ExportActions />
          </AppProvider>
        </ToastProvider>
      );

      const copyImgBtn = screen.getByTestId('btn-copy-image');
      fireEvent.click(copyImgBtn);

      // Async operation is initiated: spinner appears and button is disabled while busy
      expect(screen.getByTestId('spinner-copy-image')).toBeInTheDocument();
      expect(copyImgBtn).toBeDisabled();

      // Subsequent clicks while busy are blocked
      fireEvent.click(copyImgBtn);
      fireEvent.click(copyImgBtn);

      // Allow composite canvas creation promise to advance to clipboard write
      await vi.waitFor(() => {
        expect(navigator.clipboard.write).toHaveBeenCalledTimes(1);
      });

      // Still locked while pendingWrite is unresolved
      expect(screen.getByTestId('spinner-copy-image')).toBeInTheDocument();

      // Resolve pending clipboard write
      await act(async () => {
        resolveWrite(undefined);
      });

      // Spinner disappears and button is re-enabled cleanly
      expect(screen.queryByTestId('spinner-copy-image')).not.toBeInTheDocument();
      expect(copyImgBtn).not.toBeDisabled();
    });
  });

  /* ========================================================================
   * 6. CANVAS VECTOR RASTERIZATION & HIGH-INDEX BADGE STRESS
   * ======================================================================== */
  describe('6. Canvas Vector Rasterization & High-Index Badge Stress', () => {
    it('converts 3-char and 6-char hex colors to rgba with opacity clamping', () => {
      expect(hexToRgba('#FFF', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
      expect(hexToRgba('#EF4444', 0.2)).toBe('rgba(239, 68, 68, 0.2)');
      expect(hexToRgba('000000', -1)).toBe('rgba(0, 0, 0, 0)');
      expect(hexToRgba('#10B981', 2.0)).toBe('rgba(16, 185, 129, 1)');
    });

    it('renders composite canvas with extreme high index badges (1, 10, 100, 999)', async () => {
      const highIndexAnnotations: Annotation[] = [
        createMockAnnotation('ann-1', 1, 'box'),
        createMockAnnotation('ann-10', 10, 'ellipse'),
        createMockAnnotation('ann-100', 100, 'arrow'),
        createMockAnnotation('ann-999', 999, 'pin'),
      ];

      const canvas = await renderCompositeCanvas(mockBaseImage, highIndexAnnotations);
      expect(canvas).toBeDefined();
      expect(canvas.width).toBe(1200);
      expect(canvas.height).toBe(900);

      const blob = await exportCompositeBlob(mockBaseImage, highIndexAnnotations);
      expect(blob).toBeInstanceOf(Blob);

      const dataUrl = await exportCompositeDataUrl(mockBaseImage, highIndexAnnotations);
      expect(dataUrl).toContain('data:image/png');
    });

    it('safely draws rounded rectangles with fallback arc/lineTo logic', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;

      // Test with roundRect fallback
      (ctx as any).roundRect = undefined;
      expect(() => {
        drawRoundRect(ctx, 10, 10, 100, 50, 8);
        drawRoundRect(ctx, 10, 10, 100, 50, 0);
      }).not.toThrow();
    });

    it('rasterizes all 4 shape types across all 8 preset color definitions without throwing', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 500;
      canvas.height = 500;
      const ctx = canvas.getContext('2d')!;

      const colors: any[] = ['amber', 'red', 'green', 'blue', 'purple', 'magenta', 'cyan', 'gray'];
      const shapes: any[] = ['box', 'ellipse', 'arrow', 'pin'];

      for (let i = 0; i < colors.length; i++) {
        const shapeType = shapes[i % shapes.length];
        const ann = createMockAnnotation(`ann-shape-${i}`, i + 1, shapeType);
        ann.style.color = colors[i];

        expect(() => {
          rasterizeAnnotation(ctx, ann);
        }).not.toThrow();
      }
    });
  });
});
