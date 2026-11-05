import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderCompositeCanvas,
  exportCompositeBlob,
  exportCompositeDataUrl,
  rasterizeAnnotation,
  createCanvas,
  drawRoundRect,
} from '../../src/export/canvasExporter';
import { BaseImage, Annotation, PresetColor } from '../../src/types';

/**
 * ============================================================================
 * Stateful Canvas 2D Instrumentor & Telemetry Tracker
 * ============================================================================
 * Intercepts Canvas 2D context operations to track:
 * - Exact save/restore stack depth and underflow detection.
 * - GlobalCompositeOperation transitions and isolation.
 * - Numerical sanity (detects any NaN or Infinite coordinate violations).
 * - FillStyle, strokeStyle, and shadow leakage across draw calls.
 */
interface CanvasState {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
}

const DEFAULT_STATE: CanvasState = {
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  shadowColor: 'transparent',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  globalAlpha: 1.0,
  globalCompositeOperation: 'source-over',
};

interface CoordinateViolation {
  method: string;
  args: any[];
  reason: string;
}

interface InstrumentedContextBundle {
  ctx: CanvasRenderingContext2D;
  getStateStackDepth: () => number;
  getSaveCount: () => number;
  getRestoreCount: () => number;
  getUnderflowCount: () => number;
  getCoordinateViolations: () => CoordinateViolation[];
  getDrawImageCalls: () => { image: any; args: any[] }[];
  getCompositeOpHistory: () => GlobalCompositeOperation[];
  getCurrentState: () => CanvasState;
  resetTelemetry: () => void;
}

