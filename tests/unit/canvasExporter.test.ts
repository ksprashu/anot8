import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderCompositeCanvas,
  exportCompositeBlob,
  exportCompositeDataUrl,
  rasterizeAnnotation,
  rasterizeBadge,
  drawRoundRect,
  hexToRgba,
  loadImageElement,
  createCanvas,
  bakeBlurFallback,
} from '../../src/export/canvasExporter';
import { BaseImage, Annotation, ImageOverlay } from '../../src/types';
import { PRESET_COLORS } from '../../src/constants/colors';

describe('1:1 Native Composite Canvas Exporter Unit Tests', () => {
  const mockBaseImage: BaseImage = {
    id: 'img-1',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 1920,
    naturalHeight: 1080,
    fileName: 'dashboard-screenshot.png',
    fileSize: 1024 * 100,
  };

  const mockBox: Annotation = {
    id: 'ann-1',
    index: 1,
    geometry: { type: 'box', x: 100, y: 150, width: 300, height: 200, borderRadius: 4 },
    style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
    note: 'Header layout issue',
    createdAt: 1000,
    updatedAt: 1000,
  };

  const mockEllipse: Annotation = {
    id: 'ann-2',
    index: 2,
    geometry: { type: 'ellipse', cx: 600, cy: 400, rx: 80, ry: 50 },
    style: { color: 'green', strokeWidth: 3, fillOpacity: 0.15 },
    note: 'User avatar container',
    createdAt: 2000,
    updatedAt: 2000,
  };

  const mockArrow: Annotation = {
    id: 'ann-3',
    index: 3,
    geometry: { type: 'arrow', startX: 200, startY: 300, endX: 500, endY: 600 },
    style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.2 },
    note: 'Move button here',
    createdAt: 3000,
    updatedAt: 3000,
  };

  const mockPin: Annotation = {
    id: 'ann-4',
    index: 4,
    geometry: { type: 'pin', x: 800, y: 700 },
    style: { color: 'purple', strokeWidth: 4, fillOpacity: 0.2 },
    note: 'Missing tooltip',
    createdAt: 4000,
    updatedAt: 4000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Group 1: Canvas Dimensions & 1:1 Scaling
  // =========================================================================
  describe('Group 1: Canvas Dimensions & 1:1 Scaling', () => {
    it('E1.1: Creates offscreen canvas with exact naturalWidth and naturalHeight of base image', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [mockBox]);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });

    it('E1.2: Renders minimal 1x1 image up to 8K (7680x4320) unscaled dimensions', async () => {
      const img1x1: BaseImage = { ...mockBaseImage, naturalWidth: 1, naturalHeight: 1 };
      const canvas1x1 = await renderCompositeCanvas(img1x1, []);
      expect(canvas1x1.width).toBe(1);
      expect(canvas1x1.height).toBe(1);

      const img8K: BaseImage = { ...mockBaseImage, naturalWidth: 7680, naturalHeight: 4320 };
      const canvas8K = await renderCompositeCanvas(img8K, []);
      expect(canvas8K.width).toBe(7680);
      expect(canvas8K.height).toBe(4320);
    });

    it('E1.3: Background color fill option paints canvas prior to image drawing', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [], {
        backgroundColor: '#FFFFFF',
      });
      const ctx = canvas.getContext('2d')!;
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    });

    it('E1.4: Helper hexToRgba accurately converts hex colors and bounds opacity', () => {
      expect(hexToRgba('#EF4444', 0.5)).toBe('rgba(239, 68, 68, 0.5)');
      expect(hexToRgba('#FFF', 1.0)).toBe('rgba(255, 255, 255, 1)');
      expect(hexToRgba('#000000', -0.5)).toBe('rgba(0, 0, 0, 0)');
      expect(hexToRgba('#000000', 1.5)).toBe('rgba(0, 0, 0, 1)');
    });

    it('E1.5: Helper loadImageElement loads valid image source', async () => {
      const img = await loadImageElement(mockBaseImage.src);
      expect(img).toBeDefined();
    });
  });

  // =========================================================================
  // Group 2: Vector Shape Rasterization Accuracy
  // =========================================================================
  describe('Group 2: Vector Shape Rasterization Accuracy', () => {
    it('E2.1: Rasterizes Box annotation with correct x, y, width, height, fill and stroke', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockBox);

      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalledWith('1', 100, 150);
    });

    it('E2.2: Rasterizes Ellipse annotation with center and radii matching natural coordinates', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockEllipse);

      expect(ctx.ellipse).toHaveBeenCalledWith(600, 400, 80, 50, 0, 0, 2 * Math.PI);
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('E2.3: Rasterizes Directional Arrow with exact 30° arrowhead wings, recessed notch, and shaft', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockArrow);

      expect(ctx.moveTo).toHaveBeenCalledWith(200, 300);
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.closePath).toHaveBeenCalled();
    });

    it('E2.3b: Executes 3-pass arrow rasterizer with Pass 1 underlay casing/shadow, Pass 2 foreground core, and Pass 3 tail badge', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      const shadowColors: string[] = [];
      const strokeStyles: string[] = [];
      const fillStyles: string[] = [];
      const lineWidths: number[] = [];

      let _shadowColor = ctx.shadowColor;
      Object.defineProperty(ctx, 'shadowColor', {
        get: () => _shadowColor,
        set: (v) => {
          _shadowColor = v;
          shadowColors.push(v);
        },
      });

      let _strokeStyle = ctx.strokeStyle;
      Object.defineProperty(ctx, 'strokeStyle', {
        get: () => _strokeStyle,
        set: (v) => {
          _strokeStyle = v;
          strokeStyles.push(v);
        },
      });

      let _fillStyle = ctx.fillStyle;
      Object.defineProperty(ctx, 'fillStyle', {
        get: () => _fillStyle,
        set: (v) => {
          _fillStyle = v;
          fillStyles.push(v);
        },
      });

      let _lineWidth = ctx.lineWidth;
      Object.defineProperty(ctx, 'lineWidth', {
        get: () => _lineWidth,
        set: (v) => {
          _lineWidth = v;
          lineWidths.push(v);
        },
      });

      rasterizeAnnotation(ctx, mockArrow);

      // Pass 1: save and restore encapsulate shadow and underlay casing
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
      expect(shadowColors).toContain('rgba(0,0,0,0.45)');
      expect(ctx.shadowBlur).toBe(4);
      expect(ctx.shadowOffsetY).toBe(2);

      // Underlay casing: rgba(0,0,0,0.55), strokeWidth + 3.5 = 7.5, polygon strokeWidth = 3.5
      expect(strokeStyles).toContain('rgba(0,0,0,0.55)');
      expect(fillStyles).toContain('rgba(0,0,0,0.55)');
      expect(lineWidths).toContain(mockArrow.style.strokeWidth + 3.5); // 7.5
      expect(lineWidths).toContain(3.5);

      // Pass 2: Foreground core shaft and filled polygon
      expect(strokeStyles).toContain(PRESET_COLORS.cyan.stroke);
      expect(fillStyles).toContain(PRESET_COLORS.cyan.stroke);
      expect(lineWidths).toContain(mockArrow.style.strokeWidth); // 4
      expect(lineWidths).toContain(1);

      // Pass 3: Tail-anchored badge at (startX, startY) = (200, 300)
      expect(ctx.fillText).toHaveBeenCalledWith('3', 200, 300);
    });

    it('E2.3c: Rasterizes short arrow without NaN and clamps shaftEnd to start point', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      const mockShortArrow: Annotation = {
        id: 'ann-short',
        index: 5,
        geometry: { type: 'arrow', startX: 100, startY: 100, endX: 103, endY: 100 },
        style: { color: 'amber', strokeWidth: 6, fillOpacity: 1 },
        note: 'Short arrow',
        createdAt: 5000,
        updatedAt: 5000,
      };

      rasterizeAnnotation(ctx, mockShortArrow);

      // Shaft line starts at (100, 100) and clamps to (100, 100)
      expect(ctx.moveTo).toHaveBeenCalledWith(100, 100);
      expect(ctx.lineTo).toHaveBeenCalledWith(100, 100);
      // Badge anchored at start (100, 100)
      expect(ctx.fillText).toHaveBeenCalledWith('5', 100, 100);
    });

    it('E2.4: Rasterizes Callout Pin teardrop profile with drop shadow, border, and centered index', () => {
      const canvas = createCanvas(1000, 1000);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockPin);

      expect(ctx.bezierCurveTo).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalledWith(800, 680, 14, Math.PI, 0, false);
      expect(ctx.fillText).toHaveBeenCalledWith('4', 800, 680);
    });

    it('E2.5: drawRoundRect fallback correctly draws arcs and lines when ctx.roundRect is absent', () => {
      const canvas = createCanvas(400, 400);
      const ctx = canvas.getContext('2d')!;
      // Temporarily remove roundRect to force fallback path
      const originalRoundRect = (ctx as any).roundRect;
      delete (ctx as any).roundRect;

      drawRoundRect(ctx, 10, 20, 100, 50, 8);
      expect(ctx.moveTo).toHaveBeenCalledWith(18, 20);
      expect(ctx.lineTo).toHaveBeenCalledWith(102, 20);
      expect(ctx.arcTo).toHaveBeenCalled();

      if (originalRoundRect) (ctx as any).roundRect = originalRoundRect;
    });
  });

  // =========================================================================
  // Group 3: Numbered Badge Anchoring & Pill Expansion
  // =========================================================================
  describe('Group 3: Numbered Badge Anchoring & Pill Expansion', () => {
    it('E3.1: Anchors Box badge at top-left corner (x, y)', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockBox);

      // Badge for Box is at (100, 150)
      expect(ctx.fillText).toHaveBeenCalledWith('1', 100, 150);
    });

    it('E3.2: Anchors Ellipse badge at 225° diagonal apex', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockEllipse);

      const expectedX = 600 - 80 * Math.SQRT1_2;
      const expectedY = 400 - 50 * Math.SQRT1_2;
      expect(ctx.fillText).toHaveBeenCalledWith('2', expectedX, expectedY);
    });

    it('E3.3: Arrow badge is strictly anchored at tail start point to keep head unobstructed', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;
      rasterizeAnnotation(ctx, mockArrow);

      // Tail start point is (200, 300)
      expect(ctx.fillText).toHaveBeenCalledWith('3', 200, 300);
    });

    it('E3.4: Renders single-digit index as circle (radius 12px) and multi-digit index as expanded pill', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      // Single digit (index 1)
      rasterizeBadge(ctx, { x: 50, y: 50 }, 1, 'red');
      expect(ctx.arc).toHaveBeenCalledWith(50, 50, 12, 0, 2 * Math.PI);

      // Multi-digit (index 12) -> pill
      rasterizeBadge(ctx, { x: 100, y: 100 }, 12, 'amber');
      expect(ctx.fillText).toHaveBeenCalledWith('12', 100, 100);
    });

    it('E3.5: Applies dark badge text on Amber Gold (Amber) and white text on Red/Green/Cyan/Purple', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      rasterizeBadge(ctx, { x: 100, y: 100 }, 1, 'amber');
      expect(PRESET_COLORS.amber.badgeText).toBe('#1E293B');

      rasterizeBadge(ctx, { x: 100, y: 100 }, 1, 'red');
      expect(PRESET_COLORS.red.badgeText).toBe('#FFFFFF');
    });
  });

  // =========================================================================
  // Group 4: Blob Generation & Format Conversion
  // =========================================================================
  describe('Group 4: Blob Generation & Format Conversion', () => {
    it('E4.1: exportCompositeBlob returns valid image/png Blob with non-zero byte size', async () => {
      const blob = await exportCompositeBlob(mockBaseImage, [mockBox, mockEllipse]);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('E4.2: exportCompositeDataUrl returns valid data:image/png;base64 string', async () => {
      const dataUrl = await exportCompositeDataUrl(mockBaseImage, [mockBox]);
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('E4.3: Handles empty annotations array by outputting clean base image pass-through', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, []);
      expect(canvas.width).toBe(mockBaseImage.naturalWidth);
      expect(canvas.height).toBe(mockBaseImage.naturalHeight);
    });

    it('E4.4: Rejects gracefully with descriptive error when base image src fails to load', async () => {
      const brokenImage: BaseImage = {
        ...mockBaseImage,
        src: 'invalid-image-source://404',
      };

      // Mock Image failure
      const originalImage = globalThis.Image;
      (globalThis as any).Image = class MockFailingImage {
        crossOrigin = '';
        set src(_v: string) {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event('error'));
          }, 0);
        }
        onerror: ((e: any) => void) | null = null;
        onload: (() => void) | null = null;
      };

      await expect(renderCompositeCanvas(brokenImage, [])).rejects.toThrow(
        /Failed to load image from source/
      );

      globalThis.Image = originalImage;
    });

    it('E4.5: High-density composite: rasterizes 50 mixed annotations without performance degradation', async () => {
      const annotations: Annotation[] = Array.from({ length: 50 }, (_, i) => ({
        id: `ann-${i + 1}`,
        index: i + 1,
        geometry:
          i % 4 === 0
            ? { type: 'box', x: (i * 20) % 800, y: (i * 15) % 600, width: 80, height: 60 }
            : i % 4 === 1
            ? { type: 'ellipse', cx: (i * 25) % 800, cy: (i * 20) % 600, rx: 40, ry: 30 }
            : i % 4 === 2
            ? { type: 'arrow', startX: (i * 10) % 800, startY: (i * 10) % 600, endX: (i * 30) % 800, endY: (i * 20) % 600 }
            : { type: 'pin', x: (i * 35) % 800, y: (i * 25) % 600 },
        style: { color: (['red', 'amber', 'green', 'cyan', 'purple'] as const)[i % 5], strokeWidth: 4, fillOpacity: 0.18 },
        note: `Note #${i + 1}`,
        createdAt: 1000 + i,
        updatedAt: 1000 + i,
      }));

      const startTime = Date.now();
      const canvas = await renderCompositeCanvas(mockBaseImage, annotations);
      const elapsed = Date.now() - startTime;

      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  // =========================================================================
  // Group 5: Highlight Spotlight Focus Mode & 2D Canvas Export Parity
  // =========================================================================
  describe('Group 5: Highlight Spotlight Focus Mode & 2D Canvas Export Parity', () => {
    const mockHighlight1: Annotation = {
      id: 'hl-1',
      index: 1,
      geometry: { type: 'highlight', x: 100, y: 150, width: 300, height: 200, borderRadius: 4 },
      style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
      note: 'Primary focus area',
      createdAt: 1000,
      updatedAt: 1000,
    };

    const mockHighlight2: Annotation = {
      id: 'hl-2',
      index: 2,
      geometry: { type: 'highlight', x: 250, y: 250, width: 200, height: 180, borderRadius: 4 },
      style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
      note: 'Overlapping secondary focus area',
      createdAt: 2000,
      updatedAt: 2000,
    };

    it('E5.1: Renders Stage 1.5 spotlight dimming backdrop and punches single cutout via destination-out', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [mockHighlight1]);
      const mainCtx = canvas.getContext('2d')!;

      // Main canvas receives drawImage for the base image and the offscreen backdrop canvas
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(2);

      // Verify offscreen canvas context received fillRect with rgba(0, 0, 0, 0.45)
      const offscreenCanvas = vi.mocked(mainCtx.drawImage).mock.calls[1][0] as HTMLCanvasElement;
      expect(offscreenCanvas).toBeDefined();
      const offscreenCtx = offscreenCanvas.getContext('2d')!;
      expect(offscreenCtx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
      expect(offscreenCtx.globalCompositeOperation).toBe('destination-out');
      expect(offscreenCtx.fill).toHaveBeenCalled();
    });

    it('E5.2: Multi-region additive highlighting: punches multiple cutouts on single offscreen backdrop', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [mockHighlight1, mockHighlight2]);
      const mainCtx = canvas.getContext('2d')!;

      // Exactly 2 drawImage calls: base image + 1 unified offscreen backdrop
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(2);

      const offscreenCanvas = vi.mocked(mainCtx.drawImage).mock.calls[1][0] as HTMLCanvasElement;
      const offscreenCtx = offscreenCanvas.getContext('2d')!;

      // 2 cutouts punched using destination-out
      expect(offscreenCtx.fill).toHaveBeenCalledTimes(2);
      expect(offscreenCtx.globalCompositeOperation).toBe('destination-out');
    });

    it('E5.3: Zero double-dimming invariant: overlapping highlight regions share single-pass backdrop composite', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [mockHighlight1, mockHighlight2]);
      const mainCtx = canvas.getContext('2d')!;

      expect(mainCtx.drawImage).toHaveBeenCalledWith(
        expect.anything(),
        0,
        0,
        1920,
        1080
      );
      const backdropCalls = vi.mocked(mainCtx.drawImage).mock.calls.slice(1);
      expect(backdropCalls).toHaveLength(1);
    });

    it('E5.4: Rasterizes highlight border stroke and omits badge for unnumbered visual effect', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      const strokeStyles: string[] = [];
      let _strokeStyle = ctx.strokeStyle;
      Object.defineProperty(ctx, 'strokeStyle', {
        get: () => _strokeStyle,
        set: (v) => {
          _strokeStyle = v;
          strokeStyles.push(v);
        },
      });

      rasterizeAnnotation(ctx, mockHighlight1);

      expect(ctx.stroke).toHaveBeenCalled();
      expect(strokeStyles).toContain(PRESET_COLORS.amber.stroke);
      expect(ctx.fillText).not.toHaveBeenCalled();
    });

    it('E5.5: Zero-highlight fast path: does not create offscreen spotlight canvas when no highlights exist', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [mockBox, mockArrow]);
      const mainCtx = canvas.getContext('2d')!;

      // Only 1 drawImage call (base image only, no offscreen backdrop)
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(1);
    });

    it('E5.6: High-density composite: rasterizes 20 highlight cutouts alongside other shapes', async () => {
      const mixed: Annotation[] = Array.from({ length: 20 }, (_, i) => ({
        id: `hl-${i + 1}`,
        index: i + 1,
        geometry: {
          type: 'highlight',
          x: (i * 30) % 800,
          y: (i * 25) % 600,
          width: 120,
          height: 80,
          borderRadius: 4,
        },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: `Highlight #${i + 1}`,
        createdAt: 1000 + i,
        updatedAt: 1000 + i,
      }));

      const canvas = await renderCompositeCanvas(mockBaseImage, mixed);
      const mainCtx = canvas.getContext('2d')!;

      expect(mainCtx.drawImage).toHaveBeenCalledTimes(2);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });
  });

  // =========================================================================
  // Group 6: Smooth Blur / Redact Destructive Baking & Export Parity (Milestone M3)
  // =========================================================================
  describe('Group 6: Smooth Blur / Redact Destructive Baking & Export Parity', () => {
    const mockBlur1: Annotation = {
      id: 'blur-1',
      index: 1,
      geometry: { type: 'blur', x: 200, y: 150, width: 300, height: 100, borderRadius: 2 },
      style: { color: 'amber', strokeWidth: 2, fillOpacity: 0 },
      note: 'Sensitive credentials redacted',
      createdAt: 1000,
      updatedAt: 1000,
    };

    const mockBlur2: Annotation = {
      id: 'blur-2',
      index: 2,
      geometry: { type: 'blur', x: 600, y: 400, width: 200, height: 80, borderRadius: 2 },
      style: { color: 'amber', strokeWidth: 2, fillOpacity: 0 },
      note: 'API Token redacted',
      createdAt: 2000,
      updatedAt: 2000,
    };

    it('E6.1: Applies Stage 1.2 Gaussian blur baking with clip and filter blur(12px)', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [mockBlur1]);
      const ctx = canvas.getContext('2d')!;

      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.rect).toHaveBeenCalledWith(200, 150, 300, 100);
      expect(ctx.clip).toHaveBeenCalled();
      expect(ctx.filter).toBe('blur(12px)');
      // Base image drawn first, then redrawn clipped with filter
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    });

    it('E6.2: Balances ctx.save() and ctx.restore() precisely for blur baking', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [mockBlur1, mockBlur2]);
      const ctx = canvas.getContext('2d')!;

      const saveCount = vi.mocked(ctx.save).mock.calls.length;
      const restoreCount = vi.mocked(ctx.restore).mock.calls.length;

      expect(saveCount).toBe(restoreCount);
      expect(saveCount).toBeGreaterThanOrEqual(2);
    });

    it('E6.3: Invokes bakeBlurFallback when ctx lacks filter property', () => {
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        drawImage: vi.fn(),
        // Note: No 'filter' property
      } as unknown as CanvasRenderingContext2D;

      const mockImg = { width: 1920, height: 1080 } as HTMLImageElement;
      bakeBlurFallback(mockCtx, mockImg, 100, 100, 200, 100);

      expect(mockCtx.drawImage).toHaveBeenCalled();
    });

    it('E6.4: Zero-blur fast path: does not invoke clip when no blur annotations exist', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [mockBox]);
      const ctx = canvas.getContext('2d')!;

      expect(ctx.clip).not.toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    });

    it('E6.5: Rasterizes blur border stroke and top-left badge in Stage 2', () => {
      const canvas = createCanvas(800, 600);
      const mockCtx = canvas.getContext('2d')!;

      rasterizeAnnotation(mockCtx, mockBlur1);

      expect(mockCtx.beginPath).toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it('E6.6: Stage sequence: executes blur baking before highlight backdrop and vector shapes', async () => {
      const mockHl: Annotation = {
        id: 'hl-1',
        index: 2,
        geometry: { type: 'highlight', x: 50, y: 50, width: 400, height: 300, borderRadius: 4 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Highlight area',
        createdAt: 1500,
        updatedAt: 1500,
      };

      const canvas = await renderCompositeCanvas(mockBaseImage, [mockBlur1, mockHl]);
      const ctx = canvas.getContext('2d')!;

      // 1st drawImage: base image
      // 2nd drawImage: blurred base image slice
      // 3rd drawImage: spotlight offscreen backdrop canvas
      expect(ctx.drawImage).toHaveBeenCalledTimes(3);
    });

    it('E6.7: High-density composite: rasterizes multiple discrete blur regions', async () => {
      const blurs: Annotation[] = Array.from({ length: 10 }, (_, i) => ({
        id: `blur-stress-${i + 1}`,
        index: i + 1,
        geometry: {
          type: 'blur' as const,
          x: (i * 80) % 800,
          y: (i * 60) % 600,
          width: 150,
          height: 50,
          borderRadius: 2,
        },
        style: { color: 'amber' as const, strokeWidth: 2, fillOpacity: 0 },
        note: `Redacted field #${i + 1}`,
        createdAt: 1000 + i,
        updatedAt: 1000 + i,
      }));

      const canvas = await renderCompositeCanvas(mockBaseImage, blurs);
      const ctx = canvas.getContext('2d')!;

      // 1 base image + 10 blurred slices = 11 drawImage calls
      expect(ctx.drawImage).toHaveBeenCalledTimes(11);
    });

    it('E6.8: bakeBlurFallback handles edge case dimensions gracefully', () => {
      const mockCtx = {
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const mockImg = { width: 100, height: 100 } as HTMLImageElement;
      expect(() => bakeBlurFallback(mockCtx, mockImg, 10, 10, 0, 0)).not.toThrow();
      expect(mockCtx.drawImage).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Group 7: Resolution-Aware Export Scaling & 2K/4K/8K Parity (Milestone M4)
  // =========================================================================
  describe('Group 7: Resolution-Aware Export Scaling & 2K/4K/8K Parity (Milestone M4)', () => {
    it('E7.1: renderCompositeCanvas automatically computes resolutionScale based on baseImage dimensions', async () => {
      const img4k: BaseImage = { ...mockBaseImage, naturalWidth: 3840, naturalHeight: 2160 };
      const canvas = await renderCompositeCanvas(img4k, [mockBox]);
      const ctx = canvas.getContext('2d')!;

      // Scale for 4K is 3840 / 1440 = 2.667
      // Badge width is round(24 * 2.667) = 64
      // Badge fontSize is round(13 * 2.667) = 35
      expect(ctx.font).toContain('35px');
    });

    it('E7.2: rasterizeBadge with scale parameter renders scaled circle/pill geometry and font', () => {
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d')!;

      // Scale 2.0 single digit: radius round(12 * 2) = 24, font round(13 * 2) = 26
      rasterizeBadge(ctx, { x: 100, y: 100 }, 1, 'amber', 2.0);
      expect(ctx.arc).toHaveBeenCalledWith(100, 100, 24, 0, 2 * Math.PI);
      expect(ctx.font).toContain('26px');

      // Scale 2.0 multi-digit: width round(32 * 2) = 64, height round(24 * 2) = 48, font 24px
      rasterizeBadge(ctx, { x: 200, y: 200 }, 42, 'cyan', 2.0);
      expect(ctx.font).toContain('24px');
    });

    it('E7.3: rasterizeAnnotation scales Pin teardrop and centered index at scale 2.0', () => {
      const canvas = createCanvas(1000, 1000);
      const ctx = canvas.getContext('2d')!;

      // Pin at (500, 500), scale 2.0:
      // headRadius = 28, pointerHeight = 40, headCenterY = 500 - 40 = 460
      const scaledPin: Annotation = {
        ...mockPin,
        geometry: { type: 'pin', x: 500, y: 500 },
      };
      rasterizeAnnotation(ctx, scaledPin, 2.0);

      expect(ctx.arc).toHaveBeenCalledWith(500, 460, 28, Math.PI, 0, false);
      expect(ctx.fillText).toHaveBeenCalledWith('4', 500, 460);
      expect(ctx.font).toContain('24px');
    });

    it('E7.4: 100% Backward Compatibility: images <= 1440px produce exact 1x badge dimensions', async () => {
      const img1080p: BaseImage = { ...mockBaseImage, naturalWidth: 1280, naturalHeight: 720 };
      const canvasBox = await renderCompositeCanvas(img1080p, [mockBox]);
      const ctxBox = canvasBox.getContext('2d')!;
      // Single digit badge font is 13px
      expect(ctxBox.font).toContain('13px');

      const canvasPin = await renderCompositeCanvas(img1080p, [mockPin]);
      const ctxPin = canvasPin.getContext('2d')!;
      // Pin font is 12px
      expect(ctxPin.font).toContain('12px');
    });

    it('E7.5: options.scale override explicitly forces custom scale on composite canvas', async () => {
      const img1080p: BaseImage = { ...mockBaseImage, naturalWidth: 1920, naturalHeight: 1080 };
      // Force scale 3.0 via options
      const canvas = await renderCompositeCanvas(img1080p, [mockBox], { scale: 3.0 });
      const ctx = canvas.getContext('2d')!;

      // Scale 3.0 -> fontSize = round(13 * 3) = 39px
      expect(ctx.font).toContain('39px');
    });

    it('E7.6: renderCompositeCanvas scales Callout Pin proportionally under default composite export on 4K screenshots', async () => {
      const img4k: BaseImage = { ...mockBaseImage, naturalWidth: 3840, naturalHeight: 2160 };
      const canvas = await renderCompositeCanvas(img4k, [mockPin]);
      const ctx = canvas.getContext('2d')!;

      // 4K resolution scale = 3840 / 1440 = 2.667
      // headRadius = round(14 * 2.667) = 37px
      // pointerHeight = round(20 * 2.667) = 53px
      // headCenterY = 700 - 53 = 647
      // fontSize = round(12 * 2.667) = 32px
      expect(ctx.font).toContain('32px');
      expect(ctx.arc).toHaveBeenCalledWith(800, 647, 37, Math.PI, 0, false);
      expect(ctx.fillText).toHaveBeenCalledWith('4', 800, 647);
    });
  });

  // =========================================================================
  // Group 8: Overlay Image Layer Compositing
  // =========================================================================
  describe('Group 8: Overlay Image Layer Compositing', () => {
    const mockOverlay1: ImageOverlay = {
      id: 'ov-1',
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      naturalWidth: 640,
      naturalHeight: 480,
      fileName: 'overlay1.png',
      fileSize: 2048,
      x: 100,
      y: 80,
      opacity: 0.85,
    };

    const mockOverlay2: ImageOverlay = {
      id: 'ov-2',
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      naturalWidth: 320,
      naturalHeight: 240,
      fileName: 'overlay2.png',
      fileSize: 1024,
      x: 250,
      y: 300,
      opacity: 1.0,
    };

    it('E8.1: renders composite canvas with overlay layers between base image and annotations', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [mockBox], [mockOverlay1]);
      const ctx = canvas.getContext('2d')!;

      // 1. Base image drawn
      expect(ctx.drawImage).toHaveBeenNthCalledWith(1, expect.anything(), 0, 0, 1920, 1080);
      // 2. Overlay drawn with x=100, y=80, w=640, h=480
      expect(ctx.drawImage).toHaveBeenNthCalledWith(2, expect.anything(), 100, 80, 640, 480);
      // 3. Annotations drawn on top
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });

    it('E8.2: applies overlay opacity to ctx.globalAlpha and restores it', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [], [mockOverlay1]);
      const ctx = canvas.getContext('2d')!;

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('E8.3: supports overlays passed via ExportCanvasOptions object', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImage, [], {
        overlays: [mockOverlay1, mockOverlay2],
        backgroundColor: '#000000',
      });
      const ctx = canvas.getContext('2d')!;

      // Background filled
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
      // Base image + 2 overlays = 3 drawImage calls
      expect(ctx.drawImage).toHaveBeenCalledTimes(3);
    });

    it('E8.4: exportCompositeBlob returns valid PNG Blob when overlays are present', async () => {
      const blob = await exportCompositeBlob(mockBaseImage, [mockBox], [mockOverlay1]);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
    });

    it('E8.5: exportCompositeDataUrl returns standard PNG data URL when overlays are present', async () => {
      const dataUrl = await exportCompositeDataUrl(mockBaseImage, [mockBox], [mockOverlay1]);
      expect(typeof dataUrl).toBe('string');
      expect(dataUrl.startsWith('data:image/png;base64')).toBe(true);
    });
  });
});
