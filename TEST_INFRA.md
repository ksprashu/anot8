# Anot8: 4-Tier Opaque-Box Test Infrastructure

## 1. Overview & Architecture

The Anot8 test infrastructure is an opaque-box, contract-driven verification engine designed to validate 100% of user requirements, state invariants, spatial transformations, vector mathematics, and export fidelity without coupling tests to transient internal implementations.

The framework operates across four distinct, complementary tiers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TIER 4: Realistic Real-World Workload Scenarios                         │
│ • End-to-end user workflows (Bug report, Tablet layout, Code diff,      │
│   API key redaction, 4K Retina reviews, Security audit composite export)│
├─────────────────────────────────────────────────────────────────────────┤
│ TIER 3: Cross-Feature Pairwise & Multi-Feature Interaction Suites       │
│ • State mutation sequences, zoom/paste combos, overlay layering,        │
│   arrow over blur, spotlight with pins/badges, blur inside spotlight,   │
│   undo/redo loops, dynamic re-indexing across all tool geometries       │
├─────────────────────────────────────────────────────────────────────────┤
│ TIER 2: Boundary, Corner Case & Stress Tests (>=5 per feature)          │
│ • Delta bursts, extreme deltaY, 0/50 annotations, 8K overlays, clamps,  │
│   zero size, micro vectors, 4K/8K/16K scaling, negative coords,         │
│   extreme stroke widths, 50+ overlapping regions, offscreen clipping    │
├─────────────────────────────────────────────────────────────────────────┤
│ TIER 1: Feature Coverage (>=5 test cases per feature across R1-R5 & F1-F4)
│ • Pure contract-based verification of every requirement & action        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Test Execution Harnesses

Anot8 provides dual complementary execution modes:

### 2.1 Vitest Full Suite
- Runs all unit, component, integration, and stress test suites with JSDOM environment, React Testing Library, Canvas 2D / OffscreenCanvas mocks, and synthetic event dispatchers.
- Fast parallel test execution with TypeScript transpilation on the fly.

### 2.2 Standalone E2E Runner (`tests/e2e/test-runner.ts`)
- Zero-external-dependency runner executing in any Node.js environment (v20+).
- Custom headless canvas, offscreen canvas, and clipboard mock harnesses.

---

## 3. Test Directory Layout

```
tests/
├── setup.ts                                # Vitest test setup, JSDOM & Canvas polyfills
├── helpers/
│   ├── testFixtures.ts                     # Base platform domain fixtures and test oracles
│   └── annotelyFixtures.ts                 # Annotely feature models, contracts & simulation harness
├── unit/                                   # Domain math, geometry, reducer, exporter unit tests
│   ├── appReducer.test.ts
│   ├── badges.test.ts
│   ├── canvasExporter.test.ts
│   ├── geometry.test.ts
│   ├── ops_config.test.ts
│   ├── spec.test.ts                        # Spec schema, anchors, percentages, ops, round trips
│   ├── agentBridge.test.tsx                # window.anot8 session, #spec= links, undo
│   └── useKeyboardShortcuts.test.ts
├── component/                              # React component tests
│   ├── ColorPalette.test.tsx
│   ├── MainToolbar.test.tsx
│   ├── ReplaceImageModal.test.tsx
│   ├── SvgOverlay.test.tsx
│   └── ZoomControls.test.tsx
├── integration/                            # Theming and accessibility integration tests
│   └── themingAndAccessibility.test.tsx
├── stress/                                 # Adversarial stress & boundary challengers
│   ├── m1_arrow_export_challenger.test.ts
│   ├── m1_arrowhead_geometry_challenger.test.ts
│   ├── m2_highlight_export_challenger.test.ts
│   ├── m2_highlight_mask_challenger.test.ts
│   ├── m2_highlight_spotlight_challenger.test.ts
│   ├── m3_blur_export_challenger.test.ts
│   ├── m3_blur_preview_challenger.test.ts
│   ├── m4_resolution_math_challenger.test.ts
│   ├── m4_scale_export_challenger.test.ts
│   ├── m5_challenger1_canvas_rasterizer_stress.test.ts
│   ├── m5_challenger1_tier5_master_stress.test.ts
│   ├── m5_challenger2_tier5_boundary_concurrency.test.ts
│   ├── m6_challenger2_shortcuts_stress.test.tsx
│   └── zoom_coordinates_adversarial.test.ts
├── node/                                   # Vitest "node" project (no jsdom)
│   ├── golden.test.ts                      # Renders fixtures/specs/* and pixel-diffs fixtures/golden/*
│   └── cli.test.ts                         # Built anot8 CLI, MCP server (tools/resources/prompts), SSRF guards
├── fixtures/
│   ├── screen.png                          # 800x500 synthetic UI screenshot
│   ├── specs/*.anot8.json                  # Fixture specs covering every annotation type, frame, anchors
│   └── golden/*.png                        # Committed golden renders
└── e2e/
    ├── annotely_features.test.ts           # Master Vitest E2E Suite for Annotely Features (53 tests)
    ├── test-runner.ts                      # Standalone zero-dependency test runner
    ├── r1-r5-tier1-features.test.ts        # R1-R5 Tier 1: Feature Coverage
    ├── r1-r5-tier2-boundaries.test.ts      # R1-R5 Tier 2: Boundary & Corner Cases
    ├── r1-r5-tier3-combinations.test.ts    # R1-R5 Tier 3: Pairwise Cross-Feature Interactions
    ├── r1-r5-tier4-workloads.test.ts       # R1-R5 Tier 4: Real-World Developer Workloads
    ├── tier1-features.test.ts              # Base Platform Tier 1 Feature Coverage (115 tests)
    ├── tier2-boundaries.test.ts            # Base Platform Tier 2 Boundary & Stress (115 tests)
    ├── tier3-combinations.test.ts          # Base Platform Tier 3 Cross-Feature Suites (12 tests)
    └── tier4-workloads.test.ts             # Base Platform Tier 4 Real-World Workloads (5 tests)
```