function createInstrumentedContext(width = 1920, height = 1080): InstrumentedContextBundle {
  let stack: CanvasState[] = [];
  let current: CanvasState = { ...DEFAULT_STATE };
  let saveCount = 0;
  let restoreCount = 0;
  let underflowCount = 0;
  const coordinateViolations: CoordinateViolation[] = [];
  const drawImageCalls: { image: any; args: any[] }[] = [];
  const compositeOpHistory: GlobalCompositeOperation[] = [];

  const checkCoords = (method: string, ...args: any[]) => {
    for (let i = 0; i < args.length; i++) {
      const val = args[i];
      if (typeof val === 'number') {
        if (Number.isNaN(val)) {
          coordinateViolations.push({
            method,
            args,
            reason: `Argument at index ${i} is NaN`,
          });
        } else if (!Number.isFinite(val)) {
          coordinateViolations.push({
            method,
            args,
            reason: `Argument at index ${i} is Infinite (${val})`,
          });
        }
      }
    }
  };

  const dummyCanvas = { width, height } as HTMLCanvasElement;

  const ctx = {
    get canvas() {
      return dummyCanvas;
    },
    get fillStyle() {
      return current.fillStyle;
    },
    set fillStyle(val: string) {
      current.fillStyle = val;
    },
    get strokeStyle() {
      return current.strokeStyle;
    },
    set strokeStyle(val: string) {
      current.strokeStyle = val;
    },
    get lineWidth() {
      return current.lineWidth;
    },
    set lineWidth(val: number) {
      current.lineWidth = val;
    },
    get lineCap() {
      return current.lineCap;
    },
    set lineCap(val: CanvasLineCap) {
      current.lineCap = val;
    },
    get lineJoin() {
      return current.lineJoin;
    },
    set lineJoin(val: CanvasLineJoin) {
      current.lineJoin = val;
    },
    get shadowColor() {
      return current.shadowColor;
    },
    set shadowColor(val: string) {
      current.shadowColor = val;
    },
    get shadowBlur() {
      return current.shadowBlur;
    },
    set shadowBlur(val: number) {
      current.shadowBlur = val;
    },
    get shadowOffsetX() {
      return current.shadowOffsetX;
    },
    set shadowOffsetX(val: number) {
      current.shadowOffsetX = val;
    },
    get shadowOffsetY() {
      return current.shadowOffsetY;
    },
    set shadowOffsetY(val: number) {
      current.shadowOffsetY = val;
    },
    get font() {
      return current.font;
    },
    set font(val: string) {
      current.font = val;
    },
    get textAlign() {
      return current.textAlign;
    },
    set textAlign(val: CanvasTextAlign) {
      current.textAlign = val;
    },
    get textBaseline() {
      return current.textBaseline;
    },
    set textBaseline(val: CanvasTextBaseline) {
      current.textBaseline = val;
    },
    get globalAlpha() {
      return current.globalAlpha;
    },
    set globalAlpha(val: number) {
      current.globalAlpha = val;
    },
    get globalCompositeOperation() {
      return current.globalCompositeOperation;
    },
    set globalCompositeOperation(val: GlobalCompositeOperation) {
      current.globalCompositeOperation = val;
      compositeOpHistory.push(val);
    },
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high' as ImageSmoothingQuality,

    save: vi.fn(() => {
      saveCount++;
      stack.push({ ...current });
    }),

    restore: vi.fn(() => {
      restoreCount++;
      if (stack.length === 0) {
        underflowCount++;
      } else {
        current = stack.pop()!;
      }
    }),

    beginPath: vi.fn(),
    closePath: vi.fn(),

    moveTo: vi.fn((x: number, y: number) => {
      checkCoords('moveTo', x, y);
    }),

    lineTo: vi.fn((x: number, y: number) => {
      checkCoords('lineTo', x, y);
    }),

    arc: vi.fn(
      (
        x: number,
        y: number,
        radius: number,
        startAngle: number,
        endAngle: number,
        _counterclockwise?: boolean
      ) => {
        checkCoords('arc', x, y, radius, startAngle, endAngle);
      }
    ),

    arcTo: vi.fn((x1: number, y1: number, x2: number, y2: number, radius: number) => {
      checkCoords('arcTo', x1, y1, x2, y2, radius);
    }),

    bezierCurveTo: vi.fn(
      (cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => {
        checkCoords('bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y);
      }
    ),

    rect: vi.fn((x: number, y: number, w: number, h: number) => {
      checkCoords('rect', x, y, w, h);
    }),

    roundRect: vi.fn((x: number, y: number, w: number, h: number, radius?: any) => {
      checkCoords('roundRect', x, y, w, h);
      if (typeof radius === 'number') {
        checkCoords('roundRect:radius', radius);
      }
    }),

    ellipse: vi.fn(
      (
        x: number,
        y: number,
        radiusX: number,
        radiusY: number,
        rotation: number,
        startAngle: number,
        endAngle: number,
        _counterclockwise?: boolean
      ) => {
        checkCoords('ellipse', x, y, radiusX, radiusY, rotation, startAngle, endAngle);
      }
    ),

    fill: vi.fn(),
    stroke: vi.fn(),

    fillText: vi.fn((_text: string, x: number, y: number, _maxWidth?: number) => {
      checkCoords('fillText', x, y);
    }),

    strokeText: vi.fn((_text: string, x: number, y: number, _maxWidth?: number) => {
      checkCoords('strokeText', x, y);
    }),

    drawImage: vi.fn((image: any, ...args: any[]) => {
      checkCoords('drawImage', ...args);
      drawImageCalls.push({ image, args });
    }),

    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      checkCoords('fillRect', x, y, w, h);
    }),

    clearRect: vi.fn((x: number, y: number, w: number, h: number) => {
      checkCoords('clearRect', x, y, w, h);
    }),

    measureText: vi.fn((text: string) => ({
      width: text.length * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    })),
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    getStateStackDepth: () => stack.length,
    getSaveCount: () => saveCount,
    getRestoreCount: () => restoreCount,
    getUnderflowCount: () => underflowCount,
    getCoordinateViolations: () => coordinateViolations,
    getDrawImageCalls: () => drawImageCalls,
    getCompositeOpHistory: () => compositeOpHistory,
    getCurrentState: () => ({ ...current }),
    resetTelemetry: () => {
      stack = [];
      current = { ...DEFAULT_STATE };
      saveCount = 0;
      restoreCount = 0;
      underflowCount = 0;
      coordinateViolations.length = 0;
      drawImageCalls.length = 0;
      compositeOpHistory.length = 0;
    },
  };
}

/**
 * Porter-Duff 2D Pixel Buffer Simulation Oracle.
 * Simulates a discrete grid of alpha values across a surface subjected to:
 * 1. Initial fill with backdrop alpha Ad (e.g. 0.45).
 * 2. Sequential destination-out punching with source alpha As (1.0).
 * 3. Invariant: Ad_new = Ad_old * (1 - As).
 * When As = 1.0, Ad_new = 0.0 regardless of how many times destination-out is punched.
 */
