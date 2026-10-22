import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AppProvider } from '../../src/state/AppContext';
import { App } from '../../src/App';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { ToastProvider } from '../../src/components/export/ToastNotification';
import {
  appReducer,
  createInitialState,
  normalizeBoxGeometry,
  normalizeEllipseGeometry,
} from '../../src/state/appReducer';
import {
  createInitialHistory,
  pushHistory,
  undo,
  redo,
  canUndo,
  canRedo,
  TransactionManager,
  MAX_HISTORY_STEPS,
} from '../../src/state/historyManager';
import {
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
} from '../../src/export/canvasExporter';
import { getBadgePositionForShape } from '../../src/math/badges';
import { writeTextToClipboard } from '../../src/export/clipboard';
import { ShortcutsModal } from '../../src/components/modals/ShortcutsModal';
import {
  BaseImage,
  Annotation,
  HistorySnapshot,
  BoxGeometry,
  EllipseGeometry,
  PresetColor,
} from '../../src/types';

// Fixture: Mock Base Image
const mockBaseImage: BaseImage = {
  id: 'img-tier5-stress',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1920,
  naturalHeight: 1080,
  fileName: 'adversarial-system-architecture.png',
  fileSize: 450000,
};

const mock4KImage: BaseImage = {
  id: 'img-tier5-4k',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 3840,
  naturalHeight: 2160,
  fileName: 'high-dpi-retina-dashboard.png',
  fileSize: 1850000,
};

function createSampleAnnotation(
  id: string,
  index: number,
  type: 'box' | 'ellipse' | 'arrow' | 'pin' = 'box',
  color: PresetColor = 'amber',
  note: string = `Annotation note #${index}`
): Annotation {
  let geometry: Annotation['geometry'];
  switch (type) {
    case 'box':
      geometry = {
        type: 'box',
        x: 50 + (index % 20) * 40,
        y: 50 + Math.floor(index / 20) * 30,
        width: 120,
        height: 80,
        borderRadius: 8,
      };
      break;
    case 'ellipse':
      geometry = {
        type: 'ellipse',
        cx: 100 + (index % 20) * 40,
        cy: 100 + Math.floor(index / 20) * 30,
        rx: 60,
        ry: 40,
      };
      break;
    case 'arrow': {
      const angle = (index % 8) * (Math.PI / 4);
      const length = 100;
      const startX = 200 + (index % 10) * 50;
      const startY = 200 + Math.floor(index / 10) * 50;
      geometry = {
        type: 'arrow',
        startX,
        startY,
        endX: startX + Math.cos(angle) * length,
        endY: startY + Math.sin(angle) * length,
      };
      break;
    }
    case 'pin':
      geometry = {
        type: 'pin',
        x: 80 + (index % 25) * 35,
        y: 80 + Math.floor(index / 25) * 35,
      };
      break;
  }

  return {
    id,
    index,
    geometry,
    style: {
      color,
      strokeWidth: 3,
      fillOpacity: 0.15,
    },
    note,
    createdAt: 1700000000000 + index * 1000,
    updatedAt: 1700000000000 + index * 1000,
  };
}

