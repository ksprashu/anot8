# Project: Anot8 — Master Architecture & Feature Inventory

## Architecture
Anot8 is a client-side screenshot annotation web application built with React, TypeScript, Vite, and Tailwind CSS.
It is built with a Layered Hybrid Architecture for ultra-fast 60 FPS viewport interaction and pixel-perfect 1:1 composite export:

### 1. State Management
- Redux-style reducer (`src/state/appReducer.ts`) with typed actions (`src/types/index.ts`) and 1..N reindexing invariant.
- History stack (`historyManager.ts`) with full undo/redo support across shapes, notes, and image replacements.

### 2. Interactive Viewport Layer (`CanvasWorkspace.tsx`)
- Container has CSS transform: `translate3d(panX, panY, 0) scale(zoom)`.
- Dimensions strictly match base screenshot `naturalWidth` × `naturalHeight`.
- Coordinates in state are stored in intrinsic image pixel space `[0, naturalWidth] × [0, naturalHeight]`.
- Quantized wheel zoom transitions monotonically through preset ladders centered around the mouse cursor coordinates (`src/math/coordinates.ts`).

### 3. Interactive SVG Overlay Layer (`SvgOverlay.tsx`)
- Renders SVG viewBox matching `0 0 naturalWidth naturalHeight`.
- Renders background click catcher, active shapes via `<ShapeRenderer>`, live drag draft preview, `<BadgeRenderer>`, and `<TransformHandles>`.
- **Spotlight Mask**: SVG `<mask id="spotlight-mask">` with `<rect fill="white">` base and `<rect fill="black">` cutouts for all highlight annotations.
- **Blur Filter**: SVG `<filter id="gaussian-blur">` + `<clipPath>` wrapping an `<image>` element to provide GPU-accelerated live preview.

### 4. Toolbar & Modals
- Responsive top navigation/toolbar (`App.tsx`, `MainToolbar.tsx`, `ColorPalette.tsx`, `ZoomControls.tsx`) ensuring accessibility down to compact 640px viewports without clipped overflow.
- Modal dialogs (`ReplaceImageModal.tsx`) providing explicit Replace & Clear, Replace & Keep, and Add as Layer choices on paste.

### 5. Composite Canvas 2D Export Engine (`canvasExporter.ts`)
- Creates offscreen `<canvas>` at 1:1 `naturalWidth` × `naturalHeight`.
- Draws base image at `(0, 0, W, H)`.
- Applies destructive blur baking directly into the canvas context: `ctx.save(); ctx.clip(); ctx.filter = 'blur(12px)'; ctx.drawImage(baseImg, ...); ctx.restore()`.
- Applies uniform spotlight dimming layer punched out additively via `globalCompositeOperation = 'destination-out'`.
- Composites overlay image layers beneath annotations.
- Rasterizes vector shapes (rectangles, ellipses, thick arrows with contrast casing/shadow, callout pins, numbered badges).
- Automatically scales callout badges and pins based on image resolution (e.g. 2K/4K/Retina) or options override.
- Generates standard `image/png` blob for clipboard copy and file download.

### 6. Parametric Spec & Agent Surfaces
- **Portable core**: `appReducer`, `src/math/*`, `markdownSerializer`, and `canvasExporter` have no React or DOM dependencies (ESLint-enforced). `canvasExporter` takes an injectable `RenderBackend { createCanvas, loadImage }`: `browserBackend` in the app, `createNodeBackend()` (`@napi-rs/canvas`) in `src/core/node/backend.ts`.
- **Model additions**: hex colors via `resolveColor()` (`src/constants/colors.ts`), unnumbered `TextGeometry`, `AnnotationStyle.showBadge`, and `AppState.frame { crop?, padding?, background? }` applied at export. `SET_ANNOTATIONS` replaces the whole list and reindexes.
- **Spec** (`src/spec/`): zod v4 schema with version 1, `image.source`, `frame`, `defaults`, and `annotations`. Coordinates can be pixels or percentages. Points can be anchors (`@id.position` or `{anchor, dx, dy}`). `compileSpec` resolves the spec to annotations; `toSpec` derives a pixel spec from state; `applyOps` edits at the spec level (add/update/delete/reorder/clear/setFrame), so anchors stay live. Errors are a `SpecError` with path-addressed issues.
- **CLI / MCP** (`cli/anot8.ts`, `cli/mcp.ts`): `inspect`, `init`, `render`, `validate`, `apply`, `schema`, and `mcp` (stdio). Bundled by tsup to `dist-cli/anot8.js`. `anot8_render` returns the rendered PNG as MCP image content.
- **Browser bridge** (`src/bridge/`): `window.anot8 = AgentSession { schema, getSpec, loadSpec, apply, render, markdown }`, plus `#spec=<base64url>` links, spec drop/paste, and a Save spec export button.

