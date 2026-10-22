# Original User Request

## Initial Request — 2026-08-31T14:45:09Z

Anot8 is a screenshot annotation and note-taking web application designed for developer coding harnesses. It allows users to instantly paste clipboard images, add numbered visual annotations (bounding boxes, circles, arrows, callout pins), write structured notes for each annotation in a synchronized sidebar, and copy both the composite annotated image (PNG) and markdown notes to the system clipboard via single-click actions and keyboard shortcuts.

Working directory: .
Integrity mode: demo

## Requirements

### R1. Clipboard-First Canvas & Image Ingestion
- Allow immediate image pasting (`Cmd+V` / `Ctrl+V`) from system clipboard directly into the workspace canvas, alongside file drag-and-drop or file picker upload.
- Automatically fit pasted images to viewport while maintaining full original resolution and aspect ratio, with zoom (scroll wheel / pinch) and pan (space + drag / middle click) controls.
- Support canvas reset, clear annotations, and replacing the base image.

### R2. Visual Annotation Toolkit & Auto-Numbering
- Provide vector-based annotation tools:
  - Bounding boxes (rectangles with customizable fill opacity and stroke color/width)
  - Ellipses / circles
  - Directional arrows and pointers
  - Numbered callout pins (auto-incrementing badges: 1, 2, 3...)
- Every drawn annotation automatically receives a sequential index badge placed on the element.
- Allow selecting, moving, resizing, styling (high-contrast preset colors like Red, Amber/Amber Gold, Green, Cyan, Purple), and deleting annotations.
- Full Undo (`Cmd+Z` / `Ctrl+Z`) and Redo (`Cmd+Shift+Z` / `Ctrl+Y`) history stack.

### R3. Synchronized Split-View Annotation Notes Panel
- Collapsible sidebar panel displaying the ordered list of active annotations matching their canvas sequence numbers.
- Each list item provides:
  - Sequence badge matching canvas color and number
  - Annotation type tag (Box, Arrow, Circle, Pin)
  - Rich inline text/markdown input to describe the issue, question, or requested change
  - Delete and reorder controls that dynamically re-index all annotations and canvas badges
  - Canvas hover highlight (hovering an item in the sidebar highlights the corresponding annotation on the canvas, and vice versa).

### R4. High-Fidelity Clipboard Export & Keyboard Shortcuts
- "Copy Image" button and `Cmd+C` / `Ctrl+C` keyboard shortcut that renders the full composite canvas (base image + drawn shapes + numbered callout badges) to system clipboard as a standard `image/png` blob ready for direct paste into coding harnesses, chat tools, and markdown editors.
- "Copy Notes" button that copies the formatted markdown list of numbered annotations and their descriptions to the clipboard as `text/plain`.
- Single-click combined copy action or download actions (export PNG, export Markdown).

### R5. Responsive Modern UI & Theme
- Fast, clean, dark/light theme UI with intuitive toolbar shortcuts, tooltips displaying keybindings, and zero lag on high-DPI screenshots.

## Acceptance Criteria

### Ingestion & Canvas Performance
- [ ] Pasting an image via `Cmd+V` renders immediately on canvas at native resolution without blurring or distortion.
- [ ] Zoom and pan work smoothly across large retina/4K screenshots.

### Annotation & Synchronization
- [ ] Users can draw rectangles, circles, arrows, and callout pins onto the image with active drag previews.
- [ ] Numbered badges auto-increment (1, 2, 3...) and immediately reflect in the sidebar list.
- [ ] Modifying an annotation's color or position updates immediately on the canvas.
- [ ] Deleting or re-ordering an annotation re-indexes remaining badges sequentially on both canvas and sidebar.
- [ ] Undo and redo actions correctly restore both canvas shapes and sidebar notes state.

### Clipboard & Export Verification
- [ ] Triggering "Copy Image" (button or `Cmd+C`) writes a valid `image/png` to navigator clipboard containing base image and all visual annotations.
- [ ] Triggering "Copy Notes" writes structured markdown to clipboard formatted as numbered items with descriptions.
- [ ] Exported PNG maintains crisp 1:1 pixel rendering matching original screenshot dimensions.

### Automated Tests & Quality
- [ ] Automated unit and component test suite covering canvas annotation state management, numbering sequence calculations, undo/redo reducer, and export payload generation.
- [ ] Production build succeeds with zero TypeScript errors and zero linter warnings.

## Follow-up 1: Image Paste Modes, Wheel Zoom, Responsive Toolbar & Style Presets — 2026-09-13T16:32:40Z

Resolve image paste ghost annotations and support replacement/layering options, quantize mouse wheel zoom to standard preset steps, ensure responsive toolbar visibility on compact viewports, and update stroke width and fill opacity controls in Anot8.

Integrity mode: development

### Requirements (Follow-up 1)

#### R1. Fix Ghost Annotations on Image Paste & Provide Explicit Paste Options
- When a new image is pasted or loaded over an existing annotated canvas, previous annotations must be completely and reliably purged if the user chooses to discard them (eliminating ghost annotations).
- Provide a replacement modal offering three distinct actions when pasting over an active session:
  1. "Replace & Clear Annotations": replaces the base image and completely resets all existing annotations and notes.
  2. "Replace & Keep Annotations": replaces the underlying image while preserving current annotation shapes and notes in place.
  3. "Add as Layer / Overlay": places the newly pasted image as an overlay/layer on top of the current canvas without replacing the base image or wiping annotations.