describe('Tier 5: Adversarial Coverage Hardening & Stress Matrix', () => {
  // =========================================================================
  // SUITE 1: Extreme Multi-Step Developer Workflows & Cross-Domain State Transitions
  // =========================================================================
  describe('Suite 1: Extreme Multi-Step Developer Workflows & State Invariants', () => {
    it('executes a 100-step complex workflow (ingest, create, mutate, reorder, delete, replace) maintaining strict 1..N indices', () => {
      let state = createInitialState();

      // Step 1: Ingest Image
      state = appReducer(state, { type: 'SET_IMAGE', payload: mockBaseImage });
      expect(state.image).toBe(mockBaseImage);
      expect(state.annotations).toHaveLength(0);

      // Step 2: Create 24 annotations alternating tools
      const toolTypes: ('box' | 'ellipse' | 'arrow' | 'pin')[] = ['box', 'ellipse', 'arrow', 'pin'];
      for (let i = 1; i <= 24; i++) {
        const tool = toolTypes[(i - 1) % 4];
        const ann = createSampleAnnotation(`ann_${i}`, i, tool);
        state = appReducer(state, {
          type: 'ADD_ANNOTATION',
          payload: {
            id: ann.id,
            geometry: ann.geometry,
            style: ann.style,
            note: ann.note,
          },
        });
      }
      expect(state.annotations).toHaveLength(24);
      state.annotations.forEach((ann, idx) => {
        expect(ann.index).toBe(idx + 1);
      });

      // Step 3: Rapidly mutate colors across different annotations
      const colors: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];
      for (let i = 0; i < 24; i++) {
        const annId = state.annotations[i].id;
        state = appReducer(state, { type: 'SELECT_ANNOTATION', payload: annId });
        state = appReducer(state, {
          type: 'SET_ACTIVE_COLOR',
          payload: colors[i % colors.length],
        });
        expect(state.annotations[i].style.color).toBe(colors[i % colors.length]);
      }

      // Step 4: Perform 15 random reorderings
      for (let r = 0; r < 15; r++) {
        const fromIndex = (r * 3) % state.annotations.length;
        const toIndex = (r * 7 + 1) % state.annotations.length;
        state = appReducer(state, {
          type: 'REORDER_ANNOTATIONS',
          payload: { fromIndex, toIndex },
        });
        // Invariant: strict 1..N order must hold after EVERY reorder
        state.annotations.forEach((ann, idx) => {
          expect(ann.index).toBe(idx + 1);
        });
      }

      // Step 5: Delete 8 items in non-sequential order
      const idsToDelete = [
        state.annotations[2].id,
        state.annotations[5].id,
        state.annotations[8].id,
        state.annotations[0].id,
        state.annotations[state.annotations.length - 1].id,
      ];
      for (const id of idsToDelete) {
        state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id } });
        // Invariant: remaining annotations reindexed perfectly
        state.annotations.forEach((ann, idx) => {
          expect(ann.index).toBe(idx + 1);
        });
      }
      expect(state.annotations).toHaveLength(24 - idsToDelete.length);

      // Step 6: Replace Image with 4K image -> Invariant: state resets cleanly
      state = appReducer(state, { type: 'SET_IMAGE', payload: mock4KImage });
      expect(state.image).toBe(mock4KImage);
      expect(state.selectedAnnotationId).toBeNull();
      expect(state.hoveredAnnotationId).toBeNull();
    });

    it('handles inverted and negative coordinate geometries without crashing (bounding box normalization)', () => {
      // Inverted Box (dragged backwards bottom-right to top-left)
      const rawInvertedBox: BoxGeometry = {
        type: 'box',
        x: 300,
        y: 400,
        width: -150,
        height: -200,
      };
      const normBox = normalizeBoxGeometry(rawInvertedBox);
      expect(normBox.x).toBe(150);
      expect(normBox.y).toBe(200);
      expect(normBox.width).toBe(150);
      expect(normBox.height).toBe(200);

      // Negative radius Ellipse
      const rawInvertedEllipse: EllipseGeometry = {
        type: 'ellipse',
        cx: 200,
        cy: 200,
        rx: -75,
        ry: -50,
      };
      const normEllipse = normalizeEllipseGeometry(rawInvertedEllipse);
      expect(normEllipse.rx).toBe(75);
      expect(normEllipse.ry).toBe(50);

      // Normalization dispatch through reducer
      let state = createInitialState({ image: mockBaseImage });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: 'norm_box_1',
          geometry: rawInvertedBox,
          note: 'Inverted box note',
        },
      });

      expect(state.annotations[0].geometry).toEqual({
        type: 'box',
        x: 150,
        y: 200,
        width: 150,
        height: 200,
      });
    });

    it('safely handles extreme zoom levels (0.01x to 100x) and boundary pans without numerical overflow', () => {
      let state = createInitialState({ image: mockBaseImage });

      const zoomLevels = [0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 50.0, 100.0];
      for (const zoom of zoomLevels) {
        state = appReducer(state, {
          type: 'SET_VIEWPORT',
          payload: { zoom, panX: (zoom - 1) * -500, panY: (zoom - 1) * -300 },
        });
        expect(state.viewport.zoom).toBe(zoom);
        expect(Number.isFinite(state.viewport.panX)).toBe(true);
        expect(Number.isFinite(state.viewport.panY)).toBe(true);
      }

      // Reset Viewport
      state = appReducer(state, { type: 'RESET_VIEWPORT', payload: { zoom: 1.0, panX: 0, panY: 0 } });
      expect(state.viewport.zoom).toBe(1.0);
      expect(state.viewport.panX).toBe(0);
      expect(state.viewport.panY).toBe(0);
    });
  });

  // =========================================================================
  // SUITE 2: Rapid Undo/Redo During Active Drags & History Manager Stress
  // =========================================================================
  describe('Suite 2: Rapid Undo/Redo & TransactionManager Adversarial Hardening', () => {
    it('TransactionManager discards micro-drags and safely handles uncommitted cancellations', () => {
      const tm = new TransactionManager();
      let history = createInitialHistory([], null);
      const initialSnap: HistorySnapshot = {
        annotations: [createSampleAnnotation('ann_tm_1', 1, 'box')],
        selectedAnnotationId: 'ann_tm_1',
      };

      // Begin transaction
      tm.beginTransaction(initialSnap);
      expect(tm.isTransactionActive()).toBe(true);

      // Micro drag with zero delta (same state)
      history = tm.commitTransaction(history, initialSnap);
      expect(history.past).toHaveLength(0); // Should discard redundant snapshot
      expect(tm.isTransactionActive()).toBe(false);

      // Begin and cancel
      tm.beginTransaction(initialSnap);
      expect(tm.isTransactionActive()).toBe(true);
      const canceledSnap = tm.cancelTransaction();
      expect(canceledSnap).toEqual(initialSnap);
      expect(tm.isTransactionActive()).toBe(false);
    });

    it('survives rapid mid-drag undo/redo interruptions without corrupting transaction state', () => {
      let history = createInitialHistory([], null);
      const tm = new TransactionManager();

      // Establish base annotations
      for (let i = 1; i <= 5; i++) {
        const snap: HistorySnapshot = {
          annotations: Array.from({ length: i }, (_, k) => createSampleAnnotation(`ann_${k + 1}`, k + 1)),
          selectedAnnotationId: `ann_${i}`,
        };
        history = pushHistory(history, snap);
      }
      expect(history.past).toHaveLength(5);
      expect(history.present.annotations).toHaveLength(5);

      // Start an active drag on annotation #5
      tm.beginTransaction(history.present);
      expect(tm.isTransactionActive()).toBe(true);

      // While drag is active, user presses Undo (Cmd+Z)
      expect(canUndo(history)).toBe(true);
      history = undo(history);
      expect(history.present.annotations).toHaveLength(4);

      // Transaction is canceled due to interruption
      tm.cancelTransaction();
      expect(tm.isTransactionActive()).toBe(false);

      // User presses Redo (Cmd+Shift+Z)
      expect(canRedo(history)).toBe(true);
      history = redo(history);
      expect(history.present.annotations).toHaveLength(5);

      // State remains completely intact
      expect(history.present.annotations[4].id).toBe('ann_5');
    });

    it('enforces branching invalidation: pushing a new mutation mid-history completely truncates future stack', () => {
      let history = createInitialHistory([], null);

      // Push 10 states
      for (let i = 1; i <= 10; i++) {
        history = pushHistory(history, {
          annotations: [createSampleAnnotation(`ann_${i}`, 1, 'box')],
          selectedAnnotationId: `ann_${i}`,
        });
      }
      expect(history.past).toHaveLength(10);

      // Undo 5 times
      for (let u = 0; u < 5; u++) {
        history = undo(history);
      }
      expect(history.past).toHaveLength(5);
      expect(history.future).toHaveLength(5);
      expect(canRedo(history)).toBe(true);

      // Push a brand NEW action at step 5 (divergent branch)
      const branchedSnap: HistorySnapshot = {
        annotations: [createSampleAnnotation('ann_branch_new', 1, 'pin')],
        selectedAnnotationId: 'ann_branch_new',
      };
      history = pushHistory(history, branchedSnap);

      // INVARIANT: Future stack MUST be immediately cleared
      expect(history.future).toHaveLength(0);
      expect(canRedo(history)).toBe(false);
      expect(history.present).toBe(branchedSnap);
      expect(history.past).toHaveLength(6);
    });

    it('stress tests 150 consecutive history pushes against MAX_HISTORY_STEPS ceiling', () => {
      let history = createInitialHistory([], null);

      for (let i = 1; i <= 150; i++) {
        history = pushHistory(history, {
          annotations: [createSampleAnnotation(`ann_${i}`, 1, 'box')],
          selectedAnnotationId: `ann_${i}`,
        });
        expect(history.past.length).toBeLessThanOrEqual(MAX_HISTORY_STEPS);
      }

      expect(history.past).toHaveLength(50);
      expect(history.future).toHaveLength(0);

      // Exhaustively undo all 50
      for (let u = 0; u < 50; u++) {
        history = undo(history);
      }
      expect(canUndo(history)).toBe(false);
      expect(history.past).toHaveLength(0);
      expect(history.future).toHaveLength(50);

      // Underflow protection
      const copy = history;
      history = undo(history);
      expect(history).toBe(copy);
    });
  });

  // =========================================================================
  // SUITE 3: Massive Multi-Annotation Export & Markdown Serialization
  // =========================================================================
  describe('Suite 3: Massive Multi-Annotation Export & Markdown Serialization', () => {
    const generateMassiveDataset = (count: number): Annotation[] => {
      const tools: ('box' | 'ellipse' | 'arrow' | 'pin')[] = ['box', 'ellipse', 'arrow', 'pin'];
      const colors: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];
      const notes = [
        'Standard note with simple text',
        'Note with Markdown Table: | Col A | Col B |\n|---|---|\n| Val 1 | Val 2 |',
        'Note with code: ```typescript\nconst x: number = 42;\nconsole.log(x);\n```',
        'Note with special chars: <script>alert("xss")</script> &amp; "quotes"',
        'Note with Unicode/CJK & Emojis: 🥔 🚀 日本語 🎨 א ב ג',
        'Note with multiline checklist:\n- [x] Fixed layout bug\n- [ ] Deploy to prod',
      ];

      return Array.from({ length: count }, (_, idx) => {
        const i = idx + 1;
        return createSampleAnnotation(
          `mass_ann_${i}`,
          i,
          tools[idx % tools.length],
          colors[idx % colors.length],
          notes[idx % notes.length]
        );
      });
    };

    it('serializes 250 annotations into Numbered List, Markdown Table, and Full Report formats without data loss', () => {
      const annotations250 = generateMassiveDataset(250);

      // 1. Numbered List
      const listOutput = serializeToNumberedList(annotations250);
      expect(listOutput).toContain('1. **[Box]** (`#EF4444`):');
      expect(listOutput).toContain('250. **[Ellipse]** (`#8B5CF6`):');
      expect(listOutput).toContain('Standard note with simple text');

      // 2. Markdown Table
      const tableOutput = serializeToMarkdownTable(annotations250);
      expect(tableOutput).toContain('| # | Type | Color | Note |');
      expect(tableOutput).toContain('| 1 | Box | Red (#EF4444) | Standard note with simple text |');
      expect(tableOutput).toContain('| 250 |');
      // Verify internal pipes in table notes were sanitized/escaped
      expect(tableOutput).not.toMatch(/\| Val 1 \| Val 2 \|/); // Pipes escaped to \|

      // 3. Full Report
      const fullReport = serializeToFullReport(annotations250, mockBaseImage);
      expect(fullReport).toContain('# Annotation Report: adversarial-system-architecture.png');
      expect(fullReport).toContain('| **Total Annotations** | 250 |');
      expect(fullReport).toContain('1. **[Box]** (`#EF4444`):');
      expect(fullReport).toContain('250. **[Ellipse]** (`#8B5CF6`):');
    });

    it('rasterizes 250 annotations onto a 4K canvas and computes valid badge anchors across all quadrants', async () => {
      const annotations250 = generateMassiveDataset(250);
      const canvas = await renderCompositeCanvas(mock4KImage, annotations250);

      expect(canvas).toBeDefined();
      expect(canvas.width).toBe(3840);
      expect(canvas.height).toBe(2160);

      // Verify badge anchor math across all 250 geometries
      for (const ann of annotations250) {
        const anchor = getBadgePositionForShape(ann.geometry);
        expect(Number.isFinite(anchor.x)).toBe(true);
        expect(Number.isFinite(anchor.y)).toBe(true);
      }

      // Verify blob export
      const blob = await exportCompositeBlob(mock4KImage, annotations250);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');

      // Verify data URL export
      const dataUrl = await exportCompositeDataUrl(mock4KImage, annotations250);
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('sanitizes hostile filenames with path traversal, null bytes, and extreme lengths', () => {
      expect(sanitizeFileName('../../etc/passwd.png')).toBe('etc-passwd.png');
      expect(sanitizeFileName('test\0null\x1fbyte.png')).toBe('testnullbyte.png');
      expect(sanitizeFileName('   spaced_file.png   ')).toBe('spaced_file.png');
      expect(sanitizeFileName('')).toMatch(/^anot8-export-\d+\.png$/);

      const generated = generateExportFilename(mockBaseImage, 'png');
      expect(generated).toBe('adversarial-system-architecture-annotated.png');
    });

    it('writes 250 annotations text to clipboard reliably', async () => {
      const annotations250 = generateMassiveDataset(250);
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
          write: vi.fn().mockResolvedValue(undefined),
        },
      });

      const markdown = serializeToNumberedList(annotations250);
      await writeTextToClipboard(markdown);
      expect(writeTextMock).toHaveBeenCalledWith(markdown);
    });
  });

  // =========================================================================
  // SUITE 4: High-Frequency Theme & Shortcut Interactions
  // =========================================================================
  describe('Suite 4: High-Frequency Theme & Shortcut Interactions', () => {
    it('survives 100 rapid theme toggle cycles while handling keyboard events without desync', () => {
      const { unmount } = render(
        React.createElement(ThemeProvider, {
          defaultTheme: 'dark',
          children: React.createElement(AppProvider, {
            initialState: { image: mockBaseImage, annotations: [] },
            children: React.createElement(ToastProvider, {
              children: React.createElement(App, null),
            }),
          }),
        })
      );

      const themeToggleBtn = screen.getByTestId('theme-toggle-btn');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // Rapidly toggle 100 times
      for (let i = 1; i <= 100; i++) {
        act(() => {
          fireEvent.click(themeToggleBtn);
        });
        const expected = i % 2 === 1 ? 'light' : 'dark';
        expect(document.documentElement.classList.contains(expected)).toBe(true);
      }

      // Concurrently trigger keyboard shortcut Cmd+D / Ctrl+D
      act(() => {
        fireEvent.keyDown(window, { key: 'd', metaKey: true });
      });
      expect(document.documentElement.classList.contains('light')).toBe(true);

      act(() => {
        fireEvent.keyDown(window, { key: 'd', metaKey: true });
      });
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      unmount();
    });

    it('strictly isolates keyboard shortcuts when focus is inside text inputs or textareas', () => {
      const annotations = [createSampleAnnotation('ann_iso_1', 1, 'box', 'amber', 'Initial note')];
      render(
        React.createElement(ThemeProvider, {
          defaultTheme: 'dark',
          children: React.createElement(AppProvider, {
            initialState: {
              image: mockBaseImage,
              annotations,
              selectedAnnotationId: 'ann_iso_1',
              isSidebarOpen: true,
              activeTool: 'select',
            },
            children: React.createElement(ToastProvider, {
              children: React.createElement(App, null),
            }),
          }),
        })
      );

      // Locate note textarea in sidebar
      const noteInput = screen.getByDisplayValue('Initial note');
      expect(noteInput).toBeInTheDocument();

      // Focus note input
      act(() => {
        noteInput.focus();
      });

      // Type hotkeys inside the textarea: 'b' (box tool), 'e' (ellipse tool), '1' (red color), 'Delete'
      act(() => {
        fireEvent.keyDown(noteInput, { key: 'b' });
        fireEvent.keyDown(noteInput, { key: 'e' });
        fireEvent.keyDown(noteInput, { key: '1' });
        fireEvent.keyDown(noteInput, { key: 'Delete' });
      });

      // INVARIANT: The annotation was NOT deleted, active tool was NOT changed to box/ellipse
      expect(screen.getByDisplayValue('Initial note')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('1');
    });

    it('tests ShortcutsModal rapid open/close oscillations (50 cycles) and focus trap', () => {
      const { rerender } = render(React.createElement(ShortcutsModal, { isOpen: false, onClose: vi.fn() }));
      expect(screen.queryByTestId('shortcuts-modal')).not.toBeInTheDocument();

      const onCloseMock = vi.fn();

      // Rapidly toggle open prop 50 times
      for (let i = 1; i <= 50; i++) {
        const isOpen = i % 2 === 1;
        rerender(React.createElement(ShortcutsModal, { isOpen, onClose: onCloseMock }));
        if (isOpen) {
          expect(screen.getByTestId('shortcuts-modal')).toBeInTheDocument();
        } else {
          expect(screen.queryByTestId('shortcuts-modal')).not.toBeInTheDocument();
        }
      }

      // Open and test Escape key dismissal
      rerender(React.createElement(ShortcutsModal, { isOpen: true, onClose: onCloseMock }));
      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });
      expect(onCloseMock).toHaveBeenCalled();
    });

    it('safely handles localStorage QuotaExceededError and SecurityError when persisting themes', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      // Should not throw or crash the app
      expect(() => {
        render(
          React.createElement(ThemeProvider, {
            defaultTheme: 'dark',
            children: React.createElement(AppProvider, {
              initialState: { image: mockBaseImage, annotations: [] },
              children: React.createElement(ToastProvider, {
                children: React.createElement(App, null),
              }),
            }),
          })
        );
      }).not.toThrow();

      setItemSpy.mockRestore();
    });
  });
});
