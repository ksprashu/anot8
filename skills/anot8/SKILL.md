---
name: anot8
description: Parametric screenshot annotation, redaction, spotlighting, and markdown callout generation with Anot8 (MCP server or `npx @ksprashu/anot8` CLI). Use whenever the user wants to annotate a screenshot, add numbered callouts/boxes/arrows/pins/labels, redact sensitive text with blur, spotlight UI regions, generate markdown bug/review notes from a screenshot, or create/edit .anot8.json specs.
license: Apache-2.0
metadata:
  homepage: https://anot8.ksprashu.dev/
  repository: https://github.com/ksprashu/anot8
---

# Anot8 — Parametric Screenshot Annotation Skill

Anot8 turns screenshot annotation into a declarative, self-verifying loop. Instead of guessing pixel coordinates blindly once, you write a JSON spec (`.anot8.json`), render it, look at the rendered PNG and the returned pixel bounding boxes, and refine placement with edit ops where anchors (`@id.right`) stay live.

Everything runs locally on the user's machine. Nothing is uploaded.

---

## 1. Runtime: Pick the First That Works

This skill only contains instructions. The engine is the `@ksprashu/anot8` npm package (Node.js 20+, command name `anot8`), fetched on demand. The user does **not** need to clone the repo.

1. **MCP tools already connected** (`anot8_render`, `anot8_inspect_image`, … possibly prefixed, e.g. `mcp__anot8__anot8_render`): use them. `anot8_render` returns the PNG straight into your context.
2. **Otherwise use the CLI** through a shell. Resolve the command once and reuse it:
   - `anot8` if it is on `PATH` (`command -v anot8`)
   - inside an Anot8 source checkout (`cli/anot8.ts` exists): `npm run build:cli` once, then `node dist-cli/anot8.js`
   - anywhere else: `npx -y @ksprashu/anot8@latest`

   Below, `anot8 <cmd>` means whichever command you resolved. After `render`, open the output PNG with your image/file viewing tool to check it visually; the command also prints each annotation's `bounds` as JSON.
3. **No Node.js** (`node --version` fails or is below 20): ask the user to install Node 20+, or hand them the web app at https://anot8.ksprashu.dev/ with a spec they can drop onto the canvas.

### Optional: register the MCP server

If the user wants the MCP tools for future sessions, offer to register `npx -y @ksprashu/anot8 mcp` as a stdio server. Ask before editing their agent config.

| Harness | Command |
|---|---|
| Claude Code | `claude mcp add -s user anot8 -- npx -y @ksprashu/anot8 mcp` |
| Gemini CLI | `gemini mcp add -s user anot8 npx -y @ksprashu/anot8 mcp` |
| Codex CLI | `codex mcp add anot8 -- npx -y @ksprashu/anot8 mcp` |
| Any MCP client (JSON config) | `{ "mcpServers": { "anot8": { "command": "npx", "args": ["-y", "@ksprashu/anot8", "mcp"] } } }` |

The MCP server picks up new tools only after the harness restarts; keep using the CLI in the current session.

### Hand off to the web app

`anot8 share <spec.json>` (or `anot8_share_url`) prints a `https://anot8.ksprashu.dev/#spec=…` link that opens the spec in the browser editor. Local image paths are inlined, so keep screenshots small. Users can also drag a `.anot8.json` file onto the open app.

If you can drive a browser (e.g. a DevTools MCP), the open app exposes `window.anot8.{schema,loadSpec,apply,getSpec,render,markdown}` for live editing in front of the user.

---

## 2. The Closed-Loop Visual Workflow (Always Follow This)

1. **Inspect or Initialize**:
   - Call `anot8_inspect_image` (or `anot8_init_spec`) to get the screenshot's exact natural `width` and `height`. Never guess image resolution.
2. **Author the Spec with Semantic IDs & Anchors**:
   - Give every primary UI target a descriptive `id` (`"email-input"`, `"submit-btn"`, `"error-banner"`).
   - Attach arrows, pins, and text labels to those targets using `@id.<position>` anchors (`"@submit-btn.right"`, `{ "anchor": "@submit-btn.top", "dy": -12 }`) rather than hardcoding both endpoints.
