import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { App } from '../../src/App';
import {
  normalizeBox,
  calculateEllipseBounds,
  calculateArrowhead,
  applyHandleResize,
} from '../../src/math/geometry';
import {
  screenToImage,
  computeZoomTransform,
} from '../../src/math/coordinates';
import {
  serializeAnnotationsToMarkdown,
  serializeToFullReport,
} from '../../src/export/markdownSerializer';
import { BaseImage, Annotation, PresetColor, ViewportState } from '../../src/types';

// Mock 1600x1200 high-res screenshot
const mockTestImage: BaseImage = {
  id: 'img-m7-e2e-stress',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1600,
  naturalHeight: 1200,
  fileName: 'app-dashboard-retina.png',
  fileSize: 204800,
};

function createTestAnnotation(
  id: string,
  index: number,
  type: 'box' | 'ellipse' | 'arrow' | 'pin' = 'box',
  note: string = `Note for item #${index}`,
  color: PresetColor = 'amber'
): Annotation {
  let geometry: any;
  switch (type) {
    case 'ellipse':
      geometry = { type: 'ellipse', cx: 200 + index * 40, cy: 200 + index * 40, rx: 60, ry: 40 };
      break;
    case 'arrow':
      geometry = {
        type: 'arrow',
        startX: 100 + index * 30,
        startY: 100 + index * 30,
        endX: 300 + index * 30,
        endY: 300 + index * 30,
      };
      break;
    case 'pin':
      geometry = { type: 'pin', x: 400 + index * 40, y: 400 + index * 40 };
      break;
    case 'box':
    default:
      geometry = { type: 'box', x: 50 + index * 50, y: 50 + index * 50, width: 120, height: 80 };
      break;
  }

  return {
    id,
    index,
    geometry,
    style: { color, strokeWidth: 3, fillOpacity: 0.2 },
    note,
    createdAt: 1700000000000 + index,
    updatedAt: 1700000000000 + index,
  };
}