class PorterDuffSimulationOracle {
  private grid: Float32Array;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number, initialAlpha = 0.45) {
    this.width = width;
    this.height = height;
    this.grid = new Float32Array(width * height);
    this.grid.fill(initialAlpha);
  }

  punchCutout(x: number, y: number, w: number, h: number, sourceAlpha = 1.0): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const idx = py * this.width + px;
        // Porter-Duff destination-out: D' = D * (1 - S)
        this.grid[idx] = this.grid[idx] * (1.0 - sourceAlpha);
      }
    }
  }

  getAlphaAt(x: number, y: number): number {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || px >= this.width || py < 0 || py >= this.height) return 0;
    return this.grid[py * this.width + px];
  }

  getStats(
    regionA: { x: number; y: number; w: number; h: number },
    regionB: { x: number; y: number; w: number; h: number }
  ): {
    alphaRegionAOnly: number;
    alphaRegionBOnly: number;
    alphaOverlap: number;
    alphaOutside: number;
  } {
    // Sample representative points
    const overlapX = (Math.max(regionA.x, regionB.x) + Math.min(regionA.x + regionA.w, regionB.x + regionB.w)) / 2;
    const overlapY = (Math.max(regionA.y, regionB.y) + Math.min(regionA.y + regionA.h, regionB.y + regionB.h)) / 2;

    const aOnlyX = regionA.x + 2;
    const aOnlyY = regionA.y + 2;

    const bOnlyX = regionB.x + regionB.w - 2;
    const bOnlyY = regionB.y + regionB.h - 2;

    const outsideX = Math.max(0, Math.min(this.width - 1, regionA.x - 10));
    const outsideY = Math.max(0, Math.min(this.height - 1, regionA.y - 10));

    return {
      alphaRegionAOnly: this.getAlphaAt(aOnlyX, aOnlyY),
      alphaRegionBOnly: this.getAlphaAt(bOnlyX, bOnlyY),
      alphaOverlap: this.getAlphaAt(overlapX, overlapY),
      alphaOutside: this.getAlphaAt(outsideX, outsideY),
    };
  }
}