---

## Feature Inventory

| # | Feature | Description | Track | Source |
|---|---------|-------------|-------|--------|
| 1 | R1.1 Replace & Clear | Purge all previous annotations from state and SVG on image replace with 0 ghost annotations | Paste & Zoom | ORIGINAL_REQUEST.md § R1 |
| 2 | R1.2 Replace & Keep | Replace base image while preserving existing annotations, indices, and sidebar notes in place | Paste & Zoom | ORIGINAL_REQUEST.md § R1 |
| 3 | R1.3 Add as Layer | Add pasted image as an overlay layer on canvas without clearing base image or annotations | Paste & Zoom | ORIGINAL_REQUEST.md § R1 |
| 4 | R1.4 Style Retention | Preserving annotations retains existing style properties (color, strokeWidth, fillOpacity) | Paste & Zoom | ORIGINAL_REQUEST.md § R1 |
| 5 | R1.5 Replace Modal UI | ReplaceImageModal offers 3 distinct action buttons with high-contrast styling and ARIA dialog | Paste & Zoom | ORIGINAL_REQUEST.md § R1 |
| 6 | R2.1 Wheel Delta Stabilization | Prevent erratic zoom factor leaps from wheel/trackpad delta bursts | Paste & Zoom | ORIGINAL_REQUEST.md § R2 |
| 7 | R2.2 Preset Ladder Quantization | Quantize wheel zoom to monotonic single-step transitions across 10-preset ladder: [0.10 .. 2.00] | Paste & Zoom | ORIGINAL_REQUEST.md § R2 |
| 8 | R2.3 Focal Point Centering | Preserve mouse cursor focal point centering invariance during wheel zoom transitions | Paste & Zoom | ORIGINAL_REQUEST.md § R2 |
| 9 | R2.4 Zoom Dropdown Alignment | Update ZoomControls dropdown selector to present full 10-step preset ladder | Paste & Zoom | ORIGINAL_REQUEST.md § R2 |
| 10 | R3.1 Responsive Tool Visibility | All drawing tools and styling controls remain rendered and interactive at <=768px and 640px viewports | Toolbar & Styling | ORIGINAL_REQUEST.md § R3 |
| 11 | R3.2 Responsive Toolbar Wrapping | Elastic multi-row header layout wrapping cleanly without horizontal overflow clipping | Toolbar & Styling | ORIGINAL_REQUEST.md § R3 |
| 12 | R4.1 2px/4px/8px Stroke Presets | Update stroke width presets from [2, 4, 6] to [2, 4, 8] with distinct visual weights | Toolbar & Styling | ORIGINAL_REQUEST.md § R4 |
| 13 | R4.2 Stroke Application | Selecting stroke preset immediately updates selected shape and future drawn shapes | Toolbar & Styling | ORIGINAL_REQUEST.md § R4 |
| 14 | R5.1 Explicit Fill Label | Add visible descriptive "Fill" label or visual indicator to opacity controls (0%, 15%, 30%, 50%) | Toolbar & Styling | ORIGINAL_REQUEST.md § R5 |
| 15 | R5.2 Opacity Application | Selecting opacity preset updates active shape and future shapes on canvas immediately | Toolbar & Styling | ORIGINAL_REQUEST.md § R5 |
| 16 | R5.3 Visual Active Indicators | High-contrast amber accent indicator on the currently active opacity preset button | Toolbar & Styling | ORIGINAL_REQUEST.md § R5 |
| 17 | F1.1 Bold Arrow Shaft | Thicker, bolder arrow shaft (configurable default 6px) with clean notch termination | Annotely Tools | ORIGINAL_REQUEST.md § R1 |
| 18 | F1.2 Polished Arrowhead Geometry | Sharp, well-proportioned arrowhead geometry (30° sweep, recessed notch) matching Annotely | Annotely Tools | ORIGINAL_REQUEST.md § R1 |
| 19 | F1.3 Arrow Contrast Outlines | High-contrast underlay stroke/casing and drop shadow for legibility across dark and light backgrounds | Annotely Tools | ORIGINAL_REQUEST.md § R1 |
| 20 | F1.4 Tail-Anchored Badge & Handles | Preserves tail-anchored badge positioning at (startX, startY) and interactive start/end transform handles | Annotely Tools | ORIGINAL_REQUEST.md § R1 |
| 21 | F1.5 Arrow 2D Canvas Export Parity | Identical thick shaft, sharp head, contrast casing, and drop shadow rendered in offscreen 2D canvas | Annotely Tools | ORIGINAL_REQUEST.md § R1 |
| 22 | F2.1 Highlight Tool Definition & State | Tool type 'highlight', box geometry model, activeTool switching, toolbar icon, sidebar sync | Annotely Tools | ORIGINAL_REQUEST.md § R2 |
| 23 | F2.2 Interactive Spotlight Mask | SVG mask with white base and black cutouts over uniform semi-transparent backdrop (rgba(0,0,0,0.45)) | Annotely Tools | ORIGINAL_REQUEST.md § R2 |
| 24 | F2.3 Additive Multi-Region Highlighting | Multiple highlight rectangles merge seamlessly without double-dimming or overlapping dark bands | Annotely Tools | ORIGINAL_REQUEST.md § R2 |
| 25 | F2.4 Highlight 2D Canvas Export Parity | Offscreen canvas export with destination-out punched cutouts over uniform backdrop | Annotely Tools | ORIGINAL_REQUEST.md § R2 |
| 26 | F3.1 Blur Tool Definition & State | Tool type 'blur', box geometry model, activeTool switching, toolbar icon, sidebar sync | Annotely Tools | ORIGINAL_REQUEST.md § R3 |
| 27 | F3.2 Interactive Gaussian Blur Preview | SVG feGaussianBlur filter and clipPath over base image element for responsive live preview | Annotely Tools | ORIGINAL_REQUEST.md § R3 |
| 28 | F3.3 Destructive Blur Export Baking | Bakes Gaussian blur directly into 2D canvas pixel buffer so sensitive text/pixels are unrecoverable | Annotely Tools | ORIGINAL_REQUEST.md § R3 |
| 29 | F3.4 Blur Fallback & Edge Mode | Clamp/duplicate edge mode handling without dark border artifacts, robust canvas filter fallback | Annotely Tools | ORIGINAL_REQUEST.md § R3 |
| 30 | F4.1 Resolution Scale Metric | computeResolutionScale(w, h) based on natural image dimensions, defaulting to 1.0 for backward compatibility | Scalable Badges | ORIGINAL_REQUEST.md § R4 |
| 31 | F4.2 Scalable Badges & Font Sizes | Proportional scaling of callout badges and font sizes on 2K/4K/Retina screenshots with minimum readable limits | Scalable Badges | ORIGINAL_REQUEST.md § R4 |
| 32 | F4.3 Scalable Pin Markers | Proportional scaling of pin marker head radius, pointer height, and centered numbers | Scalable Badges | ORIGINAL_REQUEST.md § R4 |
| 33 | F4.4 Scalable Transform Selection Handles | Proportional scaling of selection handles and hit targets across image resolutions and zoom levels | Scalable Badges | ORIGINAL_REQUEST.md § R4 |
| 34 | F4.5 Badge Export Scaling Parity | Exact proportional badge and pin scaling applied in 2D canvas exporter matching live canvas appearance | Scalable Badges | ORIGINAL_REQUEST.md § R4 |