3. **Render & Visually Verify**:
   - Call `anot8_render` with `preview: true` (the default).
   - Look at the returned preview image AND the returned `annotations[].bounds` (`{ x, y, width, height }` in natural pixels):
     - Does each `box` / `ellipse` tightly frame its target UI element without clipping text?
     - Do `blur` redactions completely cover sensitive strings with margin to spare?
     - Do `arrow` heads land cleanly on the target edge without crossing over labels?
     - Are `text` callouts legible and inside the frame (or padded margin)?
4. **Refine with `anot8_apply_ops`**:
   - Use `update`, `add`, `delete`, `reorder`, or `setFrame` ops. Because anchors stay live at the spec level, moving `"submit-btn"` automatically moves every arrow and label anchored to `@submit-btn`.
   - Re-render once to confirm the fix.

---

## 3. MCP Tools Reference

| Tool | Purpose | Key Arguments |
|---|---|---|
| `anot8_schema` | Returns the usage guide + JSON Schemas for specs and edit ops | *(none)* |
| `anot8_inspect_image` | Returns `{ source, width, height }` in natural pixels | `source`, `baseDir?` |
| `anot8_init_spec` | Creates a validated starter v1 spec with `width`/`height` filled in and portable relative `image.source` | `source`, `output?`, `baseDir?`, `frame?`, `defaults?`, `annotations?` |
| `anot8_validate` | Validates a spec and returns `{ valid: true, image, annotations }` or path-addressed errors | `spec` or `specPath`, `baseDir?` |
| `anot8_apply_ops` | Applies spec-level ops (`add`, `update`, `delete`, `reorder`, `clear`, `setFrame`) | `spec` or `specPath`, `ops`, `write?`, `output?`, `baseDir?` |
| `anot8_render` | Renders composite PNG + Markdown notes, returns `{ width, height, annotations, markdown }` **plus the PNG image preview** | `spec` or `specPath`, `output?`, `markdownOutput?`, `markdownFormat?`, `scale?`, `preview?` |
| `anot8_markdown` | Exports numbered callout notes as Markdown without rasterizing the PNG | `spec` or `specPath`, `format?` (`list` \| `table` \| `checklist` \| `report`), `output?` |
| `anot8_share_url` | Encodes a spec into a `#spec=<base64url>` link that opens directly in the Anot8 web app | `spec` or `specPath`, `appUrl?` |

**MCP Resources**:
- `anot8://guide` — concise spec & workflow reference
- `anot8://schema/spec` — DocumentSpec v1 JSON Schema
- `anot8://schema/ops` — SpecOp[] JSON Schema

**MCP Prompts**:
- `annotate-screenshot` (`image`, `goal?`, `output?`)
- `redact-screenshot` (`image`, `output?`)

---

## 4. Document Spec (`v1`) Quick Reference

```json
{
  "version": 1,
  "image": { "source": "screen.png", "width": 1600, "height": 1000 },
  "frame": {
    "crop": { "x": 100, "y": 50, "width": 1400, "height": 900 },
    "padding": 32,
    "background": "#0F172A"
  },
  "defaults": {
    "color": "amber",
    "strokeWidth": 3,
    "fillOpacity": 0.15
  },
  "annotations": [
    { "type": "highlight", "x": 200, "y": 120, "width": 600, "height": 400, "radius": 12 },
    { "id": "cta", "type": "box", "x": 240, "y": 380, "width": 180, "height": 48, "color": "green", "note": "Primary CTA button lacks focus ring" },
    { "id": "label", "type": "text", "at": { "anchor": "@cta.right", "dx": 120, "dy": -18 }, "text": "Add :focus-visible outline", "color": "green" },
    { "type": "arrow", "from": "@label.left", "to": "@cta.right", "color": "green", "badge": false },
    { "type": "pin", "at": "@cta.top-right", "color": "red", "note": "Contrast ratio is 2.8:1" },
    { "type": "blur", "x": 850, "y": 210, "width": 320, "height": 36 }
  ]
}
```