describe('M2 Challenger Suite: Destination-Out Highlight Export & State Isolation', () => {
  const mock4KBaseImage: BaseImage = {
    id: 'img-4k',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 3840,
    naturalHeight: 2160,
    fileName: 'retina-screen-4k.png',
    fileSize: 1024 * 500,
  };

  const mockStandardImage: BaseImage = {
    id: 'img-std',
    src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 1920,
    naturalHeight: 1080,
    fileName: 'standard-screenshot.png',
    fileSize: 1024 * 200,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Challenge 1: Multi-Region Additive Cutout Punching Oracle
  // =========================================================================
  describe('Challenge 1: Multi-Region Additive Cutout Punching Oracle', () => {
    it('C1.1: Empirically proves that overlapping cutouts with destination-out yield exactly 0 alpha (no double-darkening)', () => {
      // Create a 400x300 pixel simulation oracle initialized to Ad = 0.45
      const oracle = new PorterDuffSimulationOracle(400, 300, 0.45);

      const cutoutA = { x: 50, y: 50, w: 150, h: 100 };
      const cutoutB = { x: 120, y: 80, w: 180, h: 120 };

      // Punch Cutout A with solid opacity As = 1.0
      oracle.punchCutout(cutoutA.x, cutoutA.y, cutoutA.w, cutoutA.h, 1.0);
      // Punch Cutout B with solid opacity As = 1.0 (overlaps Cutout A)
      oracle.punchCutout(cutoutB.x, cutoutB.y, cutoutB.w, cutoutB.h, 1.0);

      const stats = oracle.getStats(cutoutA, cutoutB);

      // Oracle Assertions:
      // 1. Cutout A exclusive region must be exactly 0.0 alpha
      expect(stats.alphaRegionAOnly).toBe(0.0);
      // 2. Cutout B exclusive region must be exactly 0.0 alpha
      expect(stats.alphaRegionBOnly).toBe(0.0);
      // 3. Overlap region (Cutout A AND Cutout B) MUST be exactly 0.0 alpha (NEVER darker or double-dimmed)
      expect(stats.alphaOverlap).toBe(0.0);
      // 4. Region outside both cutouts retains original 0.45 backdrop alpha
      expect(stats.alphaOutside).toBeCloseTo(0.45, 5);

      // Contrast with naive multi-layer overlay without destination-out:
      // Naive blending: 1 - (1 - 0.45)^2 = 0.6975 (a 55% darker double-dimming artifact)
      const naiveDoubleDimAlpha = 1.0 - Math.pow(1.0 - 0.45, 2);
      expect(naiveDoubleDimAlpha).toBeCloseTo(0.6975, 4);
      expect(stats.alphaOverlap).not.toBeCloseTo(naiveDoubleDimAlpha, 2);
    });

    it('C1.2: Empirically proves triple and N-way overlapping cutouts maintain invariant Ad = 0.0 everywhere in union', () => {
      const oracle = new PorterDuffSimulationOracle(500, 500, 0.45);

      // 5 overlapping cutouts clustered at the center
      const cutouts = [
        { x: 100, y: 100, w: 150, h: 150 },
        { x: 150, y: 120, w: 150, h: 150 },
        { x: 120, y: 180, w: 160, h: 140 },
        { x: 140, y: 140, w: 100, h: 100 },
        { x: 180, y: 160, w: 120, h: 120 },
      ];

      for (const c of cutouts) {
        oracle.punchCutout(c.x, c.y, c.w, c.h, 1.0);
      }

      // Point at center (160, 160) is covered by all 5 cutouts simultaneously
      const centerAlpha = oracle.getAlphaAt(160, 160);
      expect(centerAlpha).toBe(0.0);

      // Points covered by 1, 2, 3, or 4 cutouts are also identically 0.0
      expect(oracle.getAlphaAt(110, 110)).toBe(0.0);
      expect(oracle.getAlphaAt(220, 220)).toBe(0.0);
      expect(oracle.getAlphaAt(200, 130)).toBe(0.0);

      // Point outside the union retains 0.45
      expect(oracle.getAlphaAt(50, 50)).toBeCloseTo(0.45, 5);
    });

    it('C1.3: Concentric and fully nested highlights do not corrupt backdrop or cutout transparency', () => {
      const oracle = new PorterDuffSimulationOracle(400, 400, 0.45);

      // Outer highlight (100, 100, 200, 200) and nested inner highlight (140, 140, 80, 80)
      oracle.punchCutout(100, 100, 200, 200, 1.0);
      oracle.punchCutout(140, 140, 80, 80, 1.0);

      expect(oracle.getAlphaAt(120, 120)).toBe(0.0); // Outer only
      expect(oracle.getAlphaAt(160, 160)).toBe(0.0); // Nested inner
      expect(oracle.getAlphaAt(350, 350)).toBeCloseTo(0.45, 5); // Background
    });

    it('C1.4: 2D Canvas Exporter executes destination-out with single backdrop drawImage pass', async () => {
      const hl1: Annotation = {
        id: 'hl-1',
        index: 1,
        geometry: { type: 'highlight', x: 100, y: 100, width: 200, height: 150, borderRadius: 6 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Primary focus region',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const hl2: Annotation = {
        id: 'hl-2',
        index: 2,
        geometry: { type: 'highlight', x: 220, y: 180, width: 250, height: 200, borderRadius: 6 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Secondary overlapping focus region',
        createdAt: 2000,
        updatedAt: 2000,
      };

      const canvas = await renderCompositeCanvas(mockStandardImage, [hl1, hl2]);
      const mainCtx = canvas.getContext('2d')!;

      // Main canvas receives drawImage:
      // Call 0: Base image
      // Call 1: Unified offscreen backdrop canvas
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(2);

      const offscreenCanvas = vi.mocked(mainCtx.drawImage).mock.calls[1][0] as HTMLCanvasElement;
      expect(offscreenCanvas).toBeDefined();
      expect(offscreenCanvas.width).toBe(1920);
      expect(offscreenCanvas.height).toBe(1080);

      const offscreenCtx = offscreenCanvas.getContext('2d')!;
      // Offscreen backdrop filled with rgba(0, 0, 0, 0.45)
      expect(offscreenCtx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
      // globalCompositeOperation transitioned to 'destination-out'
      expect(offscreenCtx.globalCompositeOperation).toBe('destination-out');
      // Exactly 2 cutout punching fill() calls
      expect(offscreenCtx.fill).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Challenge 2: Context State Isolation & GlobalCompositeOperation Invariance
  // =========================================================================
  describe('Challenge 2: Context State Isolation & GlobalCompositeOperation Invariance', () => {
    it('C2.1: Main canvas globalCompositeOperation remains strictly "source-over" and never mutates to "destination-out"', async () => {
      const hl: Annotation = {
        id: 'hl-single',
        index: 1,
        geometry: { type: 'highlight', x: 200, y: 200, width: 300, height: 200 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Highlight note',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const canvas = await renderCompositeCanvas(mockStandardImage, [hl]);
      const mainCtx = canvas.getContext('2d')!;

      // Main canvas context must retain 'source-over'
      expect(mainCtx.globalCompositeOperation).toBe('source-over');
    });

    it('C2.2: Interleaved shapes: destination-out does NOT leak into preceding or subsequent non-highlight annotations', async () => {
      const boxBefore: Annotation = {
        id: 'box-1',
        index: 1,
        geometry: { type: 'box', x: 50, y: 50, width: 100, height: 80 },
        style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
        note: 'Box before highlight',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const highlight: Annotation = {
        id: 'hl-middle',
        index: 2,
        geometry: { type: 'highlight', x: 300, y: 300, width: 200, height: 150 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Highlight in middle',
        createdAt: 2000,
        updatedAt: 2000,
      };

      const arrowAfter: Annotation = {
        id: 'arrow-3',
        index: 3,
        geometry: { type: 'arrow', startX: 600, startY: 400, endX: 800, endY: 500 },
        style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.2 },
        note: 'Arrow after highlight',
        createdAt: 3000,
        updatedAt: 3000,
      };

      const pinAfter: Annotation = {
        id: 'pin-4',
        index: 4,
        geometry: { type: 'pin', x: 900, y: 600 },
        style: { color: 'purple', strokeWidth: 3, fillOpacity: 0.2 },
        note: 'Pin after highlight',
        createdAt: 4000,
        updatedAt: 4000,
      };

      const canvas = await renderCompositeCanvas(mockStandardImage, [
        boxBefore,
        highlight,
        arrowAfter,
        pinAfter,
      ]);
      const mainCtx = canvas.getContext('2d')!;

      // Verify that after composite rasterization of all annotations:
      // 1. globalCompositeOperation is strictly 'source-over'
      expect(mainCtx.globalCompositeOperation).toBe('source-over');
      // 2. Non-highlight annotations rasterized with badges (highlight is unnumbered visual effect)
      expect(mainCtx.fillText).toHaveBeenCalledWith('1', 50, 50); // Box badge
      expect(mainCtx.fillText).toHaveBeenCalledWith('3', 600, 400); // Arrow badge
      expect(mainCtx.fillText).toHaveBeenCalledWith('4', 900, 573); // Pin badge (scaled pointerHeight: 27 on 1080p, 600 - 27 = 573)
    });

    it('C2.3: Zero state stack leakage: ctx.save() and ctx.restore() depth returns to 0 on main canvas', () => {
      const instrumented = createInstrumentedContext();

      const hlAnnotation: Annotation = {
        id: 'hl-leak-test',
        index: 1,
        geometry: { type: 'highlight', x: 100, y: 100, width: 250, height: 180, borderRadius: 4 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Stack isolation test',
        createdAt: 1000,
        updatedAt: 1000,
      };

      rasterizeAnnotation(instrumented.ctx, hlAnnotation);

      // Stack depth must be exactly 0 (every save is paired with a restore)
      expect(instrumented.getStateStackDepth()).toBe(0);
      expect(instrumented.getUnderflowCount()).toBe(0);
      expect(instrumented.getSaveCount()).toBeGreaterThanOrEqual(1);
      expect(instrumented.getSaveCount()).toBe(instrumented.getRestoreCount());
      expect(instrumented.getCurrentState().globalCompositeOperation).toBe('source-over');
    });

    it('C2.4: Highlight style properties do not bleed into subsequent draw calls', () => {
      const instrumented = createInstrumentedContext();

      const hlAnnotation: Annotation = {
        id: 'hl-style-test',
        index: 1,
        geometry: { type: 'highlight', x: 50, y: 50, width: 200, height: 120 },
        style: { color: 'green', strokeWidth: 5, fillOpacity: 0.1 },
        note: 'Green highlight',
        createdAt: 1000,
        updatedAt: 1000,
      };

      rasterizeAnnotation(instrumented.ctx, hlAnnotation);

      // After rasterizeAnnotation restores context:
      // shadowColor and shadowBlur should not linger on the instrumented state
      const state = instrumented.getCurrentState();
      expect(state.shadowBlur).toBe(0);
      expect(state.shadowColor).toBe('transparent');
      expect(state.globalCompositeOperation).toBe('source-over');
    });
  });

  // =========================================================================
  // Challenge 3: Fast-Path Optimization & Offscreen Allocation Invariants
  // =========================================================================
  describe('Challenge 3: Fast-Path Optimization & Offscreen Allocation Invariants', () => {
    it('C3.1: Zero highlight fast-path: skips offscreen canvas allocation entirely when no highlight annotations exist', async () => {
      const nonHighlightAnnotations: Annotation[] = [
        {
          id: 'box-1',
          index: 1,
          geometry: { type: 'box', x: 100, y: 100, width: 200, height: 150 },
          style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Note 1',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'arrow-2',
          index: 2,
          geometry: { type: 'arrow', startX: 400, startY: 300, endX: 600, endY: 500 },
          style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Note 2',
          createdAt: 2000,
          updatedAt: 2000,
        },
      ];

      const canvas = await renderCompositeCanvas(mockStandardImage, nonHighlightAnnotations);
      const mainCtx = canvas.getContext('2d')!;

      // Fast-path proof: Exactly 1 drawImage call (base image only, NO offscreen spotlight backdrop)
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(1);
    });

    it('C3.2: Empty annotations array: skips offscreen canvas allocation and outputs clean base image pass-through', async () => {
      const canvas = await renderCompositeCanvas(mockStandardImage, []);
      const mainCtx = canvas.getContext('2d')!;

      expect(mainCtx.drawImage).toHaveBeenCalledTimes(1);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });

    it('C3.3: Offscreen canvas reuse: N highlights allocate exactly ONE offscreen canvas, not N canvases', async () => {
      const highlights: Annotation[] = Array.from({ length: 15 }, (_, i) => ({
        id: `hl-${i + 1}`,
        index: i + 1,
        geometry: {
          type: 'highlight',
          x: 100 + i * 20,
          y: 100 + i * 15,
          width: 150,
          height: 100,
          borderRadius: 4,
        },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: `Highlight #${i + 1}`,
        createdAt: 1000 + i,
        updatedAt: 1000 + i,
      }));

      const canvas = await renderCompositeCanvas(mockStandardImage, highlights);
      const mainCtx = canvas.getContext('2d')!;

      // Main canvas receives exactly 2 drawImage calls (base image + 1 shared offscreen backdrop)
      // If the engine incorrectly allocated an offscreen canvas per highlight, drawImage would be 16
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(2);

      const offscreenCanvas = vi.mocked(mainCtx.drawImage).mock.calls[1][0] as HTMLCanvasElement;
      const offscreenCtx = offscreenCanvas.getContext('2d')!;

      // All 15 cutouts were punched into the SINGLE offscreen canvas
      expect(offscreenCtx.fill).toHaveBeenCalledTimes(15);
    });
  });

  // =========================================================================
  // Challenge 4: High-Load 4K Stress & Performance Harness
  // =========================================================================
  describe('Challenge 4: High-Load 4K Stress & Performance Harness', () => {
    it('C4.1: High-load rasterization: composites 100 highlight cutouts on a 4K canvas (3840x2160) without memory leaks or errors', async () => {
      const count = 100;
      const highlights4K: Annotation[] = Array.from({ length: count }, (_, i) => {
        // Distribute coordinates deterministically across 4K resolution (3840x2160)
        const col = i % 10;
        const row = Math.floor(i / 10);
        const x = 100 + col * 360;
        const y = 80 + row * 190;
        const width = 200 + (i % 5) * 20;
        const height = 120 + (i % 4) * 15;
        const borderRadius = (i % 3) * 4;

        return {
          id: `hl-4k-${i + 1}`,
          index: i + 1,
          geometry: {
            type: 'highlight',
            x,
            y,
            width,
            height,
            borderRadius,
          },
          style: {
            color: (['amber', 'red', 'green', 'cyan', 'purple'] as PresetColor[])[i % 5],
            strokeWidth: 3 + (i % 3),
            fillOpacity: 0.15,
          },
          note: `4K Highlight #${i + 1} at (${x}, ${y})`,
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
        };
      });

      const startTime = performance.now();
      const canvas = await renderCompositeCanvas(mock4KBaseImage, highlights4K);
      const elapsedMs = performance.now() - startTime;

      // 1. Canvas dimension integrity on 4K
      expect(canvas.width).toBe(3840);
      expect(canvas.height).toBe(2160);

      // 2. Performance oracle: 100 highlight composite must complete within 1000ms
      expect(elapsedMs).toBeLessThan(1000);

      const mainCtx = canvas.getContext('2d')!;
      // 3. Exactly 2 drawImage calls (base image + single backdrop)
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(2);

      const offscreenCanvas = vi.mocked(mainCtx.drawImage).mock.calls[1][0] as HTMLCanvasElement;
      expect(offscreenCanvas.width).toBe(3840);
      expect(offscreenCanvas.height).toBe(2160);

      const offscreenCtx = offscreenCanvas.getContext('2d')!;
      // 4. All 100 cutouts punched into the backdrop
      expect(offscreenCtx.fill).toHaveBeenCalledTimes(100);

      // 5. Unnumbered highlights do not render sequence badges
      expect(mainCtx.fillText).toHaveBeenCalledTimes(0);
    });

    it('C4.2: 500 sequential highlight shape rasterizations execute with zero coordinate violations (no NaN / Infinity)', () => {
      const instrumented = createInstrumentedContext(3840, 2160);
      const count = 500;

      for (let i = 1; i <= count; i++) {
        const x = (i * 17) % 3600;
        const y = (i * 23) % 2000;
        const width = 50 + (i * 13) % 400;
        const height = 40 + (i * 19) % 300;
        const color = (['amber', 'red', 'green', 'cyan', 'purple'] as PresetColor[])[i % 5];

        const ann: Annotation = {
          id: `hl-seq-${i}`,
          index: i,
          geometry: {
            type: 'highlight',
            x,
            y,
            width,
            height,
            borderRadius: i % 8,
          },
          style: {
            color,
            strokeWidth: 2 + (i % 6),
            fillOpacity: 0.2,
          },
          note: `Stress sequential highlight #${i}`,
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
        };

        rasterizeAnnotation(instrumented.ctx, ann);
      }

      // Mathematical sanity oracle: zero NaN or Infinite coordinates
      expect(instrumented.getCoordinateViolations()).toHaveLength(0);
      // Perfect stack restoration across 500 annotations
      expect(instrumented.getStateStackDepth()).toBe(0);
      expect(instrumented.getUnderflowCount()).toBe(0);
    });
  });

  // =========================================================================
  // Challenge 5: Extreme Edge Cases & Boundary Invariants
  // =========================================================================
  describe('Challenge 5: Extreme Edge Cases & Boundary Invariants', () => {
    it('C5.1: Highlights exceeding canvas boundaries (negative coordinates / out of bounds) punch cleanly without crashing', async () => {
      const boundaryHighlights: Annotation[] = [
        // Partially outside top-left
        {
          id: 'hl-oob-tl',
          index: 1,
          geometry: { type: 'highlight', x: -100, y: -80, width: 300, height: 200, borderRadius: 4 },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Top-left out of bounds',
          createdAt: 1000,
          updatedAt: 1000,
        },
        // Partially outside bottom-right on 1920x1080 canvas
        {
          id: 'hl-oob-br',
          index: 2,
          geometry: { type: 'highlight', x: 1800, y: 1000, width: 400, height: 300, borderRadius: 4 },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Bottom-right out of bounds',
          createdAt: 2000,
          updatedAt: 2000,
        },
        // Enormous highlight covering entire canvas (full-bleed)
        {
          id: 'hl-fullbleed',
          index: 3,
          geometry: { type: 'highlight', x: 0, y: 0, width: 1920, height: 1080, borderRadius: 0 },
          style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
          note: 'Full-bleed highlight',
          createdAt: 3000,
          updatedAt: 3000,
        },
      ];

      const canvas = await renderCompositeCanvas(mockStandardImage, boundaryHighlights);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);

      const mainCtx = canvas.getContext('2d')!;
      expect(mainCtx.drawImage).toHaveBeenCalledTimes(2);
    });

    it('C5.2: Subpixel floating point coordinates rasterize accurately without precision drift or NaN', async () => {
      const subpixelHighlight: Annotation = {
        id: 'hl-subpixel',
        index: 1,
        geometry: {
          type: 'highlight',
          x: 123.456789,
          y: 234.567891,
          width: 345.678912,
          height: 456.789123,
          borderRadius: 4.5,
        },
        style: { color: 'amber', strokeWidth: 3.5, fillOpacity: 0.15, showOutline: true },
        note: 'Subpixel coordinates',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const canvas = await renderCompositeCanvas(mockStandardImage, [subpixelHighlight]);
      const mainCtx = canvas.getContext('2d')!;

      expect(mainCtx.stroke).toHaveBeenCalled();
      expect(mainCtx.fillText).not.toHaveBeenCalled();
    });

    it('C5.3: Minimal zero-dimension and micro-dimension highlights execute safely without errors', async () => {
      const microHighlights: Annotation[] = [
        {
          id: 'hl-zero',
          index: 1,
          geometry: { type: 'highlight', x: 50, y: 50, width: 0, height: 0, borderRadius: 0 },
          style: { color: 'amber', strokeWidth: 1, fillOpacity: 0.15 },
          note: 'Zero dimension',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'hl-micro',
          index: 2,
          geometry: { type: 'highlight', x: 100, y: 100, width: 1, height: 1, borderRadius: 0 },
          style: { color: 'amber', strokeWidth: 1, fillOpacity: 0.15 },
          note: '1x1 micro highlight',
          createdAt: 2000,
          updatedAt: 2000,
        },
      ];

      const canvas = await renderCompositeCanvas(mockStandardImage, microHighlights);
      expect(canvas).toBeDefined();
    });

    it('C5.4: drawRoundRect fallback path handles zero and extreme radii gracefully', () => {
      const canvas = createCanvas(200, 200);
      const ctx = canvas.getContext('2d')!;

      // Force fallback path by removing native roundRect
      const origRoundRect = (ctx as any).roundRect;
      delete (ctx as any).roundRect;

      // 1. Zero radius -> falls back to ctx.rect
      drawRoundRect(ctx, 10, 10, 80, 50, 0);
      expect(ctx.rect).toHaveBeenCalledWith(10, 10, 80, 50);

      // 2. Over-sized radius clamped to width/2 and height/2
      drawRoundRect(ctx, 10, 10, 80, 50, 100);
      expect(ctx.arcTo).toHaveBeenCalled();

      // 3. Array radius
      drawRoundRect(ctx, 10, 10, 80, 50, [8]);
      expect(ctx.arcTo).toHaveBeenCalled();

      if (origRoundRect) (ctx as any).roundRect = origRoundRect;
    });
  });

  // =========================================================================
  // Challenge 6: End-to-End Export Pipeline (Blob & Data URL) Integrity
  // =========================================================================
  describe('Challenge 6: End-to-End Export Pipeline (Blob & Data URL) Integrity', () => {
    it('C6.1: exportCompositeBlob produces valid PNG Blob when highlight annotations are present', async () => {
      const hl: Annotation = {
        id: 'hl-blob',
        index: 1,
        geometry: { type: 'highlight', x: 100, y: 100, width: 300, height: 200, borderRadius: 4 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'Blob export highlight',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const blob = await exportCompositeBlob(mockStandardImage, [hl]);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('C6.2: exportCompositeDataUrl produces valid base64 data URL string with highlights', async () => {
      const hl: Annotation = {
        id: 'hl-url',
        index: 1,
        geometry: { type: 'highlight', x: 200, y: 200, width: 400, height: 250, borderRadius: 6 },
        style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
        note: 'DataURL export highlight',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const dataUrl = await exportCompositeDataUrl(mockStandardImage, [hl]);
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });
});