---

## Interface Contracts

### 1. Ingestion & Paste Replacement Contract
- **Actions**:
  - `REPLACE_IMAGE_AND_CLEAR`: payload `{ image: CanvasImage }` -> clears `annotations: []`, `selectedAnnotationId: null`, `overlays: []`, resets history.
  - `REPLACE_IMAGE_AND_KEEP`: payload `{ image: CanvasImage }` -> preserves `annotations: state.annotations`, `selectedAnnotationId: state.selectedAnnotationId`, resets history.
  - `ADD_IMAGE_OVERLAY`: payload `{ overlay: ImageOverlay }` -> appends to `state.overlays`.
- **Modal Component (`ReplaceImageModal.tsx`)**:
  - `onReplaceClear: () => void` (testid: `replace-modal-confirm-btn` / `replace-modal-replace-clear-btn`)
  - `onReplaceKeep: () => void` (testid: `replace-modal-replace-keep-btn`)
  - `onAddLayer: () => void` (testid: `replace-modal-add-layer-btn`)
  - `onCancel: () => void` (testid: `replace-modal-cancel-btn`)

### 2. Wheel Zoom & Coordinates Contract
- **Preset Scale**:
  `export const ZOOM_PRESETS = [0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00] as const;`
- **Function**:
  `export function quantizeWheelZoom(currentZoom: number, deltaY: number): number;`
  Monotonically moves index by +1 (deltaY < 0, zoom in) or -1 (deltaY > 0, zoom out) clamped to ladder bounds.
