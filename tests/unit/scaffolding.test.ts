import { describe, it, expect } from 'vitest';
import { PRESET_COLORS, COLOR_KEYS } from '../../src/constants/colors';
import { SHORTCUTS } from '../../src/constants/shortcuts';
import { AppState, Annotation } from '../../src/types';

describe('Milestone 1 Scaffolding & Toolchain Smoke Tests', () => {
  it('loads preset colors with all 5 high-contrast themes', () => {
    expect(COLOR_KEYS).toHaveLength(5);
    expect(COLOR_KEYS).toEqual(['red', 'amber', 'green', 'cyan', 'purple']);
    expect(PRESET_COLORS.amber.name).toBe('Amber Gold');
    expect(PRESET_COLORS.red.stroke).toBe('#EF4444');
    expect(PRESET_COLORS.green.stroke).toBe('#10B981');
    expect(PRESET_COLORS.cyan.stroke).toBe('#06B6D4');
    expect(PRESET_COLORS.purple.stroke).toBe('#8B5CF6');
  });

  it('defines comprehensive keyboard shortcuts', () => {
    expect(SHORTCUTS.length).toBeGreaterThanOrEqual(10);
    const pasteShortcut = SHORTCUTS.find(s => s.description.includes('Paste screenshot'));
    expect(pasteShortcut).toBeDefined();
  });

  it('verifies Canvas 2D mock environment works', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    expect(ctx).not.toBeNull();

    ctx?.fillRect(0, 0, 100, 100);
    expect(ctx?.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);

    const dataUrl = canvas.toDataURL('image/png');
    expect(dataUrl).toContain('data:image/png;base64');
  });

  it('verifies navigator.clipboard and ClipboardItem mocks', async () => {
    const blob = new Blob(['test'], { type: 'image/png' });
    const item = new ClipboardItem({ 'image/png': blob });
    expect(item.types).toContain('image/png');

    await navigator.clipboard.write([item]);
    expect(navigator.clipboard.write).toHaveBeenCalledWith([item]);

    await navigator.clipboard.writeText('test markdown notes');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test markdown notes');
  });

  it('verifies type declarations instantiate properly', () => {
    const dummyAnnotation: Annotation = {
      id: 'ann-1',
      index: 1,
      geometry: { type: 'box', x: 10, y: 10, width: 100, height: 80 },
      style: { color: 'amber', strokeWidth: 2, fillOpacity: 0.18 },
      note: 'Check padding',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const dummyState: AppState = {
      image: null,
      overlays: [],
      annotations: [dummyAnnotation],
      selectedAnnotationId: 'ann-1',
      hoveredAnnotationId: null,
      activeTool: 'box',
      activeColor: 'amber',
      activeStrokeWidth: 2,
      activeFillOpacity: 0.18,
      viewport: { zoom: 1.0, panX: 0, panY: 0 },
      isSidebarOpen: true,
      theme: 'dark',
    };

    expect(dummyState.annotations[0].index).toBe(1);
    expect(dummyState.annotations[0].geometry.type).toBe('box');
  });
});
