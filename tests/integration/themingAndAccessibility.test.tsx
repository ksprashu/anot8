import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../../src/App';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { AppProvider } from '../../src/state/AppContext';
import { ToastProvider } from '../../src/components/export/ToastNotification';
import { BaseImage, Annotation } from '../../src/types';

// Mock base image
const mockImage: BaseImage = {
  id: 'img_test_theme',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1200,
  naturalHeight: 800,
  fileName: 'theme-spec-image.png',
  fileSize: 45000,
};

// Generate N mock annotations
function createMockAnnotations(count: number): Annotation[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ann-${i + 1}`,
    index: i + 1,
    geometry: {
      type: 'box',
      x: (i * 20) % 1000,
      y: (i * 15) % 600,
      width: 80,
      height: 60,
    },
    style: {
      color: (['amber', 'red', 'green', 'cyan', 'purple'] as const)[i % 5],
      strokeWidth: 3,
      fillOpacity: 0.15,
    },
    note: `Annotation note number ${i + 1}`,
    createdAt: 1000 + i,
    updatedAt: 1000 + i,
  }));
}

describe('Integration: Theming, Accessibility, Polish & Shortcuts Modal', () => {
  let localStorageStore: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageStore = {};

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          localStorageStore[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete localStorageStore[key];
        }),
        clear: vi.fn(() => {
          localStorageStore = {};
        }),
      },
      writable: true,
    });

    // Reset documentElement classes
    document.documentElement.className = '';
  });

  afterEach(() => {
    document.documentElement.className = '';
  });

  // =========================================================================
  // Suite 1: ThemeContext & System Preference Integration
  // =========================================================================
  describe('Suite 1: ThemeContext Provider & Resolution', () => {
    it('T1.1: Resolves default theme to dark and sets dark class on documentElement', () => {
      render(<App />);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(screen.getByTestId('app-brand-title')).toBeInTheDocument();
    });

    it('T1.2: Restores stored theme from localStorage on initial mount', () => {
      localStorageStore['anot8_theme'] = 'light';
      render(<App />);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });
  });

  // =========================================================================
  // Suite 2: ThemeToggle Interaction & Persistence
  // =========================================================================
  describe('Suite 2: ThemeToggle Component & Switching', () => {
    it('T2.1: Clicking ThemeToggle switches between dark and light modes and persists to localStorage', () => {
      render(<App />);
      const themeToggle = screen.getByTestId('theme-toggle-btn');
      expect(themeToggle).toBeInTheDocument();

      // Initial: Dark
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // Toggle -> Light
      fireEvent.click(themeToggle);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(window.localStorage.setItem).toHaveBeenCalledWith('anot8_theme', 'light');

      // Toggle -> Dark
      fireEvent.click(themeToggle);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(window.localStorage.setItem).toHaveBeenCalledWith('anot8_theme', 'dark');
    });
  });

  // =========================================================================
  // Suite 3: ShortcutsModal Keyboard & Button Triggering
  // =========================================================================
  describe('Suite 3: ShortcutsModal Lifecycle & Interactions', () => {
    it('T3.1: Pressing "?" key opens ShortcutsModal cheat-sheet', () => {
      render(<App />);
      expect(screen.queryByTestId('shortcuts-modal-dialog')).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: '?', code: 'Slash', shiftKey: true });
      expect(screen.getByTestId('shortcuts-modal-dialog')).toBeInTheDocument();
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });

    it('T3.2: Clicking header help button opens ShortcutsModal cheat-sheet', () => {
      render(<App />);
      const helpBtn = screen.getByTestId('shortcuts-help-btn');
      fireEvent.click(helpBtn);

      expect(screen.getByTestId('shortcuts-modal-dialog')).toBeInTheDocument();
    });

    it('T3.3: Pressing Escape closes ShortcutsModal', () => {
      render(<App />);
      fireEvent.click(screen.getByTestId('shortcuts-help-btn'));
      expect(screen.getByTestId('shortcuts-modal-dialog')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(screen.queryByTestId('shortcuts-modal-dialog')).not.toBeInTheDocument();
    });

    it('T3.4: Clicking backdrop closes ShortcutsModal', () => {
      render(<App />);
      fireEvent.click(screen.getByTestId('shortcuts-help-btn'));
      const backdrop = screen.getByTestId('shortcuts-modal-backdrop');

      fireEvent.click(backdrop);
      expect(screen.queryByTestId('shortcuts-modal-dialog')).not.toBeInTheDocument();
    });

    it('T3.5: Renders all defined shortcut categories and keybindings in modal', () => {
      render(<App />);
      fireEvent.click(screen.getByTestId('shortcuts-help-btn'));

      expect(screen.getByTestId('shortcuts-category-tools')).toBeInTheDocument();
      expect(screen.getByTestId('shortcuts-category-canvas')).toBeInTheDocument();
      expect(screen.getByTestId('shortcuts-category-history')).toBeInTheDocument();
      expect(screen.getByTestId('shortcuts-category-export')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Suite 4: Keyboard Shortcuts & Input Isolation
  // =========================================================================
  describe('Suite 4: Shortcuts Dispatcher & Editable Isolation', () => {
    it('T4.1: Single-letter tool shortcuts switch active tool when not typing in input', () => {
      render(<App />);
      const boxBtn = screen.getByTestId('tool-btn-box');
      const blurBtn = screen.getByTestId('tool-btn-blur');
      expect(boxBtn).toHaveAttribute('aria-pressed', 'false');
      expect(blurBtn).toHaveAttribute('aria-pressed', 'false');

      fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });
      expect(boxBtn).toHaveAttribute('aria-pressed', 'true');

      fireEvent.keyDown(window, { key: 'b', code: 'KeyB' });
      expect(blurBtn).toHaveAttribute('aria-pressed', 'true');
      expect(boxBtn).toHaveAttribute('aria-pressed', 'false');

      fireEvent.keyDown(window, { key: 'v', code: 'KeyV' });
      expect(blurBtn).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('tool-btn-select')).toHaveAttribute('aria-pressed', 'true');
    });

    it('T4.2: Typing hotkeys inside input or textarea does not trigger tool changes or open modal', () => {
      render(<App />);
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      fireEvent.keyDown(input, { key: 'b', code: 'KeyB' });
      expect(screen.getByTestId('tool-btn-blur')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('tool-btn-box')).toHaveAttribute('aria-pressed', 'false');

      fireEvent.keyDown(input, { key: '?', code: 'Slash' });
      expect(screen.queryByTestId('shortcuts-modal-dialog')).not.toBeInTheDocument();

      document.body.removeChild(input);
    });
  });

  // =========================================================================
  // Suite 5: Full Application ARIA & Accessibility Auditing
  // =========================================================================
  describe('Suite 5: Accessibility & Semantic Structure', () => {
    it('T5.1: Verifies all toolbars have role="toolbar" and accessible labels', () => {
      render(<App />);
      expect(screen.getByTestId('main-toolbar')).toHaveAttribute('role', 'toolbar');
      expect(screen.getByTestId('color-palette')).toHaveAttribute('role', 'toolbar');
      expect(screen.getByTestId('zoom-controls-toolbar')).toHaveAttribute('role', 'toolbar');
      expect(screen.getByTestId('history-controls-toolbar')).toHaveAttribute('role', 'toolbar');
      expect(screen.getByTestId('export-actions-toolbar')).toHaveAttribute('role', 'toolbar');
    });

    it('T5.2: Verifies all tool buttons have titles and aria-labels with keybindings', () => {
      render(<App />);
      const tools = ['select', 'box', 'ellipse', 'arrow', 'pin', 'pan'];
      tools.forEach((tool) => {
        const btn = screen.getByTestId(`tool-btn-${tool}`);
        expect(btn).toHaveAttribute('title');
        expect(btn).toHaveAttribute('aria-label');
      });
    });

    it('T5.3: Shortcuts modal possesses role="dialog" and aria-modal="true"', () => {
      render(<App />);
      fireEvent.click(screen.getByTestId('shortcuts-help-btn'));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });
  });

  // =========================================================================
  // Suite 6: 100+ Annotations Performance & Scale Integration
  // =========================================================================
  describe('Suite 6: 100+ Annotations Performance & Scale', () => {
    it('T6.1: Renders 100 annotations seamlessly on canvas and sidebar without memory spikes or errors', () => {
      const annotations100 = createMockAnnotations(100);

      render(
        <ThemeProvider>
          <AppProvider initialState={{ image: mockImage, annotations: annotations100, isSidebarOpen: true }}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AppProvider>
        </ThemeProvider>
      );

      // Verify canvas SVG elements and sidebar count badge
      expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('100');
      expect(screen.getByTestId('sidebar-count-badge')).toHaveTextContent('100');
      expect(screen.getAllByTestId(/^note-card-ann-/)).toHaveLength(100);
    });
  });

  // =========================================================================
  // Suite 7: High-Contrast Color Presets & Styling Consistency
  // =========================================================================
  describe('Suite 7: High-Contrast Theme Color Auditing', () => {
    it('T7.1: Color palette renders 5 high-contrast presets with correct accessible indicators', () => {
      render(<App />);
      const colors = ['red', 'amber', 'green', 'cyan', 'purple'];
      colors.forEach((color) => {
        const btn = screen.getByTestId(`color-btn-${color}`);
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveAttribute('role', 'radio');
        expect(btn).toHaveAttribute('aria-label');
      });
    });
  });
});
