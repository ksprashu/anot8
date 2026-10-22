import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React, { useEffect } from 'react';
import {
  ThemeProvider,
  useTheme,
  getStoredTheme,
  setStoredTheme,
  getSystemTheme,
  THEME_STORAGE_KEY,
} from '../../src/theme/ThemeContext';
import { ThemeToggle } from '../../src/components/toolbar/ThemeToggle';
import { ShortcutsModal } from '../../src/components/modals/ShortcutsModal';
import { App } from '../../src/App';
import { AppProvider } from '../../src/state/AppContext';
import { ToastProvider } from '../../src/components/export/ToastNotification';
import { BaseImage, Annotation } from '../../src/types';

// Display helper to inspect ThemeContext state
const ThemeInspector: React.FC<{
  onStateChange?: (state: { theme: string; resolvedTheme: string; isDark: boolean }) => void;
}> = ({ onStateChange }) => {
  const { theme, resolvedTheme, isDark, toggleTheme, setTheme } = useTheme();

  useEffect(() => {
    onStateChange?.({ theme, resolvedTheme, isDark });
  }, [theme, resolvedTheme, isDark, onStateChange]);

  return (
    <div data-testid="theme-inspector">
      <span data-testid="inspector-theme">{theme}</span>
      <span data-testid="inspector-resolved">{resolvedTheme}</span>
      <span data-testid="inspector-is-dark">{isDark ? 'true' : 'false'}</span>
      <button data-testid="inspector-toggle-btn" onClick={toggleTheme}>
        Toggle
      </button>
      <button data-testid="inspector-set-dark-btn" onClick={() => setTheme('dark')}>
        Set Dark
      </button>
      <button data-testid="inspector-set-light-btn" onClick={() => setTheme('light')}>
        Set Light
      </button>
      <button data-testid="inspector-set-system-btn" onClick={() => setTheme('system')}>
        Set System
      </button>
    </div>
  );
};

// Mock base image
const mockBaseImage: BaseImage = {
  id: 'img-stress-m6',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 1920,
  naturalHeight: 1080,
  fileName: 'stress-theme-screenshot.png',
  fileSize: 50000,
};

function createScaleAnnotations(count: number): Annotation[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ann-m6-stress-${i + 1}`,
    index: i + 1,
    geometry: {
      type: 'box',
      x: (i * 25) % 1800,
      y: (i * 20) % 1000,
      width: 100,
      height: 80,
    },
    style: {
      color: (['amber', 'red', 'green', 'cyan', 'purple'] as const)[i % 5],
      strokeWidth: 3,
      fillOpacity: 0.2,
    },
    note: `Scale annotation note #${i + 1}`,
    createdAt: 1000 + i,
    updatedAt: 1000 + i,
  }));
}