- **Focal Point Invariance**:
  `computeZoomTransform(viewport, focalPointScreen, quantizedZoom, MIN_ZOOM, MAX_ZOOM)` maintains screen cursor stability.

### 3. Toolbar & Styling Controls Contract
- **Stroke Width Options**:
  `export const STROKE_WIDTH_OPTIONS = [2, 4, 8] as const;` (buttons: `stroke-btn-2`, `stroke-btn-4`, `stroke-btn-8`).
- **Fill Opacity Options**:
  `export const FILL_OPACITY_OPTIONS = [{ value: 0, label: '0%' }, { value: 0.15, label: '15%' }, { value: 0.3, label: '30%' }, { value: 0.5, label: '50%' }] as const;`
- **Label**:
  `<span data-testid="fill-opacity-label" className="...">Fill</span>`

### 4. Arrow Geometry & Rendering Contract
- `calculateArrowhead(start: Point, end: Point, strokeWidth: number)`:
  - Returns `{ headLength, headWidth, left, right, notch, tip, shaftEnd }`.
  - `shaftEnd`: recessed by `strokeWidth * 0.5` from notch to prevent round linecap penetration.
- `ShapeRenderer.tsx` and `canvasExporter.ts`:
  - Renders underlay casing: `stroke="rgba(0,0,0,0.55)"`, `strokeWidth = strokeWidth + 3.5`.
  - Renders top shaft: `stroke = colorDef.stroke`, `strokeWidth = strokeWidth`.
  - Renders arrowhead polygon: `points = "${tip.x},${tip.y} ${left.x},${left.y} ${notch.x},${notch.y} ${right.x},${right.y}"`, `fill = colorDef.stroke`, with underlay casing or filter drop-shadow.
  - Tail badge anchor preserved at `(start.x, start.y)`.

### 5. Highlight Tool Contract
- `ToolType`: includes `'highlight'`.
- `HighlightGeometry`: `{ type: 'highlight', x: number, y: number, width: number, height: number, borderRadius?: number }`.
- `SvgOverlay.tsx`:
  - `<mask id="spotlight-mask">`: `<rect width="100%" height="100%" fill="white" />` + map over all highlight annotations + live draft: `<rect x={x} y={y} width={w} height={h} fill="black" rx={4} />`.
  - Backdrop: `<rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#spotlight-mask)" pointerEvents="none" />`.
- `canvasExporter.ts`:
  - Offscreen backdrop canvas filled with `rgba(0,0,0,0.45)`.
  - Highlight rects cleared with `ctx.globalCompositeOperation = 'destination-out'`.
  - Backdrop drawn over base image with `ctx.globalCompositeOperation = 'source-over'`.

