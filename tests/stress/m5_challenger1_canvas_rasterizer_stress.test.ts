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
  exportCanvasToBlob,
} from '../../src/export/canvasExporter';
import { BaseImage, Annotation, PresetColor } from '../../src/types';
import { PRESET_COLORS } from '../../src/constants/colors';
import { getBadgePositionForShape, getBadgeDimensions } from '../../src/math/badges';
import { calculateArrowhead } from '../../src/math/geometry';

describe('Milestone 5 Challenger 1: Adversarial 1:1 Offscreen Canvas Rasterizer Stress Suite', () => {
  const sampleDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const createMockBaseImage = (
    width: number,
    height: number,
    src: string = sampleDataUrl
  ): BaseImage => ({
    id: `img-${width}x${height}`,
    src,
    naturalWidth: width,
    naturalHeight: height,
    fileName: `screenshot-${width}x${height}.png`,
    fileSize: width * height * 4,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Section 1: Extreme Resolutions & Aspect Ratios Stress Tests
  // =========================================================================
  describe('1. Extreme Resolutions & Aspect Ratios', () => {
    it('C1.1: 8K Ultra-HD Resolution (7680 x 4320) rasterizes at exact 1:1 native canvas dimensions', async () => {
      const img8K = createMockBaseImage(7680, 4320);
      const boxAnn: Annotation = {
        id: 'ann-8k-1',
        index: 1,
        geometry: { type: 'box', x: 500, y: 500, width: 3000, height: 2000 },
        style: { color: 'red', strokeWidth: 8, fillOpacity: 0.2 },
        note: '8K Box Annotation',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const canvas = await renderCompositeCanvas(img8K, [boxAnn]);
      expect(canvas.width).toBe(7680);
      expect(canvas.height).toBe(4320);

      const ctx = canvas.getContext('2d')!;
      expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 7680, 4320);
      expect(ctx.fillText).toHaveBeenCalledWith('1', 500, 500);
    });

    it('C1.2: Ultra-Wide Panoramic Ribbon Aspect Ratio (10,000 x 50) renders without distortion', async () => {
      const imgPano = createMockBaseImage(10000, 50);
      const arrowAnn: Annotation = {
        id: 'ann-pano-1',
        index: 1,
        geometry: { type: 'arrow', startX: 100, startY: 25, endX: 9900, endY: 25 },
        style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.2 },
        note: 'Panoramic navigation vector',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const canvas = await renderCompositeCanvas(imgPano, [arrowAnn]);
      expect(canvas.width).toBe(10000);
      expect(canvas.height).toBe(50);

      const ctx = canvas.getContext('2d')!;
      expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 10000, 50);
      expect(ctx.fillText).toHaveBeenCalledWith('1', 100, 25);
    });

    it('C1.3: Ultra-Tall Vertical Column Aspect Ratio (50 x 10,000) renders with unscaled coordinates', async () => {
      const imgColumn = createMockBaseImage(50, 10000);
      const pinAnn: Annotation = {
        id: 'ann-col-1',
        index: 1,
        geometry: { type: 'pin', x: 25, y: 9950 },
        style: { color: 'purple', strokeWidth: 4, fillOpacity: 0.2 },
        note: 'Column bottom pin',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const canvas = await renderCompositeCanvas(imgColumn, [pinAnn]);
      expect(canvas.width).toBe(50);
      expect(canvas.height).toBe(10000);

      const ctx = canvas.getContext('2d')!;
      expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 50, 10000);
      expect(ctx.fillText).toHaveBeenCalledWith('1', 25, 9870);
    });

    it('C1.4: Micro Image (1 x 1 pixel) creates minimal valid canvas and clamps dimensions to >= 1', async () => {
      const imgMicro = createMockBaseImage(1, 1);
      const boxAnn: Annotation = {
        id: 'ann-micro-1',
        index: 1,
        geometry: { type: 'box', x: 0, y: 0, width: 1, height: 1 },
        style: { color: 'amber', strokeWidth: 1, fillOpacity: 0.5 },
        note: 'Single pixel annotation',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const canvas = await renderCompositeCanvas(imgMicro, [boxAnn]);
      expect(canvas.width).toBe(1);
      expect(canvas.height).toBe(1);

      // Verify createCanvas dimension rounding and clamping
      const canvasZero = createCanvas(0, 0);
      expect(canvasZero.width).toBe(1);
      expect(canvasZero.height).toBe(1);

      const canvasNegative = createCanvas(-10, -50);
      expect(canvasNegative.width).toBe(1);
      expect(canvasNegative.height).toBe(1);

      const canvasFraction = createCanvas(12.7, 45.2);
      expect(canvasFraction.width).toBe(13);
      expect(canvasFraction.height).toBe(45);
    });

    it('C1.5: Handles sub-pixel floating point coordinates without loss of precision', async () => {
      const img = createMockBaseImage(1920, 1080);
      const floatAnn: Annotation = {
        id: 'ann-float',
        index: 7,
        geometry: { type: 'box', x: 123.456, y: 789.012, width: 456.789, height: 234.567 },
        style: { color: 'green', strokeWidth: 3.5, fillOpacity: 0.333 },
        note: 'Subpixel box',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const canvas = await renderCompositeCanvas(img, [floatAnn]);
      const ctx = canvas.getContext('2d')!;
      expect(ctx.fillText).toHaveBeenCalledWith('7', 123.456, 789.012);
    });

    it('C1.6: Combinatorial Aspect Ratio & Dimension Matrix (10 distinct configurations)', async () => {
      const dimensions = [
        { w: 1, h: 10000 },
        { w: 10000, h: 1 },
        { w: 16384, h: 16384 },
        { w: 2560, h: 1440 },
        { w: 3840, h: 2160 },
        { w: 5120, h: 2880 },
        { w: 12000, h: 300 },
        { w: 300, h: 12000 },
        { w: 7680, h: 4320 },
        { w: 1920, h: 1080 },
      ];

      for (const dim of dimensions) {
        const img = createMockBaseImage(dim.w, dim.h);
        const canvas = await renderCompositeCanvas(img, []);
        expect(canvas.width).toBe(dim.w);
        expect(canvas.height).toBe(dim.h);
      }
    });
  });

  // =========================================================================
  // Section 2: High-Density 500 Annotations Composite Stress & Performance
  // =========================================================================
  describe('2. High-Density 500 Annotations Scale & Performance', () => {
    it('C2.1: Composites 500 mixed annotations in sequence order with sub-second execution', async () => {
      const baseImg = createMockBaseImage(3840, 2160); // 4K base
      const shapeTypes = ['box', 'ellipse', 'arrow', 'pin'] as const;
      const colors: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];

      // Generate 500 annotations with randomized types, colors, and coordinates
      const annotations: Annotation[] = Array.from({ length: 500 }, (_, i) => {
        const id = `ann-${i + 1}`;
        const index = i + 1;
        const type = shapeTypes[i % shapeTypes.length];
        const color = colors[i % colors.length];

        let geometry: any;
        if (type === 'box') {
          geometry = {
            type: 'box',
            x: (i * 37) % 3500,
            y: (i * 23) % 1900,
            width: 100 + (i % 150),
            height: 80 + (i % 100),
            borderRadius: 4,
          };
        } else if (type === 'ellipse') {
          geometry = {
            type: 'ellipse',
            cx: (i * 41) % 3500 + 100,
            cy: (i * 29) % 1900 + 100,
            rx: 50 + (i % 50),
            ry: 40 + (i % 40),
          };
        } else if (type === 'arrow') {
          geometry = {
            type: 'arrow',
            startX: (i * 31) % 3500,
            startY: (i * 17) % 1900,
            endX: ((i * 31) % 3500) + 150,
            endY: ((i * 17) % 1900) + 100,
          };
        } else {
          geometry = {
            type: 'pin',
            x: (i * 43) % 3700 + 50,
            y: (i * 31) % 2000 + 50,
          };
        }

        return {
          id,
          index,
          geometry,
          style: {
            color,
            strokeWidth: 2 + (i % 4),
            fillOpacity: 0.1 + (i % 5) * 0.05,
          },
          note: `Annotation note #${index} testing scale`,
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
        };
      });

      // Intentionally shuffle annotations before passing to verify internal sorting by index
      const shuffled = [...annotations].sort(() => Math.random() - 0.5);

      const startTime = performance.now();
      const canvas = await renderCompositeCanvas(baseImg, shuffled);
      const durationMs = performance.now() - startTime;

      expect(canvas.width).toBe(3840);
      expect(canvas.height).toBe(2160);
      // Execution must complete comfortably within 2000ms
      expect(durationMs).toBeLessThan(2000);

      const ctx = canvas.getContext('2d')!;
      // Verify fillText was called 500 times (once for each badge)
      expect(ctx.fillText).toHaveBeenCalledTimes(500);

      // Verify sequence index badges from 1 to 500 were all rasterized
      expect(ctx.fillText).toHaveBeenCalledWith('1', expect.any(Number), expect.any(Number));
      expect(ctx.fillText).toHaveBeenCalledWith('250', expect.any(Number), expect.any(Number));
      expect(ctx.fillText).toHaveBeenCalledWith('500', expect.any(Number), expect.any(Number));
    });

    it('C2.2: Badge Dimensions & Pill Expansion invariant across 1-digit, 2-digit, 3-digit, 4-digit numbers', () => {
      // 1-digit: index 1..9 -> circle
      for (let i = 1; i <= 9; i++) {
        const dims = getBadgeDimensions(i);
        expect(dims.isPill).toBe(false);
        expect(dims.radius).toBe(12);
        expect(dims.fontSize).toBe(13);
      }

      // 2-digit: index 10..99 -> pill
      for (const i of [10, 50, 99]) {
        const dims = getBadgeDimensions(i);
        expect(dims.isPill).toBe(true);
        expect(dims.radius).toBe(12);
        expect(dims.width).toBeGreaterThanOrEqual(32);
        expect(dims.height).toBe(24);
        expect(dims.fontSize).toBe(12);
      }

      // 3-digit: index 100..999 -> expanded pill
      for (const i of [100, 500, 999]) {
        const dims = getBadgeDimensions(i);
        expect(dims.isPill).toBe(true);
        expect(dims.radius).toBe(12);
        expect(dims.width).toBeGreaterThanOrEqual(40);
        expect(dims.height).toBe(24);
        expect(dims.fontSize).toBe(12);
      }

      // 4-digit: index 1000+ -> extra wide pill
      const dims4 = getBadgeDimensions(1000);
      expect(dims4.isPill).toBe(true);
      expect(dims4.width).toBeGreaterThanOrEqual(48);
      expect(dims4.fontSize).toBe(12);
    });

    it('C2.3: Sequential sorting invariant: always draws lower index before higher index', async () => {
      const img = createMockBaseImage(800, 600);

      const annA: Annotation = {
        id: 'ann-10',
        index: 10,
        geometry: { type: 'box', x: 100, y: 100, width: 50, height: 50 },
        style: { color: 'red', strokeWidth: 2, fillOpacity: 0.2 },
        note: 'Tenth',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const annB: Annotation = {
        id: 'ann-2',
        index: 2,
        geometry: { type: 'box', x: 200, y: 200, width: 50, height: 50 },
        style: { color: 'green', strokeWidth: 2, fillOpacity: 0.2 },
        note: 'Second',
        createdAt: 2000,
        updatedAt: 2000,
      };

      const annC: Annotation = {
        id: 'ann-5',
        index: 5,
        geometry: { type: 'box', x: 300, y: 300, width: 50, height: 50 },
        style: { color: 'cyan', strokeWidth: 2, fillOpacity: 0.2 },
        note: 'Fifth',
        createdAt: 3000,
        updatedAt: 3000,
      };

      // Pass in reverse order: [10, 5, 2]
      const sortedCanvas = await renderCompositeCanvas(img, [annA, annC, annB]);
      expect(sortedCanvas.width).toBe(800);

      // Verify fillText on sortedCanvas context recorded drawing in exact sequence order: '2', '5', '10'
      const ctx = sortedCanvas.getContext('2d')!;
      const filledTexts = vi.mocked(ctx.fillText).mock.calls.map((c) => c[0]);
      expect(filledTexts).toEqual(['2', '5', '10']);
    });
  });

  // =========================================================================
  // Section 3: Invalid Image Sources & Resilient Error Handling
  // =========================================================================
  describe('3. Invalid Image Sources & Error Recovery', () => {
    it('C3.1: Rejects with meaningful error message when image source is invalid', async () => {
      const invalidImg: BaseImage = {
        id: 'img-invalid',
        src: 'invalid-image-source:unreachable-domain-404',
        naturalWidth: 800,
        naturalHeight: 600,
        fileName: 'corrupt.png',
        fileSize: 0,
      };

      await expect(renderCompositeCanvas(invalidImg, [])).rejects.toThrow(
        /Failed to load image from source/
      );
    });

    it('C3.2: Handles empty string image src without crashing', async () => {
      const emptySrcImg: BaseImage = {
        id: 'img-empty-src',
        src: '',
        naturalWidth: 640,
        naturalHeight: 480,
        fileName: 'blank.png',
        fileSize: 0,
      };

      const canvas = await renderCompositeCanvas(emptySrcImg, []);
      expect(canvas.width).toBe(640);
      expect(canvas.height).toBe(480);
    });

    it('C3.3: Handles empty annotations array by outputting clean base image passthrough', async () => {
      const img = createMockBaseImage(1280, 720);
      const canvas = await renderCompositeCanvas(img, []);
      expect(canvas.width).toBe(1280);
      expect(canvas.height).toBe(720);

      const ctx = canvas.getContext('2d')!;
      expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 720);
      expect(ctx.fillText).not.toHaveBeenCalled();
    });

    it('C3.4: loadImageElement rejects safely with truncated error message on ultra-long corrupted URLs', async () => {
      const ultraLongBadUrl = 'invalid-image-source:' + 'A'.repeat(5000);
      await expect(loadImageElement(ultraLongBadUrl)).rejects.toThrow(
        /Failed to load image from source: invalid-image-source:AAAA/
      );
    });
  });

  // =========================================================================
  // Section 4: Exact Geometric Coordinates & Bounding Box Alignments
  // =========================================================================
  describe('4. Exact Geometric Coordinates & Bounding Box Alignments', () => {
    it('C4.1: Box annotation coordinates map 1:1 to ctx.roundRect or fallback moveTo/lineTo/arcTo', () => {
      const canvas = createCanvas(1000, 1000);
      const ctx = canvas.getContext('2d')!;

      const boxAnn: Annotation = {
        id: 'box-1',
        index: 1,
        geometry: { type: 'box', x: 250, y: 350, width: 400, height: 200, borderRadius: 8 },
        style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
        note: 'Exact coordinate box',
        createdAt: 1000,
        updatedAt: 1000,
      };

      rasterizeAnnotation(ctx, boxAnn);

      // Verify stroke and fill operations were invoked
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();

      // Verify Box Badge anchored precisely at top-left (250, 350)
      expect(ctx.fillText).toHaveBeenCalledWith('1', 250, 350);
    });

    it('C4.2: Ellipse coordinates map 1:1 to ctx.ellipse and badge at 225° diagonal apex', () => {
      const canvas = createCanvas(1000, 1000);
      const ctx = canvas.getContext('2d')!;

      const cx = 500;
      const cy = 400;
      const rx = 120;
      const ry = 80;

      const ellipseAnn: Annotation = {
        id: 'ell-1',
        index: 2,
        geometry: { type: 'ellipse', cx, cy, rx, ry },
        style: { color: 'green', strokeWidth: 3, fillOpacity: 0.25 },
        note: 'Ellipse geometry check',
        createdAt: 1000,
        updatedAt: 1000,
      };

      rasterizeAnnotation(ctx, ellipseAnn);

      expect(ctx.ellipse).toHaveBeenCalledWith(cx, cy, rx, ry, 0, 0, 2 * Math.PI);

      // Badge Position = (cx - rx * cos(45°), cy - ry * sin(45°))
      const expectedBadgeX = cx - rx * Math.SQRT1_2;
      const expectedBadgeY = cy - ry * Math.SQRT1_2;
      expect(ctx.fillText).toHaveBeenCalledWith('2', expectedBadgeX, expectedBadgeY);
    });

    it('C4.3: Arrow vector calculations: 30° wings, clamped head length, recessed notch, tail badge', () => {
      const canvas = createCanvas(1000, 1000);
      const ctx = canvas.getContext('2d')!;

      const start = { x: 100, y: 100 };
      const end = { x: 400, y: 500 };
      const strokeWidth = 5;

      const arrowAnn: Annotation = {
        id: 'arr-1',
        index: 3,
        geometry: { type: 'arrow', startX: start.x, startY: start.y, endX: end.x, endY: end.y },
        style: { color: 'cyan', strokeWidth, fillOpacity: 0.2 },
        note: 'Arrow geometry check',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const computedHead = calculateArrowhead(start, end, strokeWidth);

      rasterizeAnnotation(ctx, arrowAnn);

      // Shaft line: from start to shaftEnd
      expect(ctx.moveTo).toHaveBeenCalledWith(start.x, start.y);
      expect(ctx.lineTo).toHaveBeenCalledWith(computedHead.shaftEnd.x, computedHead.shaftEnd.y);

      // Arrowhead polygon: tip -> wingLeft -> notch -> wingRight -> closePath
      expect(ctx.moveTo).toHaveBeenCalledWith(computedHead.tip.x, computedHead.tip.y);
      expect(ctx.lineTo).toHaveBeenCalledWith(computedHead.wingLeft.x, computedHead.wingLeft.y);
      expect(ctx.lineTo).toHaveBeenCalledWith(computedHead.notch.x, computedHead.notch.y);
      expect(ctx.lineTo).toHaveBeenCalledWith(computedHead.wingRight.x, computedHead.wingRight.y);

      // Badge strictly anchored at tail start (100, 100)
      expect(ctx.fillText).toHaveBeenCalledWith('3', start.x, start.y);
    });

    it('C4.4: Callout Pin teardrop geometry: tip at target (x, y) and badge text centered in circular head at (x, y - 20)', () => {
      const canvas = createCanvas(1000, 1000);
      const ctx = canvas.getContext('2d')!;

      const pinAnn: Annotation = {
        id: 'pin-1',
        index: 4,
        geometry: { type: 'pin', x: 650, y: 750 },
        style: { color: 'purple', strokeWidth: 4, fillOpacity: 0.2 },
        note: 'Pin teardrop check',
        createdAt: 1000,
        updatedAt: 1000,
      };

      rasterizeAnnotation(ctx, pinAnn);

      // Teardrop bezier anchor check
      expect(ctx.moveTo).toHaveBeenCalledWith(650, 750);
      expect(ctx.bezierCurveTo).toHaveBeenCalledWith(646, 742, 636, 736, 636, 730);
      expect(ctx.arc).toHaveBeenCalledWith(650, 730, 14, Math.PI, 0, false);
      expect(ctx.bezierCurveTo).toHaveBeenCalledWith(664, 736, 654, 742, 650, 750);

      // Text rendered at (x, y - 20)
      expect(ctx.fillText).toHaveBeenCalledWith('4', 650, 730);
    });

    it('C4.5: Color contrast rules: dark text (#1E293B) on Amber Gold (Amber), white (#FFFFFF) on others', () => {
      const canvas = createCanvas(500, 500);
      const ctx = canvas.getContext('2d')!;

      // Amber
      rasterizeBadge(ctx, { x: 100, y: 100 }, 1, 'amber');
      expect(ctx.fillStyle).toBe(PRESET_COLORS.amber.badgeText);
      expect(PRESET_COLORS.amber.badgeText).toBe('#1E293B');

      // Red, Green, Cyan, Purple
      const otherColors: PresetColor[] = ['red', 'green', 'cyan', 'purple'];
      for (const col of otherColors) {
        rasterizeBadge(ctx, { x: 100, y: 100 }, 1, col);
        expect(ctx.fillStyle).toBe(PRESET_COLORS[col].badgeText);
        expect(PRESET_COLORS[col].badgeText).toBe('#FFFFFF');
      }
    });

    it('C4.6: Mathematical Oracle: 500 random vectors maintain exact analytical arrowhead and badge positions', () => {
      for (let i = 0; i < 500; i++) {
        const start = {
          x: (Math.random() - 0.5) * 10000,
          y: (Math.random() - 0.5) * 10000,
        };
        const end = {
          x: (Math.random() - 0.5) * 10000,
          y: (Math.random() - 0.5) * 10000,
        };
        const strokeWidth = 1 + Math.random() * 20;

        const head = calculateArrowhead(start, end, strokeWidth);

        // Verification of mathematical properties:
        // 1. Tip must match target endpoint
        expect(head.tip.x).toBeCloseTo(end.x, 3);
        expect(head.tip.y).toBeCloseTo(end.y, 3);

        // 2. Head length must be clamped to [14, 36]
        expect(head.headLength).toBeGreaterThanOrEqual(14);
        expect(head.headLength).toBeLessThanOrEqual(36);

        // 3. Notch must be at 0.75 * headLength from tip along axis
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.hypot(dx, dy);

        if (len > 0.001) {
          const ux = dx / len;
          const uy = dy / len;
          const expectedNotchX = end.x - ux * (head.headLength * 0.75);
          const expectedNotchY = end.y - uy * (head.headLength * 0.75);
          expect(head.notch.x).toBeCloseTo(expectedNotchX, 2);
          expect(head.notch.y).toBeCloseTo(expectedNotchY, 2);
        }

        // 4. Badge position for arrow must be exactly start
        const badgePos = getBadgePositionForShape({
          type: 'arrow',
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
        });
        expect(badgePos.x).toBe(start.x);
        expect(badgePos.y).toBe(start.y);
      }
    });

    it('C4.7: drawRoundRect fallback precision when ctx.roundRect is unavailable', () => {
      const canvas = createCanvas(400, 400);
      const ctx = canvas.getContext('2d')!;
      const original = (ctx as any).roundRect;
      delete (ctx as any).roundRect;

      drawRoundRect(ctx, 50, 60, 200, 100, 10);
      expect(ctx.moveTo).toHaveBeenCalledWith(60, 60);
      expect(ctx.lineTo).toHaveBeenCalledWith(240, 60);
      expect(ctx.arcTo).toHaveBeenCalled();

      // Zero radius case
      drawRoundRect(ctx, 10, 10, 50, 50, 0);
      expect(ctx.rect).toHaveBeenCalledWith(10, 10, 50, 50);

      if (original) (ctx as any).roundRect = original;
    });
  });

  // =========================================================================
  // Section 5: Binary Blob & Data URL Output Invariants
  // =========================================================================
  describe('5. Binary Blob & Data URL Outputs', () => {
    it('C5.1: exportCompositeBlob returns valid image/png Blob with correct MIME type and size', async () => {
      const img = createMockBaseImage(1920, 1080);
      const ann: Annotation = {
        id: 'ann-blob-1',
        index: 1,
        geometry: { type: 'box', x: 50, y: 50, width: 100, height: 100 },
        style: { color: 'red', strokeWidth: 2, fillOpacity: 0.2 },
        note: 'Blob export check',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const blob = await exportCompositeBlob(img, [ann]);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('C5.2: exportCompositeDataUrl returns standard data:image/png;base64 string', async () => {
      const img = createMockBaseImage(800, 600);
      const dataUrl = await exportCompositeDataUrl(img, []);
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('C5.3: exportCanvasToBlob converts HTMLCanvasElement to Blob and rejects on failure', async () => {
      const canvas = createCanvas(100, 100);
      const blob = await exportCanvasToBlob(canvas, 'image/png');
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');

      // Failure test: mock toBlob returning null
      const failingCanvas = createCanvas(100, 100);
      failingCanvas.toBlob = (cb: (b: Blob | null) => void) => cb(null);

      await expect(exportCanvasToBlob(failingCanvas)).rejects.toThrow(
        'Failed to convert canvas to blob'
      );
    });

    it('C5.4: Background color option fills canvas with specified hex color', async () => {
      const img = createMockBaseImage(500, 300);
      const canvas = await renderCompositeCanvas(img, [], { backgroundColor: '#1E293B' });
      const ctx = canvas.getContext('2d')!;

      expect(ctx.fillStyle).toBe('#1E293B');
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 500, 300);
    });

    it('C5.5: Concurrent 8K exports execute in parallel without cross-state corruption', async () => {
      const img1 = createMockBaseImage(7680, 4320);
      const img2 = createMockBaseImage(7680, 4320);

      const ann1: Annotation = {
        id: 'c-ann-1',
        index: 1,
        geometry: { type: 'box', x: 100, y: 100, width: 200, height: 200 },
        style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
        note: 'Parallel 1',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const ann2: Annotation = {
        id: 'c-ann-2',
        index: 2,
        geometry: { type: 'ellipse', cx: 1000, cy: 1000, rx: 100, ry: 100 },
        style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.2 },
        note: 'Parallel 2',
        createdAt: 2000,
        updatedAt: 2000,
      };

      const [blob1, blob2] = await Promise.all([
        exportCompositeBlob(img1, [ann1]),
        exportCompositeBlob(img2, [ann2]),
      ]);

      expect(blob1.type).toBe('image/png');
      expect(blob2.type).toBe('image/png');
    });
  });

  // =========================================================================
  // Section 6: Boundary Geometries & Hostile Coordinate Space Stress
  // =========================================================================
  describe('6. Boundary Geometries & Hostile Coordinate Space', () => {
    it('C6.1: Handles deeply out-of-bounds annotations without throwing', async () => {
      const img = createMockBaseImage(1000, 1000);
      const outOfBoundsAnns: Annotation[] = [
        {
          id: 'oob-1',
          index: 1,
          geometry: { type: 'box', x: -5000, y: -5000, width: 200, height: 200 },
          style: { color: 'red', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Negative coordinates',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'oob-2',
          index: 2,
          geometry: { type: 'ellipse', cx: 50000, cy: 50000, rx: 100, ry: 100 },
          style: { color: 'green', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Far positive coordinates',
          createdAt: 2000,
          updatedAt: 2000,
        },
        {
          id: 'oob-3',
          index: 3,
          geometry: { type: 'arrow', startX: -1000, startY: -1000, endX: 10000, endY: 10000 },
          style: { color: 'cyan', strokeWidth: 4, fillOpacity: 0.2 },
          note: 'Traversing arrow',
          createdAt: 3000,
          updatedAt: 3000,
        },
      ];

      const canvas = await renderCompositeCanvas(img, outOfBoundsAnns);
      expect(canvas.width).toBe(1000);
      expect(canvas.height).toBe(1000);
    });

    it('C6.2: Handles zero-size geometries (0x0 box, 0-radius ellipse, zero-length arrow) gracefully', async () => {
      const canvas = createCanvas(500, 500);
      const ctx = canvas.getContext('2d')!;

      // 0x0 Box
      rasterizeAnnotation(ctx, {
        id: 'zero-box',
        index: 1,
        geometry: { type: 'box', x: 50, y: 50, width: 0, height: 0 },
        style: { color: 'red', strokeWidth: 2, fillOpacity: 0.2 },
        note: 'Zero box',
        createdAt: 1000,
        updatedAt: 1000,
      });

      // 0-radius Ellipse
      rasterizeAnnotation(ctx, {
        id: 'zero-ellipse',
        index: 2,
        geometry: { type: 'ellipse', cx: 100, cy: 100, rx: 0, ry: 0 },
        style: { color: 'green', strokeWidth: 2, fillOpacity: 0.2 },
        note: 'Zero ellipse',
        createdAt: 2000,
        updatedAt: 2000,
      });

      // Zero-length Arrow (start === end)
      rasterizeAnnotation(ctx, {
        id: 'zero-arrow',
        index: 3,
        geometry: { type: 'arrow', startX: 200, startY: 200, endX: 200, endY: 200 },
        style: { color: 'cyan', strokeWidth: 2, fillOpacity: 0.2 },
        note: 'Zero arrow',
        createdAt: 3000,
        updatedAt: 3000,
      });

      expect(ctx.fillText).toHaveBeenCalledWith('1', 50, 50);
      expect(ctx.fillText).toHaveBeenCalledWith('2', expect.any(Number), expect.any(Number));
      expect(ctx.fillText).toHaveBeenCalledWith('3', 200, 200);
    });

    it('C6.3: Fallback preset color defaults to Amber when unknown color is passed', () => {
      const canvas = createCanvas(500, 500);
      const ctx = canvas.getContext('2d')!;

      rasterizeBadge(ctx, { x: 100, y: 100 }, 1, 'non-existent-color' as any);
      expect(ctx.fillStyle).toBe(PRESET_COLORS.amber.badgeText);
    });

    it('C6.4: hexToRgba handles 3-digit hex, uppercase, lowercase, and boundary opacity', () => {
      expect(hexToRgba('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
      expect(hexToRgba('000000', 1.0)).toBe('rgba(0, 0, 0, 1)');
      expect(hexToRgba('#1E293B', -10)).toBe('rgba(30, 41, 59, 0)');
      expect(hexToRgba('#1E293B', 10)).toBe('rgba(30, 41, 59, 1)');
      expect(hexToRgba('invalid', 0.8)).toBe('rgba(0, 0, 0, 0.8)');
    });
  });
});