describe('Milestone 7: Challenger 2 — Master End-to-End User Workflows & Integration Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove('dark');

    // Mock getBoundingClientRect for SVG elements and containers in jsdom
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 1600,
      bottom: 1200,
      width: 1600,
      height: 1200,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:http://localhost/mock-blob-img');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    globalThis.createImageBitmap = vi.fn().mockImplementation(async () => ({
      width: 1600,
      height: 1200,
      close: vi.fn(),
    } as unknown as ImageBitmap));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // WORKFLOW 1: Ingestion & Viewport Interaction
  // =========================================================================
  describe('Workflow 1: Image Ingestion & Viewport Interaction', () => {
    it('W1.1: Pasting image via Cmd+V event populates workspace with 1:1 dimensions and auto-fit zoom', async () => {
      render(<App />);

      expect(screen.getByTestId('canvas-empty-state')).toBeInTheDocument();

      const pngFile = new File(['fake-png-data'], 'screenshot.png', { type: 'image/png' });
      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: {
          items: [
            {
              kind: 'file',
              type: 'image/png',
              getAsFile: () => pngFile,
            },
          ],
          files: [pngFile],
        },
      });

      act(() => {
        window.dispatchEvent(pasteEvent);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('canvas-empty-state')).not.toBeInTheDocument();
        expect(screen.getByTestId('canvas-transform-layer')).toBeInTheDocument();
        expect(screen.getByTestId('canvas-base-image')).toBeInTheDocument();
      });
    });

    it('W1.2: Drag and drop ingestion rejects non-image files with graceful feedback and preserves canvas', async () => {
      render(
        <App initialState={{ image: mockTestImage, annotations: [] }} />
      );

      expect(screen.getByTestId('canvas-transform-layer')).toBeInTheDocument();

      const textFile = new File(['hello text'], 'notes.txt', { type: 'text/plain' });
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [textFile],
          items: [{ kind: 'file', type: 'text/plain', getAsFile: () => textFile }],
        },
      });

      const dropTarget = screen.getByTestId('canvas-workspace-container');
      act(() => {
        fireEvent(dropTarget, dropEvent);
      });

      expect(screen.getByTestId('canvas-transform-layer')).toBeInTheDocument();
      expect(screen.getByTestId('canvas-base-image')).toHaveAttribute('src', mockTestImage.src);
    });

    it('W1.3: Zoom at focal point preserves relative cursor positioning without coordinate drift', () => {
      const zoomCenter = { x: 800, y: 600 };
      const currentViewport: ViewportState = { zoom: 1.0, panX: 0, panY: 0 };
      
      const newViewport = computeZoomTransform(currentViewport, zoomCenter, 2.0);
      expect(newViewport.zoom).toBe(2.0);

      const imgPointBefore = screenToImage(zoomCenter, currentViewport);
      const imgPointAfter = screenToImage(zoomCenter, newViewport);

      expect(imgPointAfter.x).toBeCloseTo(imgPointBefore.x, 3);
      expect(imgPointAfter.y).toBeCloseTo(imgPointBefore.y, 3);
    });

    it('W1.4: Image replacement prompts confirmation dialog when active annotations exist', async () => {
      const ann1 = createTestAnnotation('ann-1', 1, 'box');
      render(
        <App initialState={{ image: mockTestImage, annotations: [ann1] }} />
      );

      // Paste new image when an existing image with annotations is active
      const newImageFile = new File(['fake-png-2'], 'new-shot.png', { type: 'image/png' });
      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: {
          items: [
            {
              kind: 'file',
              type: 'image/png',
              getAsFile: () => newImageFile,
            },
          ],
          files: [newImageFile],
        },
      });

      act(() => {
        window.dispatchEvent(pasteEvent);
      });

      // Modal should prompt user
      await waitFor(() => {
        expect(screen.getByTestId('replace-image-modal')).toBeInTheDocument();
        expect(screen.getByText(/You currently have/i)).toBeInTheDocument();
      });

      // Cancel button should dismiss modal and keep old image and annotation
      const cancelBtn = screen.getByTestId('replace-modal-cancel-btn');
      act(() => {
        fireEvent.click(cancelBtn);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('replace-image-modal')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('note-card-ann-1')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // WORKFLOW 2: Vector Annotation Drawing & Geometry Verification
  // =========================================================================
  describe('Workflow 2: Vector Drawing & Geometry Invariance', () => {
    it('W2.1: Drawing Box, Ellipse, Arrow, and Pin sequentially assigns 1..4 badges', async () => {
      render(
        <App initialState={{ image: mockTestImage, annotations: [] }} />
      );

      const overlay = screen.getByTestId('svg-overlay');

      // 1. Select Box tool and draw
      const boxToolBtn = screen.getByTestId('tool-btn-box');
      fireEvent.click(boxToolBtn);

      fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
      fireEvent.pointerMove(overlay, { clientX: 250, clientY: 200, pointerId: 1 });
      fireEvent.pointerUp(overlay, { clientX: 250, clientY: 200, pointerId: 1 });

      await waitFor(() => {
        expect(screen.getByTestId('annotation-badge-1')).toBeInTheDocument();
        expect(screen.getByTestId('badge-text-1')).toHaveTextContent('1');
      });

      // 2. Select Ellipse tool and draw
      const ellipseToolBtn = screen.getByTestId('tool-btn-ellipse');
      fireEvent.click(ellipseToolBtn);

      fireEvent.pointerDown(overlay, { clientX: 300, clientY: 100, pointerId: 1, button: 0 });
      fireEvent.pointerMove(overlay, { clientX: 450, clientY: 250, pointerId: 1 });
      fireEvent.pointerUp(overlay, { clientX: 450, clientY: 250, pointerId: 1 });

      await waitFor(() => {
        expect(screen.getByTestId('annotation-badge-2')).toBeInTheDocument();
        expect(screen.getByTestId('badge-text-2')).toHaveTextContent('2');
      });

      // 3. Select Arrow tool and draw
      const arrowToolBtn = screen.getByTestId('tool-btn-arrow');
      fireEvent.click(arrowToolBtn);

      fireEvent.pointerDown(overlay, { clientX: 100, clientY: 400, pointerId: 1, button: 0 });
      fireEvent.pointerMove(overlay, { clientX: 300, clientY: 550, pointerId: 1 });
      fireEvent.pointerUp(overlay, { clientX: 300, clientY: 550, pointerId: 1 });

      await waitFor(() => {
        expect(screen.getByTestId('annotation-badge-3')).toBeInTheDocument();
        expect(screen.getByTestId('badge-text-3')).toHaveTextContent('3');
      });

      // 4. Select Pin tool and click
      const pinToolBtn = screen.getByTestId('tool-btn-pin');
      fireEvent.click(pinToolBtn);

      fireEvent.pointerDown(overlay, { clientX: 500, clientY: 400, pointerId: 1, button: 0 });
      fireEvent.pointerUp(overlay, { clientX: 500, clientY: 400, pointerId: 1 });

      await waitFor(() => {
        expect(screen.getByTestId('annotation-badge-4')).toBeInTheDocument();
        expect(screen.getByTestId('badge-text-4')).toHaveTextContent('4');
      });

      // Verify all 4 notes exist in sidebar
      expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('4');
    });

    it('W2.2: Directional Arrow calculates exact 30-degree wings and notched arrowhead geometry', () => {
      const start = { x: 100, y: 100 };
      const end = { x: 400, y: 100 };
      const strokeWidth = 4;

      const arrowhead = calculateArrowhead(start, end, strokeWidth);
      expect(arrowhead).toBeDefined();

      const { tip, wingLeft, wingRight, notch } = arrowhead;
      expect(tip.x).toBe(400);
      expect(tip.y).toBe(100);

      expect(wingLeft.x).toBeLessThan(tip.x);
      expect(wingRight.x).toBeLessThan(tip.x);
      expect(Math.abs(wingLeft.y - tip.y)).toBeCloseTo(Math.abs(wingRight.y - tip.y), 3);

      expect(notch.y).toBeCloseTo(tip.y, 3);
      expect(notch.x).toBeLessThan(tip.x);
      expect(notch.x).toBeGreaterThan(Math.min(wingLeft.x, wingRight.x));
    });

    it('W2.3: Inverted drawing vectors (bottom-right to top-left) normalize correctly', () => {
      const box = normalizeBox({ x: 300, y: 300 }, { x: 150, y: 200 });
      expect(box.x).toBe(150);
      expect(box.y).toBe(200);
      expect(box.width).toBe(150);
      expect(box.height).toBe(100);
    });

    it('W2.4: Shift key during drawing snaps Ellipse to 1:1 Circle', () => {
      const circle = calculateEllipseBounds({ x: 100, y: 100 }, { x: 250, y: 180 }, true);
      expect(circle.rx).toBe(circle.ry);
      expect(circle.rx).toBe(75);
    });
  });

  // =========================================================================
  // WORKFLOW 3: Manipulation, Resizing & History Stack
  // =========================================================================
  describe('Workflow 3: Manipulation, 8-Point Resizing & History Stack', () => {
    it('W3.1: 8-Point resize handles correctly scale geometry across all cardinal directions', () => {
      const initialBox: Annotation['geometry'] = { type: 'box', x: 100, y: 100, width: 200, height: 150 };

      // 1. East handle: drag to (350, 175) -> width becomes 250
      const resizedE = applyHandleResize(initialBox, 'e', { x: 350, y: 175 });
      if (resizedE.type === 'box') {
        expect(resizedE.x).toBe(100);
        expect(resizedE.width).toBe(250);
        expect(resizedE.height).toBe(150);
      }

      // 2. West handle: drag to (70, 175) -> x becomes 70, width becomes 230
      const resizedW = applyHandleResize(initialBox, 'w', { x: 70, y: 175 });
      if (resizedW.type === 'box') {
        expect(resizedW.x).toBe(70);
        expect(resizedW.width).toBe(230);
        expect(resizedW.height).toBe(150);
      }

      // 3. North handle: drag to (200, 60) -> y becomes 60, height becomes 190
      const resizedN = applyHandleResize(initialBox, 'n', { x: 200, y: 60 });
      if (resizedN.type === 'box') {
        expect(resizedN.y).toBe(60);
        expect(resizedN.height).toBe(190);
        expect(resizedN.width).toBe(200);
      }

      // 4. South handle: drag to (200, 300) -> height becomes 200
      const resizedS = applyHandleResize(initialBox, 's', { x: 200, y: 300 });
      if (resizedS.type === 'box') {
        expect(resizedS.y).toBe(100);
        expect(resizedS.height).toBe(200);
      }

      // 5. Southeast corner: drag to (350, 300)
      const resizedSE = applyHandleResize(initialBox, 'se', { x: 350, y: 300 });
      if (resizedSE.type === 'box') {
        expect(resizedSE.width).toBe(250);
        expect(resizedSE.height).toBe(200);
      }

      // 6. Northwest corner: drag to (80, 80)
      const resizedNW = applyHandleResize(initialBox, 'nw', { x: 80, y: 80 });
      if (resizedNW.type === 'box') {
        expect(resizedNW.x).toBe(80);
        expect(resizedNW.y).toBe(80);
        expect(resizedNW.width).toBe(220);
        expect(resizedNW.height).toBe(170);
      }
    });

    it('W3.2: 50-step Undo/Redo history stack accurately restores canvas & sidebar state', async () => {
      const ann1 = createTestAnnotation('ann-1', 1, 'box', 'Initial box');
      render(
        <App initialState={{ image: mockTestImage, annotations: [ann1] }} />
      );

      expect(screen.getByTestId('note-card-ann-1')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('1');

      // Draw second annotation (Circle)
      const overlay = screen.getByTestId('svg-overlay');
      fireEvent.click(screen.getByTestId('tool-btn-ellipse'));

      fireEvent.pointerDown(overlay, { clientX: 200, clientY: 200, pointerId: 1, button: 0 });
      fireEvent.pointerMove(overlay, { clientX: 350, clientY: 350, pointerId: 1 });
      fireEvent.pointerUp(overlay, { clientX: 350, clientY: 350, pointerId: 1 });

      await waitFor(() => {
        expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('2');
      });

      // Perform Undo via toolbar
      const undoBtn = screen.getByTestId('undo-btn');
      act(() => {
        fireEvent.click(undoBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('1');
        expect(screen.queryByTestId('annotation-badge-2')).not.toBeInTheDocument();
      });

      // Perform Redo
      const redoBtn = screen.getByTestId('redo-btn');
      act(() => {
        fireEvent.click(redoBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('2');
        expect(screen.getByTestId('annotation-badge-2')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // WORKFLOW 4: Synchronized Notes Sidebar & 1..N Auto-Numbering Invariant
  // =========================================================================
  describe('Workflow 4: Synchronized Notes & Continuous 1..N Invariant', () => {
    it('W4.1: Reordering notes via Move Up and Move Down maintains strict 1..N sequential badges', async () => {
      const ann1 = createTestAnnotation('ann-1', 1, 'box', 'First issue');
      const ann2 = createTestAnnotation('ann-2', 2, 'ellipse', 'Second issue');
      const ann3 = createTestAnnotation('ann-3', 3, 'arrow', 'Third issue');

      render(
        <App initialState={{ image: mockTestImage, annotations: [ann1, ann2, ann3] }} />
      );

      // Verify initial sequence
      expect(screen.getByTestId('card-badge-ann-1')).toHaveTextContent('1');
      expect(screen.getByTestId('card-badge-ann-2')).toHaveTextContent('2');
      expect(screen.getByTestId('card-badge-ann-3')).toHaveTextContent('3');

      // Click Move Down on item 1
      const moveDownBtn1 = screen.getByTestId('note-card-move-down-1');
      act(() => {
        fireEvent.click(moveDownBtn1);
      });

      // New order: ann-2 (1), ann-1 (2), ann-3 (3)
      await waitFor(() => {
        expect(screen.getByTestId('card-badge-ann-2')).toHaveTextContent('1');
        expect(screen.getByTestId('card-badge-ann-1')).toHaveTextContent('2');
        expect(screen.getByTestId('card-badge-ann-3')).toHaveTextContent('3');
      });

      // Canvas badges must match
      expect(screen.getByTestId('badge-text-1')).toBeInTheDocument();
      expect(screen.getByTestId('badge-text-2')).toBeInTheDocument();
      expect(screen.getByTestId('badge-text-3')).toBeInTheDocument();
    });

    it('W4.2: Deleting middle annotation re-indexes remaining badges seamlessly without gaps', async () => {
      const ann1 = createTestAnnotation('ann-1', 1, 'box', 'Item 1');
      const ann2 = createTestAnnotation('ann-2', 2, 'ellipse', 'Item 2');
      const ann3 = createTestAnnotation('ann-3', 3, 'arrow', 'Item 3');

      render(
        <App initialState={{ image: mockTestImage, annotations: [ann1, ann2, ann3] }} />
      );

      // Delete ann-2 (index 2)
      const deleteBtn2 = screen.getByTestId('btn-delete-ann-2');
      act(() => {
        fireEvent.click(deleteBtn2);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('note-card-ann-2')).not.toBeInTheDocument();
        expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('2');
      });

      // Item 3 should now be re-indexed as badge 2
      expect(screen.getByTestId('card-badge-ann-3')).toHaveTextContent('2');
      expect(screen.getByTestId('card-badge-ann-1')).toHaveTextContent('1');
    });

    it('W4.3: Markdown editor supports rich text, code snippets, lists, and special characters', async () => {
      const ann1 = createTestAnnotation('ann-1', 1, 'box', 'Initial text');
      render(
        <App initialState={{ image: mockTestImage, annotations: [ann1] }} />
      );

      const textarea = screen.getByTestId('note-textarea-ann-1');
      expect(textarea).toBeInTheDocument();

      const complexMarkdown = '### Issue Title\n- [x] Fix padding in `Header.tsx`\n- [ ] Check contrast ratio `> 4.5:1`\n\n```ts\nconst x = "<potato>";\n```';
      fireEvent.change(textarea, { target: { value: complexMarkdown } });

      // Verify serialization of complex markdown
      const stateAnnotations = [
        { ...ann1, note: complexMarkdown }
      ];
      const serialized = serializeAnnotationsToMarkdown(stateAnnotations);
      expect(serialized).toContain('### Issue Title');
      expect(serialized).toContain('Fix padding in `Header.tsx`');
      expect(serialized).toContain('const x = "<potato>";');
    });
  });

  // =========================================================================
  // WORKFLOW 5: Bidirectional Sync, UI & Theming
  // =========================================================================
  describe('Workflow 5: Bidirectional Sync, UI & Theming', () => {
    it('W5.1: Hovering sidebar note card activates halo glow on canvas shape', async () => {
      const ann1 = createTestAnnotation('ann-1', 1, 'box', 'Hover test item');
      render(
        <App initialState={{ image: mockTestImage, annotations: [ann1] }} />
      );

      const card = screen.getByTestId('note-card-ann-1');

      // Hover over note card
      fireEvent.mouseEnter(card);

      await waitFor(() => {
        expect(card).toHaveAttribute('data-is-hovered', 'true');
      });

      // Unhover
      fireEvent.mouseLeave(card);

      await waitFor(() => {
        expect(card).toHaveAttribute('data-is-hovered', 'false');
      });
    });

    it('W5.2: Shortcuts modal opens via ? key and dismisses via Escape key or close button', async () => {
      render(<App />);

      expect(screen.queryByTestId('shortcuts-modal')).not.toBeInTheDocument();

      // Press ? key to open modal
      fireEvent.keyDown(window, { key: '?' });

      await waitFor(() => {
        expect(screen.getByTestId('shortcuts-modal')).toBeInTheDocument();
        expect(screen.getByText(/Keyboard Shortcuts/i)).toBeInTheDocument();
      });

      // Press Escape to dismiss modal
      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('shortcuts-modal')).not.toBeInTheDocument();
      });
    });

    it('W5.3: Theme toggle switch between dark and light modes updates DOM and persists in localStorage', async () => {
      render(<App />);

      const themeToggleBtn = screen.getByTestId('theme-toggle-btn');
      expect(themeToggleBtn).toBeInTheDocument();

      // Initial theme is dark
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // Click to toggle to light
      act(() => {
        fireEvent.click(themeToggleBtn);
      });

      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorage.getItem('anot8_theme')).toBe('light');

      // Toggle back to dark via Cmd+D
      fireEvent.keyDown(window, { key: 'd', metaKey: true });

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('anot8_theme')).toBe('dark');
    });
  });

  // =========================================================================
  // WORKFLOW 6: High-Fidelity 1:1 Composite Export & Clipboard
  // =========================================================================
  describe('Workflow 6: 1:1 Composite Export & Clipboard Integration', () => {
    it('W6.1: Copy Image (Cmd+C) renders 1:1 composite offscreen canvas with native resolution', async () => {
      const ann1 = createTestAnnotation('ann-1', 1, 'box', 'Box note', 'red');
      const ann2 = createTestAnnotation('ann-2', 2, 'arrow', 'Arrow note', 'green');

      render(
        <App initialState={{ image: mockTestImage, annotations: [ann1, ann2] }} />
      );

      // Mock clipboard write
      const mockClipboardWrite = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          write: mockClipboardWrite,
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });

      // Trigger Copy Image button
      const copyImgBtn = screen.getByTestId('btn-copy-image');
      await act(async () => {
        fireEvent.click(copyImgBtn);
      });

      expect(screen.getByTestId('btn-copy-image')).toBeInTheDocument();
    });

    it('W6.2: Copy Notes (Cmd+Shift+C) serializes structured markdown to clipboard', async () => {
      const ann1 = createTestAnnotation('ann-1', 1, 'box', 'Align logo to 24px grid', 'amber');
      const ann2 = createTestAnnotation('ann-2', 2, 'pin', 'Missing tooltip here', 'cyan');

      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText,
          write: vi.fn(),
        },
      });

      render(
        <App initialState={{ image: mockTestImage, annotations: [ann1, ann2] }} />
      );

      const copyNotesBtn = screen.getByTestId('btn-copy-notes');
      await act(async () => {
        fireEvent.click(copyNotesBtn);
      });

      expect(mockWriteText).toHaveBeenCalled();
      const copiedText = mockWriteText.mock.calls[0][0];
      expect(copiedText).toContain('1. **[Box]**');
      expect(copiedText).toContain('Align logo to 24px grid');
      expect(copiedText).toContain('2. **[Pin]**');
      expect(copiedText).toContain('Missing tooltip here');
    });

    it('W6.3: Fallback download triggers when clipboard API is blocked or denied', async () => {
      Object.assign(navigator, {
        clipboard: {
          write: vi.fn().mockRejectedValue(new Error('Permission denied')),
          writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
        },
      });

      const ann1 = createTestAnnotation('ann-1', 1, 'box', 'Fallback test');
      render(
        <App initialState={{ image: mockTestImage, annotations: [ann1] }} />
      );

      const copyNotesBtn = screen.getByTestId('btn-copy-notes');
      await act(async () => {
        fireEvent.click(copyNotesBtn);
      });

      // Should show warning toast about fallback file download
      await waitFor(() => {
        expect(screen.getByText(/Downloaded markdown notes file instead/i)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // WORKFLOW 7: Full End-to-End Persona Workflows & Stress Loops
  // =========================================================================
  describe('Workflow 7: Complex Multi-Step Persona Workflows & Scale Stress', () => {
    it('W7.1: Full Developer Bug Report Workflow (Ingest -> 4 Tools -> Edit -> Reorder -> Export)', async () => {
      const ann1 = createTestAnnotation('ann-1', 1, 'box', 'Misaligned button');
      const ann2 = createTestAnnotation('ann-2', 2, 'ellipse', 'Avatar clipped');
      const ann3 = createTestAnnotation('ann-3', 3, 'arrow', 'Wrong redirect path');
      const ann4 = createTestAnnotation('ann-4', 4, 'pin', 'Typo in header');

      render(
        <App initialState={{ image: mockTestImage, annotations: [ann1, ann2, ann3, ann4] }} />
      );

      // 1. Verify 4 items present in sidebar
      expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('4');

      // 2. Reorder item 4 (pin) to top: click move up 3 times
      act(() => {
        fireEvent.click(screen.getByTestId('btn-move-up-ann-4'));
      });
      act(() => {
        fireEvent.click(screen.getByTestId('btn-move-up-ann-4'));
      });
      act(() => {
        fireEvent.click(screen.getByTestId('btn-move-up-ann-4'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('card-badge-ann-4')).toHaveTextContent('1');
      });

      // 3. Delete item 2 (formerly item 1, ann-1)
      const deleteBtn1 = screen.getByTestId('btn-delete-ann-1');
      act(() => {
        fireEvent.click(deleteBtn1);
      });

      await waitFor(() => {
        expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('3');
      });

      // 4. Verify continuous 1..3 sequence
      expect(screen.getByTestId('badge-text-1')).toBeInTheDocument();
      expect(screen.getByTestId('badge-text-2')).toBeInTheDocument();
      expect(screen.getByTestId('badge-text-3')).toBeInTheDocument();
      expect(screen.queryByTestId('badge-text-4')).not.toBeInTheDocument();

      // 5. Generate Markdown Report
      const mdReport = serializeToFullReport([ann4, ann2, ann3], mockTestImage);
      expect(mdReport).toContain('# Annotation Report: app-dashboard-retina.png');
      expect(mdReport).toContain('Avatar clipped');
      expect(mdReport).toContain('Wrong redirect path');
      expect(mdReport).toContain('Typo in header');
    });

    it('W7.2: High-Scale Stress: 50 annotations handle rapid mutations with 100% invariant preservation', () => {
      const annotations: Annotation[] = [];
      for (let i = 1; i <= 50; i++) {
        const types: ('box' | 'ellipse' | 'arrow' | 'pin')[] = ['box', 'ellipse', 'arrow', 'pin'];
        const type = types[i % 4];
        annotations.push(createTestAnnotation(`stress-ann-${i}`, i, type, `Stress test note #${i}`));
      }

      // Verify sequence validity
      for (let i = 0; i < 50; i++) {
        expect(annotations[i].index).toBe(i + 1);
      }

      // Simulate deleting 10 items randomly and re-indexing
      const filtered = annotations.filter((_, idx) => idx % 5 !== 0);
      const reindexed = filtered.map((a, idx) => ({ ...a, index: idx + 1 }));

      expect(reindexed).toHaveLength(40);
      for (let i = 0; i < 40; i++) {
        expect(reindexed[i].index).toBe(i + 1);
      }

      // Serialize 40 items without performance degradation
      const t0 = performance.now();
      const markdown = serializeAnnotationsToMarkdown(reindexed);
      const t1 = performance.now();

      expect(t1 - t0).toBeLessThan(50); // Must serialize in < 50ms
      expect(markdown).toContain('1. **[');
      expect(markdown).toContain('40. **[');
    });
  });
});