### Coordinates & Units
- **Pixels or Percentages**: `x`, `y`, `width`, `height`, and point tuples `[x, y]` accept pixel numbers (`240`) or percentage strings (`"25%"` of image width for horizontal axes, `"25%"` of image height for vertical axes).
- **Anchors (`PointSchema`)**: Used by `arrow.from`, `arrow.to`, `pin.at`, and `text.at`:
  - `[x, y]` — explicit coordinates, e.g. `[400, 250]` or `["50%", "25%"]`
  - `"@id"` — center of annotation `id`
  - `"@id.<position>"` — one of `center`, `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right`
  - `{ "anchor": "@id.right", "dx": 24, "dy": -10 }` — anchor with pixel offset
  - Forward references are supported (an arrow at index 0 can anchor to a box declared at index 3). Cycles and self-anchors are rejected with path-addressed errors.

### Annotation Types & Badge Numbering
| Type | Geometry Fields | Numbered (`1..N`)? | Notes |
|---|---|---|---|
| `box` | `x, y, width, height, radius?` | Yes (top-left corner) | Set `"badge": false` to hide badge while keeping sequence number |
| `ellipse` | `x, y, width, height` (bounding box) | Yes (225° top-left apex) | Converted to `cx, cy, rx, ry` at compile time |
| `arrow` | `from, to` | Yes (at `from` tail) | Use `"badge": false` when connecting a `text` label to a `box` |
| `pin` | `at` | Yes (inside teardrop head) | Tip touches `at`; head extends above `at` |
| `highlight` | `x, y, width, height, radius?` | No (`index: 0`) | Additive spotlight: dims outside regions with `rgba(0,0,0,0.68)`, punches out all highlight rects cleanly |
| `blur` | `x, y, width, height, radius?` | No (`index: 0`) | Destructive Gaussian blur baked into exported pixels for redaction |
| `text` | `at, text, fontSize?, align?` | No (`index: 0`) | High-contrast pill label; `at` is top edge (`left`/`center`/`right` aligned) |

### Colors
- **Presets**: `"red"` (`#EF4444`), `"amber"` (`#F59E0B`), `"green"` (`#10B981`), `"cyan"` (`#06B6D4`), `"purple"` (`#8B5CF6`).
- **Custom Hex**: Any `"#RGB"` or `"#RRGGBB"`. Badge/label text color (`#1E293B` vs `#FFFFFF`) is automatically selected for maximum WCAG contrast.

---

## 5. Edit Operations (`anot8_apply_ops` / `anot8 apply`)

```json
[
  { "op": "update", "id": "cta", "set": { "x": 232, "width": 196, "note": "Updated note" } },
  { "op": "add", "index": 0, "annotation": { "type": "highlight", "x": 180, "y": 100, "width": 640, "height": 420 } },
  { "op": "reorder", "id": "cta", "index": 1 },
  { "op": "delete", "id": "a4" },
  { "op": "setFrame", "frame": { "padding": 24, "background": "#0F172A" } },
  { "op": "clear" }
]
```
- Setting a field to `null` in `update.set` removes that optional property (e.g. `{ "note": null }`).
- Deleting an annotation that another annotation anchors to is rejected at validation time so you never leave broken pointers.

---

## 6. CLI Cheat Sheet

```bash
# Inspect image dimensions
anot8 inspect screenshot.png

# Initialize starter spec (writes screenshot.anot8.json)
anot8 init screenshot.png -o bug-report.anot8.json

# Render PNG + Markdown report (list, table, checklist, or report)
anot8 render bug-report.anot8.json -o annotated.png --md notes.md --format report

# Export only Markdown in GFM table or task checklist format
anot8 markdown bug-report.anot8.json --format checklist -o tasks.md

# Apply incremental edits in-place
anot8 apply bug-report.anot8.json --ops '[{"op":"update","id":"cta","set":{"color":"red"}}]' --in-place

# Generate a #spec=<base64url> link for opening in the browser app
anot8 share bug-report.anot8.json
```