describe('Milestone 6 Challenger 1: Adversarial Theme Engine & Shortcuts Modal Stress Suite', () => {
  let localStorageMockStore: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMockStore = {};

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => localStorageMockStore[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          localStorageMockStore[key] = String(value);
        }),
        removeItem: vi.fn((key: string) => {
          delete localStorageMockStore[key];
        }),
        clear: vi.fn(() => {
          localStorageMockStore = {};
        }),
      },
      writable: true,
      configurable: true,
    });

    document.documentElement.className = '';
  });

  afterEach(() => {
    document.documentElement.className = '';
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Section 1: 200 Rapid Theme Toggle Oscillations
  // =========================================================================
  describe('1. 200 Rapid Theme Toggle Oscillations', () => {
    it('C1.1: 200 programmatic toggleTheme() oscillations maintain strict state and class invariants', () => {
      const recordedStates: { theme: string; resolvedTheme: string; isDark: boolean }[] = [];

      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeInspector onStateChange={(s) => recordedStates.push(s)} />
        </ThemeProvider>
      );

      const toggleBtn = screen.getByTestId('inspector-toggle-btn');
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('light')).toBe(false);

      const startTime = performance.now();

      // Execute 200 rapid oscillations
      for (let i = 1; i <= 200; i++) {
        act(() => {
          fireEvent.click(toggleBtn);
        });

        const expectedResolved = i % 2 === 1 ? 'light' : 'dark';
        expect(screen.getByTestId('inspector-resolved')).toHaveTextContent(expectedResolved);
        expect(document.documentElement.classList.contains(expectedResolved)).toBe(true);
        expect(document.documentElement.classList.contains(expectedResolved === 'dark' ? 'light' : 'dark')).toBe(false);
      }

      const durationMs = performance.now() - startTime;
      expect(durationMs).toBeLessThan(3000);

      // Invariant: After 200 toggles (even number), theme is 'dark'
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('light')).toBe(false);
      expect(localStorageMockStore[THEME_STORAGE_KEY]).toBe('dark');

      // Invariant: Class list contains exactly 1 theme class without duplicates
      expect(document.documentElement.className.trim()).toBe('dark');

      // 201st toggle (odd number) -> 'light'
      act(() => {
        fireEvent.click(toggleBtn);
      });
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(localStorageMockStore[THEME_STORAGE_KEY]).toBe('light');
    });

    it('C1.2: 200 rapid clicks on <ThemeToggle /> component update Lucide icons, ARIA labels & storage', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeToggle />
        </ThemeProvider>
      );

      const themeToggleBtn = screen.getByTestId('theme-toggle-btn');
      expect(screen.getByTestId('icon-sun')).toBeInTheDocument();
      expect(themeToggleBtn).toHaveAttribute('aria-label', 'Switch to light theme');
      expect(themeToggleBtn).toHaveAttribute('aria-pressed', 'true');

      for (let i = 1; i <= 200; i++) {
        act(() => {
          fireEvent.click(themeToggleBtn);
        });

        const isLight = i % 2 === 1;
        if (isLight) {
          expect(screen.getByTestId('icon-moon')).toBeInTheDocument();
          expect(themeToggleBtn).toHaveAttribute('aria-label', 'Switch to dark theme');
          expect(themeToggleBtn).toHaveAttribute('aria-pressed', 'false');
          expect(document.documentElement.classList.contains('light')).toBe(true);
          expect(document.documentElement.classList.contains('dark')).toBe(false);
        } else {
          expect(screen.getByTestId('icon-sun')).toBeInTheDocument();
          expect(themeToggleBtn).toHaveAttribute('aria-label', 'Switch to light theme');
          expect(themeToggleBtn).toHaveAttribute('aria-pressed', 'true');
          expect(document.documentElement.classList.contains('dark')).toBe(true);
          expect(document.documentElement.classList.contains('light')).toBe(false);
        }
      }

      // After 200 toggles, state is dark
      expect(localStorageMockStore[THEME_STORAGE_KEY]).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('C1.3: 200 rapid Cmd+D / Ctrl+D keyboard shortcuts toggle theme seamlessly in App', () => {
      render(<App />);

      expect(document.documentElement.classList.contains('dark')).toBe(true);

      for (let i = 1; i <= 200; i++) {
        act(() => {
          // Alternating Cmd+D (Mac) and Ctrl+D (Win)
          if (i % 2 === 1) {
            fireEvent.keyDown(window, { key: 'd', code: 'KeyD', metaKey: true });
          } else {
            fireEvent.keyDown(window, { key: 'd', code: 'KeyD', ctrlKey: true });
          }
        });

        const expectedMode = i % 2 === 1 ? 'light' : 'dark';
        expect(document.documentElement.classList.contains(expectedMode)).toBe(true);
        expect(document.documentElement.classList.contains(expectedMode === 'dark' ? 'light' : 'dark')).toBe(false);
      }

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorageMockStore[THEME_STORAGE_KEY]).toBe('dark');
    });
  });

  // =========================================================================
  // Section 2: Storage Corruption & Hostile LocalStorage Values
  // =========================================================================
  describe('2. Storage Corruption & Hostile LocalStorage Values', () => {
    it('C2.1: Handles hostile and corrupt localStorage strings without crashing', () => {
      const hostileValues = [
        'null',
        'undefined',
        '',
        '   ',
        'DARK',
        'LIGHT',
        'System',
        'blue',
        'red',
        'true',
        'false',
        '0',
        '1',
        'NaN',
        'Infinity',
        '[object Object]',
        '{"theme":"dark"}',
        '<script>alert("xss")</script>',
        'DROP TABLE themes;',
        '\0\0\0corrupted_bytes',
        'A'.repeat(50000), // 50KB string
      ];

      for (const val of hostileValues) {
        localStorageMockStore[THEME_STORAGE_KEY] = val;
        // getStoredTheme should safely return fallback
        const result = getStoredTheme('dark');
        expect(result).toBe('dark');

        const resultSystem = getStoredTheme('system');
        expect(resultSystem).toBe('system');
      }
    });

    it('C2.2: ThemeProvider mounts and safely recovers when localStorage contains corrupted JSON', () => {
      localStorageMockStore[THEME_STORAGE_KEY] = '{{corrupted::invalid_json}}';

      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeInspector />
        </ThemeProvider>
      );

      expect(screen.getByTestId('inspector-theme')).toHaveTextContent('dark');
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('C2.3: Gracefully handles DOMException SecurityError when localStorage is blocked (e.g. private browsing)', () => {
      const securityError = new DOMException('The operation is insecure.', 'SecurityError');
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw securityError;
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw securityError;
      });

      expect(() => getStoredTheme('dark')).not.toThrow();
      expect(getStoredTheme('dark')).toBe('dark');

      expect(() => setStoredTheme('light')).not.toThrow();

      // ThemeProvider should mount smoothly in private browsing mode
      render(
        <ThemeProvider defaultTheme="light">
          <ThemeInspector />
        </ThemeProvider>
      );

      expect(screen.getByTestId('inspector-theme')).toHaveTextContent('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);

      // Toggling should still update in-memory React state without crashing
      const toggleBtn = screen.getByTestId('inspector-toggle-btn');
      act(() => {
        fireEvent.click(toggleBtn);
      });
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('C2.4: Gracefully handles QuotaExceededError when localStorage storage limit is reached', () => {
      const quotaError = new DOMException('QuotaExceededError: Setting key anot8_theme exceeded quota', 'QuotaExceededError');
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError;
      });

      expect(() => setStoredTheme('dark')).not.toThrow();

      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeInspector />
        </ThemeProvider>
      );

      const toggleBtn = screen.getByTestId('inspector-toggle-btn');
      act(() => {
        fireEvent.click(toggleBtn);
      });
      // In-memory update proceeds smoothly
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('light');
    });

    it('C2.5: Handles environments where window.localStorage is undefined', () => {
      const originalLocalStorage = window.localStorage;
      // Simulate environment without localStorage
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      expect(() => getStoredTheme('dark')).not.toThrow();
      expect(getStoredTheme('dark')).toBe('dark');
      expect(() => setStoredTheme('light')).not.toThrow();

      // Restore
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
    });
  });

  // =========================================================================
  // Section 3: Cross-Tab Storage Event Synchronization
  // =========================================================================
  describe('3. Cross-Tab Storage Event Synchronization', () => {
    it('C3.1: Updates theme when a valid storage event is dispatched from another browser tab', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeInspector />
        </ThemeProvider>
      );

      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // External tab switches to 'light'
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: THEME_STORAGE_KEY,
            newValue: 'light',
            oldValue: 'dark',
          })
        );
      });

      expect(screen.getByTestId('inspector-theme')).toHaveTextContent('light');
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      // External tab switches back to 'dark'
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: THEME_STORAGE_KEY,
            newValue: 'dark',
            oldValue: 'light',
          })
        );
      });

      expect(screen.getByTestId('inspector-theme')).toHaveTextContent('dark');
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('C3.2: Safely ignores storage events with unrelated keys or invalid theme values', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeInspector />
        </ThemeProvider>
      );

      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');

      // Event for unrelated key
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'unrelated_storage_key',
            newValue: 'light',
          })
        );
      });
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');

      // Event with corrupted newValue
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: THEME_STORAGE_KEY,
            newValue: 'corrupt_theme_string',
          })
        );
      });
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');

      // Event with null newValue (e.g. localStorage.clear())
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: THEME_STORAGE_KEY,
            newValue: null,
          })
        );
      });
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');
    });

    it('C3.3: Handles 100 rapid cross-tab storage event dispatches in succession', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeInspector />
        </ThemeProvider>
      );

      for (let i = 1; i <= 100; i++) {
        const nextTheme = i % 2 === 1 ? 'light' : 'dark';
        act(() => {
          window.dispatchEvent(
            new StorageEvent('storage', {
              key: THEME_STORAGE_KEY,
              newValue: nextTheme,
            })
          );
        });

        expect(screen.getByTestId('inspector-resolved')).toHaveTextContent(nextTheme);
        expect(document.documentElement.classList.contains(nextTheme)).toBe(true);
      }

      // After 100 dispatches (even number), theme is 'dark'
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  // =========================================================================
  // Section 4: System Media Query (prefers-color-scheme) Dynamic Invariance
  // =========================================================================
  describe('4. System Media Query Preferences & Dynamic Invariance', () => {
    it('C4.1: Dynamically updates resolved theme when system preference changes in "system" mode', () => {
      let mediaQueryCallback: ((e: any) => void) | null = null;

      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: true, // Initially dark
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((_event: string, cb: any) => {
          mediaQueryCallback = cb;
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      render(
        <ThemeProvider defaultTheme="system">
          <ThemeInspector />
        </ThemeProvider>
      );

      expect(screen.getByTestId('inspector-theme')).toHaveTextContent('system');
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // System changes to light preference (matches: false)
      expect(mediaQueryCallback).toBeTruthy();
      act(() => {
        if (mediaQueryCallback) {
          mediaQueryCallback({ matches: false } as any);
        }
      });

      expect(screen.getByTestId('inspector-theme')).toHaveTextContent('system');
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      // System changes back to dark preference (matches: true)
      act(() => {
        if (mediaQueryCallback) {
          mediaQueryCallback({ matches: true } as any);
        }
      });

      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('C4.2: Explicit "dark" or "light" theme overrides and ignores system media query changes', () => {
      let mediaQueryCallback: ((e: any) => void) | null = null;

      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((_event: string, cb: any) => {
          mediaQueryCallback = cb;
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeInspector />
        </ThemeProvider>
      );

      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');

      // System reports light mode
      act(() => {
        if (mediaQueryCallback) {
          mediaQueryCallback({ matches: false } as any);
        }
      });

      // Explicit dark mode MUST NOT change to light
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // Switch explicitly to light
      act(() => {
        fireEvent.click(screen.getByTestId('inspector-set-light-btn'));
      });
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('light');

      // System reports dark mode
      act(() => {
        if (mediaQueryCallback) {
          mediaQueryCallback({ matches: true } as any);
        }
      });

      // Explicit light mode MUST NOT change to dark
      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });

    it('C4.3: Supports legacy browser addListener/removeListener fallback', () => {
      let legacyListener: ((e: any) => void) | null = null;
      const mockRemoveListener = vi.fn();

      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn((cb: any) => {
          legacyListener = cb;
        }),
        removeListener: mockRemoveListener,
        addEventListener: undefined as any,
        removeEventListener: undefined as any,
        dispatchEvent: vi.fn(),
      }));

      const { unmount } = render(
        <ThemeProvider defaultTheme="system">
          <ThemeInspector />
        </ThemeProvider>
      );

      expect(legacyListener).toBeTruthy();

      // Trigger legacy listener with light preference
      act(() => {
        if (legacyListener) {
          legacyListener({ matches: false } as any);
        }
      });

      expect(screen.getByTestId('inspector-resolved')).toHaveTextContent('light');

      // Verify unmount cleans up listener
      unmount();
      expect(mockRemoveListener).toHaveBeenCalled();
    });

    it('C4.4: getSystemTheme gracefully falls back to dark when matchMedia is unavailable or throws', () => {
      vi.spyOn(window, 'matchMedia').mockImplementation(() => {
        throw new Error('matchMedia not supported');
      });

      expect(() => getSystemTheme()).not.toThrow();
      expect(getSystemTheme()).toBe('dark');
    });
  });

  // =========================================================================
  // Section 5: Shortcuts Modal & Keyboard Trapping Stress
  // =========================================================================
  describe('5. Shortcuts Modal & Keyboard Trapping Stress', () => {
    it('C5.1: 100 rapid open/close oscillations of ShortcutsModal maintain stable DOM and focus', () => {
      render(<App />);

      for (let i = 1; i <= 100; i++) {
        act(() => {
          // Open via '?'
          fireEvent.keyDown(window, { key: '?', code: 'Slash', shiftKey: true });
        });
        expect(screen.getByTestId('shortcuts-modal-dialog')).toBeInTheDocument();

        act(() => {
          // Close via Escape
          fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
        });
        expect(screen.queryByTestId('shortcuts-modal-dialog')).not.toBeInTheDocument();
      }
    });

    it('C5.2: Strict input isolation: typing hotkeys inside inputs/textareas NEVER triggers shortcuts or theme toggles', () => {
      render(<App />);

      const formContainer = document.createElement('div');
      document.body.appendChild(formContainer);

      const input = document.createElement('input');
      const textarea = document.createElement('textarea');
      const select = document.createElement('select');
      const contentEditable = document.createElement('div');
      contentEditable.setAttribute('contenteditable', 'true');
      const textboxRole = document.createElement('div');
      textboxRole.setAttribute('role', 'textbox');

      formContainer.appendChild(input);
      formContainer.appendChild(textarea);
      formContainer.appendChild(select);
      formContainer.appendChild(contentEditable);
      formContainer.appendChild(textboxRole);

      const testElements = [input, textarea, select, contentEditable, textboxRole];
      const hotkeys = ['b', 'r', 'c', 'o', 'a', 'p', 'v', 'h', '?', '0', '1', '+', '-', '='];

      for (const el of testElements) {
        el.focus();

        for (const key of hotkeys) {
          act(() => {
            fireEvent.keyDown(el, { key, code: `Key${key.toUpperCase()}` });
          });

          // Shortcuts modal must NEVER open
          expect(screen.queryByTestId('shortcuts-modal-dialog')).not.toBeInTheDocument();

          // Active tool must remain 'select'
          expect(screen.getByTestId('tool-btn-select')).toHaveAttribute('aria-pressed', 'true');
        }

        // Cmd+D inside editable should NOT toggle theme
        act(() => {
          fireEvent.keyDown(el, { key: 'd', code: 'KeyD', metaKey: true });
        });
        expect(document.documentElement.classList.contains('dark')).toBe(true);
      }

      document.body.removeChild(formContainer);
    });

    it('C5.3: Focus trap wraps Tab and Shift+Tab navigation within modal dialog', () => {
      const handleClose = vi.fn();
      render(<ShortcutsModal isOpen={true} onClose={handleClose} />);

      const focusable = screen.getByTestId('shortcuts-modal').querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      expect(focusable.length).toBeGreaterThan(2);

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      // Shift+Tab on first element wraps focus to last focusable element
      firstEl.focus();
      expect(document.activeElement).toBe(firstEl);

      act(() => {
        fireEvent.keyDown(window, { key: 'Tab', code: 'Tab', shiftKey: true, bubbles: true });
      });
      expect(document.activeElement).toBe(lastEl);

      // Tab on last element wraps focus back to first focusable element
      lastEl.focus();
      expect(document.activeElement).toBe(lastEl);

      act(() => {
        fireEvent.keyDown(window, { key: 'Tab', code: 'Tab', shiftKey: false, bubbles: true });
      });
      expect(document.activeElement).toBe(firstEl);
    });

    it('C5.4: Search filter stress with random queries and instant filter reset', () => {
      render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

      const searchInput = screen.getByTestId('shortcuts-search-input');

      // Type non-matching query
      act(() => {
        fireEvent.change(searchInput, { target: { value: 'zzzz_no_match_query' } });
      });

      expect(screen.getByTestId('shortcuts-empty-state')).toBeInTheDocument();
      expect(screen.getByText(/No shortcuts found/i)).toBeInTheDocument();

      // Click reset button
      const resetBtn = screen.getByTestId('shortcuts-reset-search-btn');
      act(() => {
        fireEvent.click(resetBtn);
      });

      expect(screen.queryByTestId('shortcuts-empty-state')).not.toBeInTheDocument();
      expect(searchInput).toHaveValue('');

      // Filter by category tab
      const exportTab = screen.getByTestId('category-tab-export');
      act(() => {
        fireEvent.click(exportTab);
      });

      expect(screen.getByTestId('shortcuts-category-export')).toBeInTheDocument();
      expect(screen.queryByTestId('shortcuts-category-tools')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Section 6: High-Scale Theme Switching with 100+ Annotations Active
  // =========================================================================
  describe('6. High-Scale 100+ Annotations Theme Switching Performance', () => {
    it('C6.1: 50 theme switches on a live workspace with 100 annotations execute with zero graphical or state desync', () => {
      const annotations100 = createScaleAnnotations(100);

      render(
        <ThemeProvider defaultTheme="dark">
          <AppProvider initialState={{ image: mockBaseImage, annotations: annotations100, isSidebarOpen: true }}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AppProvider>
        </ThemeProvider>
      );

      expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('100');
      expect(screen.getAllByTestId(/^note-card-ann-m6-stress-/)).toHaveLength(100);

      const themeToggleBtn = screen.getByTestId('theme-toggle-btn');

      const startTime = performance.now();

      for (let i = 1; i <= 50; i++) {
        act(() => {
          fireEvent.click(themeToggleBtn);
        });

        const expectedMode = i % 2 === 1 ? 'light' : 'dark';
        expect(document.documentElement.classList.contains(expectedMode)).toBe(true);
      }

      const durationMs = performance.now() - startTime;
      expect(durationMs).toBeLessThan(20000);

      // Verify all 100 annotation cards remain intact and rendered
      expect(screen.getAllByTestId(/^note-card-ann-m6-stress-/)).toHaveLength(100);
      expect(screen.getByTestId('sidebar-badge-count')).toHaveTextContent('100');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    }, 30000);
  });
});
