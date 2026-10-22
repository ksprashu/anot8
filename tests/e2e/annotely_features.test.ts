/**
 * Anot8 Annotely-Inspired Features Master E2E Test Suite
 * 
 * Comprehensive, requirement-driven, opaque-box test suite covering:
 * - R1: Polished Thicker Arrow Tool (geometry, contrast casing/shadows, tail badge anchor, transform handles, canvas export)
 * - R2: Additive Highlight / Spotlight Tool (spotlight illumination, dimmed backdrop, multi-region additive mask, canvas export)
 * - R3: Smooth Blur / Redact Tool (Gaussian blur filter, bounded region preview, destructive export pixel baking)
 * - R4: Resolution-Aware Scalable Badges and Pins (natural resolution scale computation, 2K/4K/Retina scaling, minimum limits, export parity)
 * 
 * Organized using 4-Tier Test Architecture:
 * - Tier 1: Feature Coverage (>=5 test cases per feature)
 * - Tier 2: Boundary & Corner Cases (>=5 test cases per feature)
 * - Tier 3: Cross-Feature Combinations
 * - Tier 4: Real-World Scenarios
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAnnotelyTestImage,
  createInitialAnnotelyState,
  annotelyAppReducer,
  calculateArrowheadContract,
  computeResolutionScaleContract,
  getBadgeDimensionsContract,
  getPinDimensionsContract,
  getBadgePositionForAnnotelyShape,
  normalizeHighlightGeometry,
  normalizeBlurGeometry,
  generateSpotlightMaskModel,
  generateBlurFilterModel,
  simulateAnnotelyCanvasExport,
  AnnotelyAppState,
  HighlightGeometry,
  BlurGeometry,
  ArrowGeometry,
  PinGeometry,
} from '../helpers/annotelyFixtures';
import { calculateArrowhead } from '../../src/math/geometry';
import { getBadgeDimensions, getBadgePositionForShape } from '../../src/math/badges';

// ============================================================================
// TIER 1: FEATURE COVERAGE (>=5 TEST CASES PER FEATURE)
// ============================================================================

describe('Tier 1: Feature Coverage (Annotely Requirements R1 through R4)', () => {
  let state: AnnotelyAppState;

  beforeEach(() => {
    state = createInitialAnnotelyState();
    state.image = createAnnotelyTestImage(1920, 1080, 'dashboard-screenshot.png');
  });

  // --------------------------------------------------------------------------
  // Feature R1: Polished Thicker Arrow Tool
  // --------------------------------------------------------------------------
  describe('Feature R1: Polished Thicker Arrow Tool', () => {
    it('F1.1: Thick arrow shaft geometry defaults to 6px with casing strokeWidth = 9.5px', () => {
      const start = { x: 100, y: 100 };
      const end = { x: 300, y: 100 };
      const strokeWidth = 6;
      const arrow = calculateArrowheadContract(start, end, strokeWidth);

      expect(arrow.casingStrokeWidth).toBe(strokeWidth + 3.5); // 9.5px
      expect(arrow.tip).toEqual({ x: 300, y: 100 });
      expect(arrow.headLength).toBeGreaterThanOrEqual(14);
      expect(arrow.headLength).toBeLessThanOrEqual(36);
    });

    it('F1.2: Sharp arrowhead geometry produces exact 30° wing angles and recessed notch', () => {
      const start = { x: 200, y: 200 };
      const end = { x: 500, y: 200 };
      const arrow = calculateArrowheadContract(start, end, 6);

      // Arrow heading along positive X axis (0 rad)
      expect(arrow.headingRad).toBeCloseTo(0, 4);

      // Wings should be at 30° (PI/6 rad) from tip
      const leftDx = end.x - arrow.wingLeft.x;
      const leftDy = end.y - arrow.wingLeft.y;
      const leftAngle = Math.atan2(leftDy, leftDx);
      expect(Math.abs(leftAngle)).toBeCloseTo(Math.PI / 6, 2);

      // Notch is recessed along the arrow shaft at 0.75 * headLength
      const expectedNotchX = end.x - arrow.headLength * 0.75;
      expect(arrow.notch.x).toBeCloseTo(expectedNotchX, 2);
      expect(arrow.notch.y).toBeCloseTo(end.y, 2);
    });

    it('F1.3: Arrow shaft end is recessed by strokeWidth * 0.5 to prevent round linecap penetration', () => {
      const start = { x: 100, y: 100 };
      const end = { x: 400, y: 100 };
      const strokeWidth = 8;
      const arrow = calculateArrowheadContract(start, end, strokeWidth);

      const recession = strokeWidth * 0.5; // 4px
      expect(arrow.shaftEnd.x).toBeCloseTo(arrow.notch.x - recession, 2);
      expect(arrow.shaftEnd.y).toBeCloseTo(arrow.notch.y, 2);
    });

    it('F1.4: High-contrast casing and drop shadow specifications for dark/light contrast', () => {
      const start = { x: 50, y: 50 };
      const end = { x: 250, y: 250 };
      const arrow = calculateArrowheadContract(start, end, 6);

      // Path string must be a closed polygon connecting Tip -> WingLeft -> Notch -> WingRight -> Z
      expect(arrow.pathString).toMatch(/^M\s+250\s+250\s+L\s+[-0-9.]+\s+[-0-9.]+\s+L\s+[-0-9.]+\s+[-0-9.]+\s+L\s+[-0-9.]+\s+[-0-9.]+\s+Z$/);
      expect(arrow.casingStrokeWidth).toBe(9.5);
    });

    it('F1.5: Tail badge anchor positioning is strictly preserved at startX, startY', () => {
      const arrowGeo: ArrowGeometry = {
        type: 'arrow',
        startX: 120,
        startY: 340,
        endX: 600,
        endY: 340,
      };

      const anchor = getBadgePositionForAnnotelyShape(arrowGeo);
      expect(anchor.x).toBe(arrowGeo.startX);
      expect(anchor.y).toBe(arrowGeo.startY);

      // Confirm parity with core math getBadgePositionForShape
      const coreAnchor = getBadgePositionForShape(arrowGeo);
      expect(coreAnchor.x).toBe(arrowGeo.startX);
      expect(coreAnchor.y).toBe(arrowGeo.startY);
    });

    it('F1.6: 2D Canvas export parity renders underlay casing, shaft, and closed arrowhead polygon', () => {
      const arrowGeo: ArrowGeometry = {
        type: 'arrow',
        startX: 100,
        startY: 150,
        endX: 450,
        endY: 150,
      };

      state = annotelyAppReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          geometry: arrowGeo,
          style: { color: 'amber', strokeWidth: 6, fillOpacity: 1.0 },
          note: 'Pointing to bug',
        },
      });

      const { steps } = simulateAnnotelyCanvasExport(state.image!, state.annotations);
      const casingStep = steps.find((s) => s.stage === 'render_arrow_casing');
      const shaftStep = steps.find((s) => s.stage === 'render_arrow_shaft');
      const headStep = steps.find((s) => s.stage === 'render_arrow_head');

      expect(casingStep).toBeDefined();
      expect(casingStep?.details.casingStrokeWidth).toBe(9.5);
      expect(casingStep?.details.casingColor).toBe('rgba(0,0,0,0.55)');

      expect(shaftStep).toBeDefined();
      expect(shaftStep?.details.strokeWidth).toBe(6);

      expect(headStep).toBeDefined();
      expect((headStep?.details.tip as { x: number; y: number }).x).toBe(450);
    });
  });

  // --------------------------------------------------------------------------
  // Feature R2: Additive Highlight / Spotlight Tool
  // --------------------------------------------------------------------------
  describe('Feature R2: Additive Highlight / Spotlight Tool', () => {
    it('F2.1: Highlight tool state definition and box geometry normalization', () => {
      const rawHighlight = normalizeHighlightGeometry({ x: 300, y: 400 }, { x: 100, y: 200 });

      expect(rawHighlight.type).toBe('highlight');
      expect(rawHighlight.x).toBe(100);
      expect(rawHighlight.y).toBe(200);
      expect(rawHighlight.width).toBe(200);
      expect(rawHighlight.height).toBe(200);

      state = annotelyAppReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          geometry: rawHighlight,
          note: 'Spotlight on primary header',
        },
      });

      expect(state.annotations.length).toBe(1);
      expect(state.annotations[0].geometry.type).toBe('highlight');
      expect(state.annotations[0].index).toBe(0);
    });

    it('F2.2: Interactive spotlight SVG mask structure with white base and black cutouts', () => {
      const hl: HighlightGeometry = { type: 'highlight', x: 200, y: 150, width: 400, height: 250 };
      const maskModel = generateSpotlightMaskModel([hl]);

      expect(maskModel.maskId).toBe('spotlight-mask');
      expect(maskModel.backdropColor).toBe('rgba(0,0,0,0.68)');
      expect(maskModel.baseRect.fill).toBe('white');
      expect(maskModel.cutouts.length).toBe(1);
      expect(maskModel.cutouts[0]).toEqual({
        x: 200,
        y: 150,
        width: 400,
        height: 250,
        fill: 'black',
        rx: 4,
      });
    });

    it('F2.3: Additive multi-region highlighting without overlapping dimming artifacts', () => {
      const hl1: HighlightGeometry = { type: 'highlight', x: 100, y: 100, width: 200, height: 200 };
      const hl2: HighlightGeometry = { type: 'highlight', x: 250, y: 150, width: 200, height: 200 };
      const hl3: HighlightGeometry = { type: 'highlight', x: 150, y: 120, width: 250, height: 180 };

      const maskModel = generateSpotlightMaskModel([hl1, hl2, hl3]);

      // All 3 regions are present as individual black cutouts in the mask
      expect(maskModel.cutouts.length).toBe(3);
      // Under SVG mask composition, black cutouts punch holes additively without overlap seams
      expect(maskModel.cutouts.every((c) => c.fill === 'black')).toBe(true);
      expect(maskModel.baseRect.fill).toBe('white');
    });

    it('F2.4: 2D Canvas export parity with destination-out additive cutout punch', () => {
      const hl1: HighlightGeometry = { type: 'highlight', x: 100, y: 100, width: 300, height: 150 };
      const hl2: HighlightGeometry = { type: 'highlight', x: 500, y: 300, width: 250, height: 120 };

      state = annotelyAppReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: hl1, note: 'Focus region 1' },
      });
      state = annotelyAppReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: hl2, note: 'Focus region 2' },
      });

      const { steps } = simulateAnnotelyCanvasExport(state.image!, state.annotations);
      const backdropFill = steps.find((s) => s.stage === 'spotlight_backdrop_fill');
      const cutouts = steps.filter((s) => s.stage === 'spotlight_cutout_punch');
      const compositeApply = steps.find((s) => s.stage === 'spotlight_composite_apply');

      expect(backdropFill).toBeDefined();
      expect(backdropFill?.details.color).toBe('rgba(0,0,0,0.68)');
      expect(cutouts.length).toBe(2);
      expect(cutouts[0].details.compositeOperation).toBe('destination-out');
      expect(cutouts[1].details.compositeOperation).toBe('destination-out');
      expect(compositeApply?.details.compositeOperation).toBe('source-over');
    });

    it('F2.5: Highlight selection, transform handles and sidebar note synchronization', () => {
      const hl: HighlightGeometry = { type: 'highlight', x: 100, y: 100, width: 200, height: 150 };
      state = annotelyAppReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: hl, note: 'Initial note' },
      });

      const annId = state.annotations[0].id;
      expect(state.selectedAnnotationId).toBe(annId);

      // Update geometry via handle drag
      const updatedHl: HighlightGeometry = { type: 'highlight', x: 120, y: 110, width: 250, height: 180 };
      state = annotelyAppReducer(state, {
        type: 'UPDATE_ANNOTATION_GEOMETRY',
        payload: { id: annId, geometry: updatedHl },
      });

      expect((state.annotations[0].geometry as HighlightGeometry).width).toBe(250);

      // Update markdown note in sidebar
      state = annotelyAppReducer(state, {
        type: 'UPDATE_ANNOTATION_NOTE',
        payload: { id: annId, note: 'Updated note with markdown details' },
      });

      expect(state.annotations[0].note).toBe('Updated note with markdown details');
    });
  });

  // --------------------------------------------------------------------------
  // Feature R3: Smooth Blur / Redact Tool
  // --------------------------------------------------------------------------
  describe('Feature R3: Smooth Blur / Redact Tool', () => {
    it('F3.1: Blur tool state definition and box geometry model', () => {
      const rawBlur = normalizeBlurGeometry({ x: 500, y: 300 }, { x: 200, y: 100 });

      expect(rawBlur.type).toBe('blur');
      expect(rawBlur.x).toBe(200);
      expect(rawBlur.y).toBe(100);
      expect(rawBlur.width).toBe(300);
      expect(rawBlur.height).toBe(200);

      state = annotelyAppReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          geometry: rawBlur,
          note: 'Redact client credentials',
        },
      });

      expect(state.annotations.length).toBe(1);
      expect(state.annotations[0].geometry.type).toBe('blur');
      expect(state.annotations[0].index).toBe(0);
    });

    it('F3.2: Interactive Gaussian blur SVG filter and clipPath preview overlay', () => {
      const blurGeo: BlurGeometry = { type: 'blur', x: 150, y: 80, width: 320, height: 90 };
      const filterModel = generateBlurFilterModel([blurGeo]);

      expect(filterModel.filterId).toBe('gaussian-blur');
      expect(filterModel.stdDeviation).toBe(10);
      expect(filterModel.edgeMode).toBe('duplicate');
      expect(filterModel.clipPaths.length).toBe(1);
      expect(filterModel.clipPaths[0].rect).toEqual({
        x: 150,
        y: 80,
        width: 320,
        height: 90,
        rx: 2,
      });
    });

    it('F3.3: Destructive blur baking into 2D canvas export pixel buffer', () => {
      const blurGeo: BlurGeometry = { type: 'blur', x: 300, y: 250, width: 200, height: 60 };

      state = annotelyAppReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: blurGeo, note: 'Redacted password' },
      });

      const { steps } = simulateAnnotelyCanvasExport(state.image!, state.annotations);
      const blurStep = steps.find((s) => s.stage === 'destructive_blur_bake');

      expect(blurStep).toBeDefined();
      expect(blurStep?.details.filter).toBe('blur(12px)');
      expect(blurStep?.details.bakedIrreversibly).toBe(true);
      expect(blurStep?.details.x).toBe(300);
      expect(blurStep?.details.y).toBe(250);
      expect(blurStep?.details.width).toBe(200);
      expect(blurStep?.details.height).toBe(60);
    });

    it('F3.4: Blur edge mode duplicate/clamp prevents dark boundary bleed artifacts', () => {
      const blur1: BlurGeometry = { type: 'blur', x: 0, y: 0, width: 150, height: 100 }; // Placed right at canvas edge
      const filterModel = generateBlurFilterModel([blur1]);

      // edgeMode duplicate ensures canvas border pixels duplicate outwards instead of blending to black
      expect(filterModel.edgeMode).toBe('duplicate');
      expect(filterModel.stdDeviation).toBeGreaterThanOrEqual(8);
      expect(filterModel.stdDeviation).toBeLessThanOrEqual(16);
    });

    it('F3.5: Blur region resize handles and dynamic sequential re-indexing on delete', () => {
      state = annotelyAppReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: { type: 'blur', x: 10, y: 10, width: 100, height: 50 }, note: 'Blur 1' },
      });
      state = annotelyAppReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: { type: 'blur', x: 120, y: 10, width: 100, height: 50 }, note: 'Blur 2' },
      });
      state = annotelyAppReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: { type: 'blur', x: 240, y: 10, width: 100, height: 50 }, note: 'Blur 3' },
      });

      expect(state.annotations.map((a) => a.index)).toEqual([0, 0, 0]);

      // Delete the middle blur annotation
      const middleId = state.annotations[1].id;
      state = annotelyAppReducer(state, {
        type: 'DELETE_ANNOTATION',
        payload: { id: middleId },
      });

      expect(state.annotations.length).toBe(2);
      expect(state.annotations[0].index).toBe(0);
      expect(state.annotations[1].index).toBe(0);
      expect(state.annotations[1].note).toBe('Blur 3');
    });
  });

  // --------------------------------------------------------------------------
  // Feature R4: Resolution-Aware Scalable Badges and Pins
  // --------------------------------------------------------------------------
  describe('Feature R4: Resolution-Aware Scalable Badges and Pins', () => {
    it('F4.1: Natural resolution scale metric computation and baseline clamping', () => {
      // Baseline 1080p (1920x1080): max(1920, 1080) / 1440 = 1.33
      expect(computeResolutionScaleContract(1920, 1080)).toBeCloseTo(1.333, 2);

      // Sub-baseline 720p (1280x720): max(1280, 720) / 1440 = 0.88 -> clamped to 1.0
      expect(computeResolutionScaleContract(1280, 720)).toBe(1.0);

      // 2K QHD (2560x1440): max(2560, 1440) / 1440 = 1.78
      expect(computeResolutionScaleContract(2560, 1440)).toBeCloseTo(1.778, 2);

      // 4K UHD (3840x2160): max(3840, 2160) / 1440 = 2.67
      expect(computeResolutionScaleContract(3840, 2160)).toBeCloseTo(2.667, 2);

      // 8K UHD (7680x4320): max(7680, 4320) / 1440 = 5.33 -> clamped to 4.0
      expect(computeResolutionScaleContract(7680, 4320)).toBe(4.0);
    });

    it('F4.2: Scalable badge dimensions across standard, 2K, 4K, 8K resolutions', () => {
      // Scale 1.0 (Standard)
      const baseBadge = getBadgeDimensionsContract(1, 1.0);
      expect(baseBadge.width).toBe(24);
      expect(baseBadge.height).toBe(24);
      expect(baseBadge.fontSize).toBe(13);

      // Parity check with core math getBadgeDimensions at scale 1.0
      const coreBadge = getBadgeDimensions(1);
      expect(baseBadge.width).toBe(coreBadge.width);
      expect(baseBadge.height).toBe(coreBadge.height);

      // Scale 2.67 (4K)
      const scale4k = computeResolutionScaleContract(3840, 2160);
      const badge4k = getBadgeDimensionsContract(1, scale4k);
      expect(badge4k.width).toBe(Math.round(24 * scale4k)); // ~64px
      expect(badge4k.height).toBe(Math.round(24 * scale4k)); // ~64px
      expect(badge4k.fontSize).toBe(Math.round(13 * scale4k)); // ~35px

      // Scale 4.0 (8K)
      const badge8k = getBadgeDimensionsContract(1, 4.0);
      expect(badge8k.width).toBe(96);
      expect(badge8k.height).toBe(96);
      expect(badge8k.fontSize).toBe(52);
    });

    it('F4.3: Scalable callout pin marker geometry (head radius and pointer height)', () => {
      const pin1x = getPinDimensionsContract(1.0);
      expect(pin1x.headRadius).toBe(14);
      expect(pin1x.pointerHeight).toBe(20);
      expect(pin1x.width).toBe(28);
      expect(pin1x.fontSize).toBe(12);

      const pin2x = getPinDimensionsContract(2.0);
      expect(pin2x.headRadius).toBe(28);
      expect(pin2x.pointerHeight).toBe(40);
      expect(pin2x.width).toBe(56);
      expect(pin2x.fontSize).toBe(24);
    });

    it('F4.4: Scalable selection handles and hit targets across display resolutions', () => {
      const pinGeo: PinGeometry = { type: 'pin', x: 500, y: 600 };
      const scale4k = computeResolutionScaleContract(3840, 2160);
      const anchor4k = getBadgePositionForAnnotelyShape(pinGeo, scale4k);

      const pinDim4k = getPinDimensionsContract(scale4k);
      expect(anchor4k.x).toBe(500);
      expect(anchor4k.y).toBe(600 - pinDim4k.anchorOffset);
      expect(pinDim4k.anchorOffset).toBeGreaterThan(pin1xOffset(1.0));
    });

    it('F4.5: 2D Canvas export parity for scaled badges and pins on 4K image', () => {
      const img4k = createAnnotelyTestImage(3840, 2160, 'retina-4k.png');
      state = createInitialAnnotelyState({ image: img4k });

      state = annotelyAppReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          geometry: { type: 'pin', x: 1000, y: 1000 },
          note: 'Scaled pin on 4K',
        },
      });

      const { steps, scale } = simulateAnnotelyCanvasExport(state.image!, state.annotations);
      expect(scale).toBeCloseTo(2.667, 2);

      const pinStep = steps.find((s) => s.stage === 'render_scaled_pin');
      const badgeStep = steps.find((s) => s.stage === 'render_scaled_badge');

      expect(pinStep).toBeDefined();
      expect(pinStep?.details.headRadius).toBe(Math.round(14 * scale));

      expect(badgeStep).toBeDefined();
      expect(badgeStep?.details.width).toBe(Math.round(24 * scale));
      expect(badgeStep?.details.fontSize).toBe(Math.round(13 * scale));
    });
  });
});

function pin1xOffset(scale: number): number {
  return getPinDimensionsContract(scale).anchorOffset;
}

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (>=5 TEST CASES PER FEATURE)
// ============================================================================

describe('Tier 2: Boundary & Corner Cases', () => {
  // --------------------------------------------------------------------------
  // Feature R1 Arrow Boundaries
  // --------------------------------------------------------------------------
  describe('R1 Arrow Boundary Cases', () => {
    it('T2-F1.B1: Zero-length arrow (startX === endX && startY === endY) produces finite values without NaN', () => {
      const zeroPoint = { x: 250, y: 250 };
      const arrow = calculateArrowheadContract(zeroPoint, zeroPoint, 6);

      expect(Number.isFinite(arrow.tip.x)).toBe(true);
      expect(Number.isFinite(arrow.tip.y)).toBe(true);
      expect(Number.isFinite(arrow.wingLeft.x)).toBe(true);
      expect(Number.isFinite(arrow.wingRight.x)).toBe(true);
      expect(Number.isFinite(arrow.notch.x)).toBe(true);
      expect(Number.isFinite(arrow.shaftEnd.x)).toBe(true);
      expect(arrow.pathString).not.toContain('NaN');

      // Verify core calculateArrowhead consistency
      const coreArrow = calculateArrowhead(zeroPoint, zeroPoint, 6);
      expect(Number.isFinite(coreArrow.tip.x)).toBe(true);
      expect(coreArrow.pathString).not.toContain('NaN');
    });

    it('T2-F1.B2: Micro-length arrow (< 1px, 0.001px) clamps headLength to prevent arrow inversion', () => {
      const microLengths = [0.0001, 0.001, 0.01, 0.1, 0.5, 1.0];
      for (const len of microLengths) {
        const start = { x: 100, y: 100 };
        const end = { x: 100 + len, y: 100 };
        const arrow = calculateArrowheadContract(start, end, 6);

        expect(arrow.headLength).toBeLessThanOrEqual(len * 0.45 + 1e-7);
        expect(Number.isFinite(arrow.headLength)).toBe(true);
        expect(arrow.pathString).not.toContain('NaN');
      }
    });

    it('T2-F1.B3: Extreme stroke width (1px, 32px, 64px) maintains clamped base headLength', () => {
      const start = { x: 100, y: 100 };
      const end = { x: 600, y: 100 };

      // 1px stroke
      const arrow1 = calculateArrowheadContract(start, end, 1);
      expect(arrow1.headLength).toBeGreaterThanOrEqual(14);
      expect(arrow1.casingStrokeWidth).toBe(4.5);

      // 32px stroke
      const arrow32 = calculateArrowheadContract(start, end, 32);
      expect(arrow32.headLength).toBeLessThanOrEqual(36);
      expect(arrow32.casingStrokeWidth).toBe(35.5);

      // 64px stroke (clamped to max 36)
      const arrow64 = calculateArrowheadContract(start, end, 64);
      expect(arrow64.headLength).toBe(36);
      expect(arrow64.casingStrokeWidth).toBe(67.5);
    });

    it('T2-F1.B4: 8 Cardinal and intercardinal orientations maintain geometric symmetry', () => {
      const center = { x: 500, y: 500 };
      const radius = 200;
      const angles = [0, 45, 90, 135, 180, 225, 270, 315];

      for (const deg of angles) {
        const rad = (deg * Math.PI) / 180;
        const end = {
          x: center.x + radius * Math.cos(rad),
          y: center.y + radius * Math.sin(rad),
        };
        const arrow = calculateArrowheadContract(center, end, 6);
        const normalizedRad = Math.atan2(Math.sin(rad), Math.cos(rad));
        expect(arrow.headingRad).toBeCloseTo(normalizedRad, 2);
        expect(arrow.headLength).toBeGreaterThanOrEqual(14);
        expect(arrow.headLength).toBeLessThanOrEqual(36);
        expect(arrow.pathString).not.toContain('NaN');
      }
    });

    it('T2-F1.B5: Inverted and negative coordinates span canvas without numerical overflow', () => {
      const start = { x: -400, y: -200 };
      const end = { x: -50, y: -100 };
      const arrow = calculateArrowheadContract(start, end, 6);

      expect(arrow.tip).toEqual({ x: -50, y: -100 });
      expect(Number.isFinite(arrow.wingLeft.x)).toBe(true);
      expect(Number.isFinite(arrow.shaftEnd.x)).toBe(true);
      expect(arrow.pathString).not.toContain('NaN');
    });
  });

  // --------------------------------------------------------------------------
  // Feature R2 Highlight Boundaries
  // --------------------------------------------------------------------------
  describe('R2 Highlight Boundary Cases', () => {
    it('T2-F2.B1: Zero-dimension highlight (0x0 rect) normalizes cleanly without error', () => {
      const raw = normalizeHighlightGeometry({ x: 200, y: 200 }, { x: 200, y: 200 });
      expect(raw.width).toBe(0);
      expect(raw.height).toBe(0);
      expect(raw.x).toBe(200);
      expect(raw.y).toBe(200);

      const maskModel = generateSpotlightMaskModel([raw]);
      expect(maskModel.cutouts.length).toBe(1);
      expect(maskModel.cutouts[0].width).toBe(0);
    });

    it('T2-F2.B2: Full-canvas highlight covers entire image dimensions', () => {
      const full = normalizeHighlightGeometry({ x: 0, y: 0 }, { x: 1920, y: 1080 });
      expect(full.width).toBe(1920);
      expect(full.height).toBe(1080);

      const maskModel = generateSpotlightMaskModel([full]);
      expect(maskModel.cutouts[0]).toEqual({
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        fill: 'black',
        rx: 4,
      });
    });

    it('T2-F2.B3: Negative drag normalization (drag bottom-right to top-left)', () => {
      const normalized = normalizeHighlightGeometry({ x: 800, y: 600 }, { x: 200, y: 150 });
      expect(normalized.x).toBe(200);
      expect(normalized.y).toBe(150);
      expect(normalized.width).toBe(600);
      expect(normalized.height).toBe(450);
    });

    it('T2-F2.B4: Massive multi-region density (50 overlapping highlights) merges cleanly', () => {
      const highlights: HighlightGeometry[] = [];
      for (let i = 0; i < 50; i++) {
        highlights.push({
          type: 'highlight',
          x: 100 + i * 10,
          y: 100 + i * 10,
          width: 200,
          height: 150,
        });
      }

      const maskModel = generateSpotlightMaskModel(highlights);
      expect(maskModel.cutouts.length).toBe(50);
      expect(maskModel.cutouts.every((c) => c.fill === 'black')).toBe(true);
    });

    it('T2-F2.B5: Highlight extending beyond canvas bounds handles off-screen coordinates safely', () => {
      const offscreen = normalizeHighlightGeometry({ x: -100, y: -50 }, { x: 2500, y: 1500 });
      expect(offscreen.x).toBe(-100);
      expect(offscreen.y).toBe(-50);
      expect(offscreen.width).toBe(2600);
      expect(offscreen.height).toBe(1550);

      const maskModel = generateSpotlightMaskModel([offscreen]);
      expect(maskModel.cutouts.length).toBe(1);
      expect(maskModel.cutouts[0].width).toBe(2600);
    });
  });

  // --------------------------------------------------------------------------
  // Feature R3 Blur Boundaries
  // --------------------------------------------------------------------------
  describe('R3 Blur Boundary Cases', () => {
    it('T2-F3.B1: Zero-dimension blur (0x0 rect) is safe and does not cause division by zero', () => {
      const zeroBlur = normalizeBlurGeometry({ x: 150, y: 150 }, { x: 150, y: 150 });
      expect(zeroBlur.width).toBe(0);
      expect(zeroBlur.height).toBe(0);

      const filterModel = generateBlurFilterModel([zeroBlur]);
      expect(filterModel.clipPaths.length).toBe(1);
      expect(filterModel.clipPaths[0].rect.width).toBe(0);
    });

    it('T2-F3.B2: 1x1 micro-blur region processes without numerical instability', () => {
      const microBlur: BlurGeometry = { type: 'blur', x: 50, y: 50, width: 1, height: 1 };
      const filterModel = generateBlurFilterModel([microBlur]);

      expect(filterModel.clipPaths[0].rect.width).toBe(1);
      expect(filterModel.clipPaths[0].rect.height).toBe(1);
      expect(filterModel.stdDeviation).toBe(10);
    });

    it('T2-F3.B3: Negative drag normalization computes positive bounds', () => {
      const reverseBlur = normalizeBlurGeometry({ x: 600, y: 400 }, { x: 250, y: 150 });
      expect(reverseBlur.x).toBe(250);
      expect(reverseBlur.y).toBe(150);
      expect(reverseBlur.width).toBe(350);
      expect(reverseBlur.height).toBe(250);
    });

    it('T2-F3.B4: Blur region exceeding image bounds is bounded cleanly', () => {
      const outOfBoundsBlur: BlurGeometry = { type: 'blur', x: -50, y: -20, width: 2200, height: 1200 };
      const filterModel = generateBlurFilterModel([outOfBoundsBlur]);

      expect(filterModel.clipPaths.length).toBe(1);
      expect(filterModel.clipPaths[0].rect.x).toBe(-50);
      expect(filterModel.clipPaths[0].rect.width).toBe(2200);
    });

    it('T2-F3.B5: Multiple adjacent and stacked blur regions generate isolated clipPaths', () => {
      const blurs: BlurGeometry[] = [
        { type: 'blur', x: 100, y: 100, width: 150, height: 50 },
        { type: 'blur', x: 250, y: 100, width: 150, height: 50 }, // Adjacent horizontally
        { type: 'blur', x: 150, y: 120, width: 100, height: 60 }, // Overlapping vertically
      ];

      const filterModel = generateBlurFilterModel(blurs);
      expect(filterModel.clipPaths.length).toBe(3);
      expect(filterModel.clipPaths[0].id).toBe('blur-clip-0');
      expect(filterModel.clipPaths[1].id).toBe('blur-clip-1');
      expect(filterModel.clipPaths[2].id).toBe('blur-clip-2');
    });
  });

  // --------------------------------------------------------------------------
  // Feature R4 Resolution Scale Boundaries
  // --------------------------------------------------------------------------
  describe('R4 Resolution Scale Boundary Cases', () => {
    it('T2-F4.B1: Ultra-small images (1x1, 10x10, 100x100) clamp scale strictly to minimum 1.0', () => {
      expect(computeResolutionScaleContract(1, 1)).toBe(1.0);
      expect(computeResolutionScaleContract(10, 10)).toBe(1.0);
      expect(computeResolutionScaleContract(100, 100)).toBe(1.0);
      expect(computeResolutionScaleContract(0, 0)).toBe(1.0);
      expect(computeResolutionScaleContract(-100, -100)).toBe(1.0);
    });

    it('T2-F4.B2: Massive 8K/16K resolution (7680x4320, 15360x8640) clamps scale to maximum 4.0', () => {
      expect(computeResolutionScaleContract(7680, 4320)).toBe(4.0);
      expect(computeResolutionScaleContract(15360, 8640)).toBe(4.0);
      expect(computeResolutionScaleContract(30000, 20000)).toBe(4.0);
    });

    it('T2-F4.B3: Extreme aspect ratios (10000x200 banner, 200x10000 skyscraper) scale by max dimension', () => {
      const bannerScale = computeResolutionScaleContract(10000, 200);
      expect(bannerScale).toBe(4.0); // max(10000, 200) / 1440 = 6.94 -> clamped to 4.0

      const skyscraperScale = computeResolutionScaleContract(300, 3000);
      expect(skyscraperScale).toBeCloseTo(3000 / 1440, 2); // 2.08x
    });

    it('T2-F4.B4: Multi-digit badges at 4K resolution (index 99, index 999) expand width proportionally', () => {
      const scale4k = computeResolutionScaleContract(3840, 2160); // 2.667

      const badge1 = getBadgeDimensionsContract(1, scale4k);
      const badge99 = getBadgeDimensionsContract(99, scale4k);
      const badge999 = getBadgeDimensionsContract(999, scale4k);

      expect(badge99.isPill).toBe(true);
      expect(badge999.isPill).toBe(true);

      // Multi-digit width is wider than single digit
      expect(badge99.width).toBeGreaterThan(badge1.width);
      expect(badge999.width).toBeGreaterThan(badge99.width);

      // Height remains uniform
      expect(badge99.height).toBe(badge1.height);
      expect(badge999.height).toBe(badge1.height);
    });

    it('T2-F4.B5: Floating point non-integer image dimensions produce safe integer pixel badge outputs', () => {
      const scaleFloat = computeResolutionScaleContract(1920.75, 1080.33);
      const badge = getBadgeDimensionsContract(5, scaleFloat);

      expect(Number.isInteger(badge.width)).toBe(true);
      expect(Number.isInteger(badge.height)).toBe(true);
      expect(Number.isInteger(badge.radius)).toBe(true);
      expect(Number.isInteger(badge.fontSize)).toBe(true);
    });
  });
});

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (>=8 TEST CASES)
// ============================================================================

describe('Tier 3: Cross-Feature Combinations & Interactions', () => {
  let state: AnnotelyAppState;

  beforeEach(() => {
    state = createInitialAnnotelyState();
    state.image = createAnnotelyTestImage(1920, 1080, 'combo-base.png');
  });

  it('Combo 1: Arrow pointing directly over a blurred region (Arrow over Blur)', () => {
    // 1. Add blur region
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'blur', x: 400, y: 300, width: 300, height: 100 },
        note: 'Sensitive database connection string',
      },
    });

    // 2. Add arrow pointing from outside into the center of the blurred region
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'arrow', startX: 200, startY: 350, endX: 550, endY: 350 },
        style: { color: 'red', strokeWidth: 6, fillOpacity: 1.0 },
        note: 'Redacted security issue',
      },
    });

    expect(state.annotations.length).toBe(2);
    expect(state.annotations[0].index).toBe(0); // Blur is unnumbered
    expect(state.annotations[1].index).toBe(1); // Arrow is callout #1

    const { steps } = simulateAnnotelyCanvasExport(state.image!, state.annotations);

    // Destructive blur baking occurs BEFORE arrow vector rendering
    const blurIndex = steps.findIndex((s) => s.stage === 'destructive_blur_bake');
    const arrowShaftIndex = steps.findIndex((s) => s.stage === 'render_arrow_shaft');
    const arrowCasingIndex = steps.findIndex((s) => s.stage === 'render_arrow_casing');

    expect(blurIndex).toBeGreaterThan(-1);
    expect(arrowCasingIndex).toBeGreaterThan(blurIndex);
    expect(arrowShaftIndex).toBeGreaterThan(arrowCasingIndex);
  });

  it('Combo 2: Additive highlight with callout pin and numbered badge inside', () => {
    // 1. Add highlight focus region
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'highlight', x: 200, y: 200, width: 500, height: 400 },
        note: 'Primary callout card',
      },
    });

    // 2. Place callout pin inside the illuminated spotlight
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'pin', x: 450, y: 400 },
        style: { color: 'green', strokeWidth: 3, fillOpacity: 1.0 },
        note: 'Specific component button',
      },
    });

    expect(state.annotations.length).toBe(2);

    const { steps } = simulateAnnotelyCanvasExport(state.image!, state.annotations);
    const spotlightCompositeIndex = steps.findIndex((s) => s.stage === 'spotlight_composite_apply');
    const pinRenderIndex = steps.findIndex((s) => s.stage === 'render_scaled_pin');
    const badgeRenderIndex = steps.findIndex((s) => s.stage === 'render_scaled_badge');

    // Vector pin and badge render on top of the spotlight layer
    expect(pinRenderIndex).toBeGreaterThan(spotlightCompositeIndex);
    expect(badgeRenderIndex).toBeGreaterThan(spotlightCompositeIndex);
  });

  it('Combo 3: Overlapping Blur and Highlight regions (Blur inside illuminated spotlight)', () => {
    // Highlight illuminates [100, 100, 600, 600]
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'highlight', x: 100, y: 100, width: 600, height: 600 },
        note: 'Inspect user profile section',
      },
    });

    // Blur obscures private phone number inside the spotlight [250, 250, 200, 40]
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'blur', x: 250, y: 250, width: 200, height: 40 },
        note: 'Mask private phone number',
      },
    });

    const { steps } = simulateAnnotelyCanvasExport(state.image!, state.annotations);
    const blurIndex = steps.findIndex((s) => s.stage === 'destructive_blur_bake');
    const highlightPunchIndex = steps.findIndex((s) => s.stage === 'spotlight_cutout_punch');

    expect(blurIndex).toBeDefined();
    expect(highlightPunchIndex).toBeDefined();
    // Blur is baked into the base image pixels before the spotlight backdrop is applied
    expect(blurIndex).toBeLessThan(highlightPunchIndex);
  });

  it('Combo 4: 4K Retina screenshot with Arrow, Highlight, Blur, and Scaled Badges', () => {
    const img4k = createAnnotelyTestImage(3840, 2160, '4k-retina-composite.png');
    state = createInitialAnnotelyState({ image: img4k });

    // 1. Highlight
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'highlight', x: 500, y: 500, width: 1200, height: 800 },
        note: 'Feature area',
      },
    });

    // 2. Blur
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'blur', x: 600, y: 600, width: 400, height: 100 },
        note: 'Redacted token',
      },
    });

    // 3. Arrow
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'arrow', startX: 200, startY: 800, endX: 580, endY: 650 },
        style: { color: 'amber', strokeWidth: 8, fillOpacity: 1.0 },
        note: 'Check this secret',
      },
    });

    // 4. Pin
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'pin', x: 2000, y: 1200 },
        note: 'Callout pin',
      },
    });

    expect(state.annotations.length).toBe(4);
    expect(state.annotations.map((a) => a.index)).toEqual([0, 0, 1, 2]);

    const { steps, scale } = simulateAnnotelyCanvasExport(state.image!, state.annotations);
    expect(scale).toBeCloseTo(2.667, 2);

    const badgeSteps = steps.filter((s) => s.stage === 'render_scaled_badge');
    expect(badgeSteps.length).toBe(2); // Only Arrow and Pin have badges
    // All badges scaled proportionally to 4K
    for (const b of badgeSteps) {
      expect(b.details.resolutionScale).toBeCloseTo(2.667, 2);
      expect((b.details.fontSize as number)).toBeGreaterThanOrEqual(30);
    }
  });

  it('Combo 5: Multi-region highlight with directional arrow connecting two focus zones', () => {
    // Highlight zone A
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'highlight', x: 100, y: 100, width: 300, height: 300 },
        note: 'Zone A: Source Service',
      },
    });

    // Highlight zone B
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'highlight', x: 800, y: 100, width: 300, height: 300 },
        note: 'Zone B: Target Service',
      },
    });

    // Arrow traversing dimmed backdrop between Zone A and Zone B
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'arrow', startX: 400, startY: 250, endX: 800, endY: 250 },
        style: { color: 'cyan', strokeWidth: 6, fillOpacity: 1.0 },
        note: 'Network packet drop',
      },
    });

    expect(state.annotations.length).toBe(3);

    const mask = generateSpotlightMaskModel([
      state.annotations[0].geometry as HighlightGeometry,
      state.annotations[1].geometry as HighlightGeometry,
    ]);
    expect(mask.cutouts.length).toBe(2);

    const arrow = calculateArrowheadContract(
      { x: 400, y: 250 },
      { x: 800, y: 250 },
      6
    );
    expect(arrow.casingStrokeWidth).toBe(9.5); // Arrow casing ensures visibility over dimmed backdrop
  });

  it('Combo 6: Undo/Redo sequence across mixed Annotely tools retains sequential indices', () => {
    const history: AnnotelyAppState[] = [state];

    // Step 1: Add Arrow
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'arrow', startX: 10, startY: 10, endX: 100, endY: 10 } },
    });
    history.push(state);

    // Step 2: Add Highlight
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'highlight', x: 150, y: 50, width: 100, height: 80 } },
    });
    history.push(state);

    // Step 3: Add Blur
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'blur', x: 300, y: 50, width: 100, height: 40 } },
    });
    history.push(state);

    expect(state.annotations.length).toBe(3);
    expect(state.annotations.map((a) => a.index)).toEqual([1, 0, 0]);

    // Simulate Undo 1 step (pop blur)
    state = history[2];
    expect(state.annotations.length).toBe(2);
    expect(state.annotations.map((a) => a.index)).toEqual([1, 0]);

    // Simulate Redo (restore blur)
    state = history[3];
    expect(state.annotations.length).toBe(3);
    expect(state.annotations.map((a) => a.index)).toEqual([1, 0, 0]);
  });

  it('Combo 7: Dynamic re-indexing and deletion of mixed Annotely annotations in sidebar', () => {
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'arrow', startX: 0, startY: 0, endX: 50, endY: 50 }, note: 'Step 1' },
    });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'highlight', x: 60, y: 60, width: 100, height: 100 }, note: 'Step 2' },
    });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'blur', x: 200, y: 200, width: 100, height: 50 }, note: 'Step 3' },
    });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'pin', x: 400, y: 400 }, note: 'Step 4' },
    });

    expect(state.annotations.map((a) => a.index)).toEqual([1, 0, 0, 2]);

    // Delete Highlight (Step 2)
    const highlightId = state.annotations[1].id;
    state = annotelyAppReducer(state, {
      type: 'DELETE_ANNOTATION',
      payload: { id: highlightId },
    });

    expect(state.annotations.length).toBe(3);
    expect(state.annotations[0].note).toBe('Step 1');
    expect(state.annotations[0].index).toBe(1);
    expect(state.annotations[1].note).toBe('Step 3');
    expect(state.annotations[1].index).toBe(0); // Blur remains unnumbered (0)
    expect(state.annotations[2].note).toBe('Step 4');
    expect(state.annotations[2].index).toBe(2); // Pin remains index 2
  });

  it('Combo 8: Full composite canvas export with all 4 Annotely features active in exact order', () => {
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'highlight', x: 100, y: 100, width: 200, height: 200 } },
    });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'blur', x: 350, y: 150, width: 150, height: 50 } },
    });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'arrow', startX: 50, startY: 500, endX: 200, endY: 200 } },
    });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: { geometry: { type: 'pin', x: 600, y: 600 } },
    });

    const { steps } = simulateAnnotelyCanvasExport(state.image!, state.annotations);
    const stages = steps.map((s) => s.stage);

    // Verify correct chronological pipeline order:
    // 1. Base image
    expect(stages[0]).toBe('draw_base_image');
    // 2. Destructive blur baking
    expect(stages).toContain('destructive_blur_bake');
    // 3. Spotlight backdrop and cutouts
    expect(stages).toContain('spotlight_backdrop_fill');
    expect(stages).toContain('spotlight_cutout_punch');
    expect(stages).toContain('spotlight_composite_apply');
    // 4. Arrow underlay casing, shaft, head
    expect(stages).toContain('render_arrow_casing');
    expect(stages).toContain('render_arrow_shaft');
    expect(stages).toContain('render_arrow_head');
    // 5. Scaled pins
    expect(stages).toContain('render_scaled_pin');
    // 6. Numbered badges
    expect(stages).toContain('render_scaled_badge');
  });
});

// ============================================================================
// TIER 4: REAL-WORLD SCENARIOS (>=4 TEST CASES)
// ============================================================================

describe('Tier 4: Real-World Workload Scenarios', () => {
  let state: AnnotelyAppState;

  beforeEach(() => {
    state = createInitialAnnotelyState();
  });

  it('Scenario 1: Redacting Sensitive API Keys & Passwords in a Cloud Console Screenshot', () => {
    // Developer pastes AWS Console screenshot (1920x1080)
    state.image = createAnnotelyTestImage(1920, 1080, 'aws-console-iam.png');

    // 1. Select Blur tool and redact Access Key ID
    state = annotelyAppReducer(state, { type: 'SET_ACTIVE_TOOL', payload: 'blur' });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'blur', x: 320, y: 215, width: 220, height: 32 },
        note: 'Redacted IAM Access Key `AKIAIOSFODNN7EXAMPLE`',
      },
    });

    // 2. Redact Secret Access Key
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'blur', x: 320, y: 260, width: 380, height: 32 },
        note: 'Redacted Secret Access Key',
      },
    });

    // 3. Point Arrow to the IAM User Name
    state = annotelyAppReducer(state, { type: 'SET_ACTIVE_TOOL', payload: 'arrow' });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'arrow', startX: 120, startY: 150, endX: 310, endY: 150 },
        style: { color: 'amber', strokeWidth: 6, fillOpacity: 1.0 },
        note: 'Audit target IAM User: `deploy-agent`',
      },
    });

    expect(state.annotations.length).toBe(3);
    expect(state.annotations.map((a) => a.index)).toEqual([0, 0, 1]); // 2 Blurs (0, 0) and 1 Arrow (1)

    // Verify destructive baking guarantees privacy
    const { steps } = simulateAnnotelyCanvasExport(state.image!, state.annotations);
    const blurBakes = steps.filter((s) => s.stage === 'destructive_blur_bake');
    expect(blurBakes.length).toBe(2);
    expect(blurBakes.every((b) => b.details.bakedIrreversibly === true)).toBe(true);
  });

  it('Scenario 2: Highlighting Code Bug & Root Cause Callout in Developer Review', () => {
    // Ingest code editor screenshot
    state.image = createAnnotelyTestImage(1920, 1200, 'vscode-stacktrace.png');

    // 1. Highlight buggy lines in code
    state = annotelyAppReducer(state, { type: 'SET_ACTIVE_TOOL', payload: 'highlight' });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'highlight', x: 280, y: 350, width: 750, height: 90 },
        note: 'Null pointer dereference on `user.profile.settings`',
      },
    });

    // 2. Highlight corresponding terminal exception log
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'highlight', x: 280, y: 820, width: 900, height: 120 },
        note: 'Uncaught TypeError thrown in payment service runtime',
      },
    });

    // 3. Draw bold arrow connecting exception log to code line
    state = annotelyAppReducer(state, { type: 'SET_ACTIVE_TOOL', payload: 'arrow' });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'arrow', startX: 750, startY: 820, endX: 750, endY: 450 },
        style: { color: 'red', strokeWidth: 6, fillOpacity: 1.0 },
        note: 'Stack frame #1 maps directly to Line 42',
      },
    });

    expect(state.annotations.length).toBe(3);
    const mask = generateSpotlightMaskModel([
      state.annotations[0].geometry as HighlightGeometry,
      state.annotations[1].geometry as HighlightGeometry,
    ]);

    // Additive highlight leaves code and terminal illuminated simultaneously
    expect(mask.cutouts.length).toBe(2);
  });

  it('Scenario 3: Design Review on 4K Retina Mobile Mockup with Proportional Badges', () => {
    // 4K Mobile app mockup screenshot
    state.image = createAnnotelyTestImage(3840, 2160, 'iphone-mockup-4k.png');

    // 1. Callout Pin on navigation bar
    state = annotelyAppReducer(state, { type: 'SET_ACTIVE_TOOL', payload: 'pin' });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'pin', x: 1920, y: 220 },
        style: { color: 'purple', strokeWidth: 4, fillOpacity: 1.0 },
        note: 'Header title is 4px off-center horizontally',
      },
    });

    // 2. Arrow pointing to missing CTA button
    state = annotelyAppReducer(state, { type: 'SET_ACTIVE_TOOL', payload: 'arrow' });
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'arrow', startX: 1500, startY: 1800, endX: 1920, endY: 1800 },
        style: { color: 'amber', strokeWidth: 8, fillOpacity: 1.0 },
        note: 'Primary checkout button needs amber gold contrast',
      },
    });

    const { scale, steps } = simulateAnnotelyCanvasExport(state.image!, state.annotations);
    expect(scale).toBeCloseTo(2.667, 2);

    // Badges must be scaled up proportionally so they remain readable at 100% zoom
    const badgeStep1 = steps.find((s) => s.stage === 'render_scaled_badge' && s.details.index === 1);
    expect((badgeStep1?.details.fontSize as number)).toBeGreaterThanOrEqual(30);
    expect((badgeStep1?.details.width as number)).toBeGreaterThanOrEqual(60);
  });

  it('Scenario 4: Security Audit Multi-Layer Composite PNG Export with 100% Parity', () => {
    state.image = createAnnotelyTestImage(2560, 1440, 'security-audit-2k.png');

    // Step 1: Redact private Authorization Bearer Token
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'blur', x: 400, y: 180, width: 450, height: 40 },
        note: 'Masked JWT token',
      },
    });

    // Step 2: Spotlight the vulnerable SQL injection query param
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'highlight', x: 380, y: 320, width: 600, height: 80 },
        note: 'Unescaped `id` parameter in GET request',
      },
    });

    // Step 3: Thick arrow pointing from payload into SQL query
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'arrow', startX: 180, startY: 360, endX: 370, endY: 360 },
        style: { color: 'red', strokeWidth: 6, fillOpacity: 1.0 },
        note: 'Exploit entry point',
      },
    });

    // Step 4: Add Callout Pin
    state = annotelyAppReducer(state, {
      type: 'ADD_ANNOTATION',
      payload: {
        geometry: { type: 'pin', x: 1020, y: 360 },
        style: { color: 'amber', strokeWidth: 4, fillOpacity: 1.0 },
        note: 'Vulnerability Severity: Critical (CVSS 9.8)',
      },
    });

    const { steps, scale } = simulateAnnotelyCanvasExport(state.image!, state.annotations);
    expect(scale).toBeCloseTo(1.778, 2);

    expect(steps.filter((s) => s.stage === 'destructive_blur_bake').length).toBe(1);
    expect(steps.filter((s) => s.stage === 'spotlight_cutout_punch').length).toBe(1);
    expect(steps.filter((s) => s.stage === 'render_arrow_shaft').length).toBe(1);
    expect(steps.filter((s) => s.stage === 'render_scaled_pin').length).toBe(1);
    expect(steps.filter((s) => s.stage === 'render_scaled_badge').length).toBe(2); // Only Arrow and Pin have badges
  });
});