---

## 4. Execution Commands

```bash
# Execute the complete Vitest test suite (unit, component, stress, integration, e2e):
npm test

# Run only the headless project (golden renders, CLI, MCP):
npx vitest run --project node

# Regenerate golden images after an intentional rendering change:
UPDATE_GOLDEN=1 npx vitest run --project node

# Run the standalone 4-tier master test runner:
npx tsx tests/e2e/test-runner.ts

# Run typecheck:
npm run typecheck

# Run linter:
npm run lint

# Build production bundle:
npm run build
```

---

## 5. Authoritative Interface & Invariant Specifications

### 5.1 Image Paste Modes & Layering
1. **Ghost Annotation Elimination**: When pasting over an active session and selecting "Replace & Clear Annotations" (`REPLACE_IMAGE_AND_CLEAR`), `state.annotations` and `state.overlays` must be strictly empty (`length === 0`).
2. **Replacement with Preservation**: Selecting "Replace & Keep Annotations" (`REPLACE_IMAGE_AND_KEEP`) swaps `state.image` while leaving all `state.annotations`, sequence badges, and markdown notes intact.
3. **Overlay Layering**: Selecting "Add as Layer / Overlay" (`ADD_IMAGE_OVERLAY`) appends an `ImageOverlay` record without altering `state.image` or resetting existing annotations.
4. **Style Retention**: Preserving annotations across image replacements must not mutate per-annotation styling (`color`, `strokeWidth`, `fillOpacity`).

### 5.2 Wheel Zoom Quantization & Focal Centering
1. **Discrete Preset Scale**: Wheel zooming is quantized strictly across the 10-preset ladder:
   $$\text{ZOOM\_PRESETS} = [0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00]$$
2. **Monotonic Step Transition**: A single wheel tick (`deltaY < 0` for zoom in, `deltaY > 0` for zoom out) advances or decrements by exactly one step index along the ladder.
3. **Cursor Focal Point Invariance**: Zooming centered at screen cursor $(x_f, y_f)$ guarantees that the underlying image point remains identical before and after zoom.

### 5.3 Responsive Toolbar & Styling Controls
1. **Universal Tool Rendering**: At viewports down to $768\text{px}$ and $640\text{px}$, all drawing tools and styling controls remain rendered and interactive.
2. **Distinct Stroke Presets**: Presets offer $[2, 4, 8]\text{px}$ options with distinct visual weights.
3. **Explicit Fill Opacity**: Provides visible descriptive `"Fill"` label and $[0\%, 15\%, 30\%, 50\%]$ presets.

### 5.4 Arrow Geometry & Contrast Casing
1. **Thicker Shaft & Sharp Head**: Sharp $30^\circ$ sweep with recessed notch and shaft end recessed by $0.5 \times \text{strokeWidth}$ to eliminate round cap bleed.
2. **Contrast Casing**: Underlay stroke width is $\text{strokeWidth} + 3.5\text{px}$ with $\text{rgba}(0,0,0,0.55)$ underlay stroke for dark/light visibility.

### 5.5 Additive Highlight / Spotlight
1. **Spotlight Mask**: SVG `<mask id="spotlight-mask">` with base white rect and black cutouts with `rx={4}` over $\text{rgba}(0,0,0,0.45)$ backdrop.
2. **Additive Punchout**: Multiple overlapping cutouts merge seamlessly without double-dimming bands.
3. **2D Canvas Export**: Offscreen backdrop punched via `globalCompositeOperation = 'destination-out'` and composited via `'source-over'`.

### 5.6 Smooth Gaussian Blur
1. **Interactive Preview**: SVG `<feGaussianBlur stdDeviation="10" edgeMode="duplicate" />` clipped to region with `duplicate` edge mode.
2. **Destructive Baking**: Exported canvas bakes Gaussian blur directly into the canvas buffer so underlying sensitive pixels cannot be recovered.

### 5.7 Resolution-Aware Scalable Badges
1. **Scale Metric**: $\text{scale} = \text{clamp}(\max(\text{width}, \text{height}) / 1440, 1.0, 4.0)$.
2. **100% Backward Compatibility**: Images $\le 1440\text{px}$ produce exact $1.0\times$ baseline dimensions.
3. **Export Parity**: Exact proportional scaling applied in 2D canvas export.