### 6. Blur / Redact Tool Contract
- `ToolType`: includes `'blur'`.
- `BlurGeometry`: `{ type: 'blur', x: number, y: number, width: number, height: number, borderRadius?: number }`.
- `SvgOverlay.tsx`:
  - `<filter id="gaussian-blur">`: `<feGaussianBlur stdDeviation="10" edgeMode="duplicate" />`.
  - For each blur annotation: `<clipPath id="blur-clip-${id}">`: `<rect x={x} y={y} width={w} height={h} rx={2} />`.
  - `<image href={image.src} width={naturalWidth} height={naturalHeight} filter="url(#gaussian-blur)" clipPath="url(#blur-clip-${id})" />`.
- `canvasExporter.ts`:
  - Destructive baking:
    ```ts
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    if ('filter' in ctx) {
      ctx.filter = 'blur(12px)';
      ctx.drawImage(baseImg, 0, 0, width, height);
    } else {
      bakeBlurFallback(ctx, baseImg, x, y, width, height);
    }
    ctx.restore();
    ```

### 7. Resolution Scale Contract
- `src/math/badges.ts`:
  - `computeResolutionScale(width: number, height: number): number`:
    - Returns `clamp(Math.max(width, height) / 1440, 1.0, 4.0)`.
  - `getBadgeDimensions(index: number, scale: number = 1.0): BadgeDimensions`:
    - Defaults to `scale = 1.0` for 100% backward compatibility with all existing tests.
    - Scaled width, height, radius, and fontSize: `Math.round(base * scale)`.
- `src/math/geometry.ts`:
  - `getPinBoundingBox(geometry: PinGeometry, scale: number = 1.0)`: scaled dimensions.
- `TransformHandles.tsx`:
  - Selection handles scale with both zoom and resolution scale.

---

## Code Layout
- `src/types/index.ts`: ToolType, geometries (`HighlightGeometry`, `BlurGeometry`, `ImageOverlay`), Annotation, AppState.
- `src/math/geometry.ts`: Arrowhead math, notch clearance, pin bounding box.
- `src/math/badges.ts`: `computeResolutionScale`, `getBadgeDimensions`, badge anchor positioning.
- `src/math/coordinates.ts`: Coordinate and zoom math functions.
- `src/state/appReducer.ts`: Normalization, re-indexing, image replacement, overlay handling, highlight and blur support.
- `src/components/canvas/CanvasWorkspace.tsx`: Image container, viewport transforms, wheel event handling, overlay rendering.
- `src/components/canvas/SvgOverlay.tsx`: Spotlight mask, blur filters, draft rendering, shape and badge containers.
- `src/components/canvas/ShapeRenderer.tsx`: Arrow rendering (casing + head), highlight/blur borders, pin scaling.
- `src/components/canvas/BadgeRenderer.tsx`: Scaled badge rendering.
- `src/components/canvas/TransformHandles.tsx`: Endpoint handles, corner handles, scaled hit targets.
- `src/components/toolbar/MainToolbar.tsx`: Highlight and Blur tool buttons, icons, tooltips, responsive layout.
- `src/components/toolbar/ColorPalette.tsx`: Stroke and opacity controls.
- `src/components/toolbar/ZoomControls.tsx`: Zoom preset dropdown and increment controls.
- `src/components/modals/ReplaceImageModal.tsx`: Paste replacement dialog.
- `src/export/canvasExporter.ts`: 2D canvas composite rasterizer (overlays, destination-out highlight, destructive blur baking, scaled badges).
- `src/utils/sidebar.ts`: Sidebar tags and metadata for Highlight and Blur.
- `src/math/text.ts`: Text label measurement and bounding boxes.
- `src/spec/`: Spec schema, compiler, `toSpec`, and edit ops.
- `src/core/node/`: Node render backend and `renderSpec`.
- `src/bridge/`: `AgentSession` and the `AgentBridge` component (`window.anot8`).
- `cli/`: `anot8` CLI and MCP server.