- Ensure that replacing or pasting an image does not unintentionally modify the fill opacity or visual styles of retained annotations.

#### R2. Calibrate Mouse Scroll Wheel Zoom Increments
- Prevent erratic and extreme zoom jumps (such as 13% leaping to 200%) when zooming via mouse scroll wheel or trackpad.
- Quantize wheel zoom steps to follow the established zoom preset scale (10%, 25%, 33%, 50%, 67%, 75%, 100%, 125%, 150%, 200%) matching the UI selector, smoothly scaling centered around the mouse cursor coordinates.

#### R3. Responsive Annotation Toolbar Layout
- Prevent the annotation drawing toolbar, color palette, and action tools from getting clipped or hidden on smaller viewports or narrow windows.
- The toolbar and its controls must remain visible and accessible at all times, wrapping into a multi-row or responsive layout without hiding essential drawing tools behind hidden overflow menus.

#### R4. Distinct Stroke Width Presets
- Update stroke width options from 2px / 4px / 6px to 2px / 4px / 8px so each preset provides clear, visually distinct line weights.

#### R5. Explicit Fill Opacity Controls
- Clarify the 0%, 15%, 30%, 50% controls with explicit labeling (e.g., "Fill" label or visual indicator) so their function as shape background fill opacity is immediately obvious.
- Ensure clicking opacity presets immediately updates any currently selected shape's fill opacity and applies to subsequent shape creations, with clear visual active-state indicators.

### Acceptance Criteria (Follow-up 1)
- [ ] Selecting "Replace & Clear Annotations" purges all previous annotations from both application state and rendered SVG elements with 0 residual ghost annotations.
- [ ] Selecting "Replace & Keep Annotations" swaps the base image while retaining existing annotations, indices, and sidebar notes.
- [ ] Selecting "Add as Layer / Overlay" adds the pasted image onto the canvas without clearing the base image or existing annotations.
- [ ] Confirming replacement does not alter existing annotation style properties.
- [ ] Mouse wheel zooming transitions monotonically through the discrete zoom preset ladder.
- [ ] Focal point centering around cursor coordinates is preserved during wheel zoom transitions.
- [ ] All drawing tools and styling controls remain rendered and interactive at compact viewport widths down to 640px.
- [ ] Stroke width presets offer 2px, 4px, and 8px options.
- [ ] Opacity options feature descriptive labeling ("Fill") and immediately reflect active fill opacity.

---

## Follow-up 2: Annotely-Inspired Tools & High-DPI Scalable Badges — 2026-09-13T16:31:09Z

Enhance the Anot8 screenshot annotation web application with professional annotation tools inspired by Annotely: a smooth Gaussian privacy blur/redact tool, an additive multi-region highlight/spotlight focus mode, a polished thicker arrow shape, and resolution-aware scalable badge numbering.

Integrity mode: development

### Requirements (Follow-up 2)

#### R1. Polished Thicker Arrow Tool
- Upgrade arrow annotations with a thicker, bolder shaft and a sharp, well-proportioned arrowhead geometry matching Annotely's visual quality.
- Render with high-contrast outlines/subtle shadows so arrows remain distinct and visible across both dark and light image content.
- Preserve tail-anchored badge positioning and interactive endpoint transform handles.

#### R2. Additive Highlight / Spotlight Tool
- Provide a Highlight tool that keeps target regions clearly illuminated while dimming/graying out the unselected remainder of the image.
- Support additive multi-region highlighting: when multiple highlight regions are drawn, all of them remain highlighted simultaneously without overlapping dimming artifacts.
- Ensure the highlight focus effect renders consistently in both the interactive canvas workspace and the exported 2D canvas (PNG download and clipboard copy).

#### R3. Smooth Blur / Redact Tool
- Provide a Blur / Redact tool to obscure sensitive information (credentials, personal details, numbers) on the screenshot.
- Apply a smooth Gaussian blur to the bounded region on the interactive canvas.
- Ensure the blurred region is baked into exported images so underlying sensitive text/pixels cannot be recovered.

#### R4. Resolution-Aware Scalable Badge and Pin Numbering
- Automatically scale annotation badge numbers, pins, and selection handles relative to the base image's natural resolution (e.g. 2K/4K/Retina screenshots) so badges never appear minuscule on large images.
- Maintain readable minimum dimensions and balanced proportions across all zoom levels and display scales.

### Acceptance Criteria (Follow-up 2)
- [ ] Arrow tool renders with a thick shaft and polished arrowhead geometry in both the live SVG canvas and canvas export, with contrast outline for readability.
- [ ] Highlight tool allows drawing multiple rectangular focus regions where all highlighted areas remain undimmed and the rest of the image is dimmed with a uniform semi-transparent backdrop.
- [ ] Blur tool obscures image pixels within defined regions using smooth Gaussian blur, both on the interactive canvas and in exported PNG/clipboard images.
- [ ] High-resolution images scale badge numbering and pin markers proportionally so badge text is easily readable at 100% zoom.
- [ ] Regression & Integrity: All automated unit, component, and stress tests pass. Canvas export and clipboard copy accurately replicate arrows, highlight cutouts, blurs, and scaled badges without visual drift or clipping.
