# Agent usage

Anot8 can be driven by AI agents and scripts as a **parametric** screenshot editor: annotations are described as data (an Anot8 *spec*), rendered headlessly, inspected, and adjusted. Everything runs locally. There are four surfaces:

| Surface | Use it when | How |
|---|---|---|
| **Agent Skill** (`anot8`) | Any skill-aware agent (Claude Code, Gemini CLI, Codex, Cursor, …) | `npx skills add ksprashu/anot8` |
| **MCP server** (stdio) | Agents that speak MCP | `npx -y @ksprashu/anot8 mcp` as a local subprocess. No network listener. |
| **CLI** (`anot8`) | Scripts, CI, any agent with a shell | `npx -y @ksprashu/anot8 <cmd>` or `npm install -g @ksprashu/anot8` |
| **Browser bridge** (`window.anot8`) | Agents that drive Chrome, or handing a result to a person to tweak | Open the app; call `window.anot8.*` |

All surfaces share the same spec, compiler, and renderer (Canvas2D in the browser, `@napi-rs/canvas` in Node), so a spec renders the same everywhere.

![Rendered sample spec](images/agent-sample.png)

## The spec

`docs/examples/sample.anot8.json` produced the image above:

```json
{
  "version": 1,
  "image": { "source": "../../tests/fixtures/screen.png" },
  "frame": { "padding": 24, "background": "#0F172A" },
  "defaults": { "color": "#F43F5E" },
  "annotations": [
    { "type": "highlight", "x": 236, "y": 104, "width": 508, "height": 330, "radius": 12 },
    { "id": "email", "type": "box", "x": 246, "y": 172, "width": 488, "height": 48, "note": "Email field has no label" },
    { "id": "submit", "type": "box", "x": 246, "y": 326, "width": 148, "height": 52, "color": "green", "note": "Primary action" },
    { "id": "hint", "type": "text", "at": { "anchor": "@submit.right", "dx": 140, "dy": -22 }, "text": "Make this full width", "color": "green" },
    { "type": "arrow", "from": "@hint.left", "to": "@submit.right", "color": "green", "badge": false },
    { "type": "blur", "x": 550, "y": 392, "width": 190, "height": 32 }
  ]
}
```

- **Coordinates** are pixels in the original image, or percentage strings: `"25%"` of the width for `x`/`width` and of the height for `y`/`height`.
- **Annotation types**:
  - `box`, `ellipse`, `highlight` (spotlight), and `blur` (redaction) take `x, y, width, height`.
  - `arrow` takes `from, to`.
  - `pin` takes `at`.
  - `text` takes `at, text, fontSize?, align?`.
- **Points** (`from`, `to`, `at`) can be `[x, y]`, an anchor such as `"@submit"` or `"@submit.right"`, or `{ "anchor": "@submit.right", "dx": 20, "dy": -10 }`. The anchor positions are `center`, `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, and `bottom-right`. Anchors can point forward to an annotation declared later. They are resolved at compile time, so if `submit` moves, everything anchored to it moves too.
- **Numbering**: `box`, `ellipse`, `arrow`, and `pin` get badges 1..N in list order. Set `"badge": false` to hide one; it still keeps its number. `highlight`, `blur`, and `text` are unnumbered.
- **Colors**: `red`, `amber`, `green`, `cyan`, `purple`, or any hex such as `"#F43F5E"`. Badge text color is chosen automatically for contrast.
- **Frame**: `crop` (`x, y, width, height`) is applied first, then `padding` with a `background` color.
- **Image source** can be a path (relative to the spec file), an http(s) URL, or a data URL. The browser bridge cannot read local paths.

The full JSON Schema comes from `anot8 schema` (or `anot8 schema ops` for edit operations). Validation errors are path-addressed, so an agent can fix its own input:

```json
{ "error": "invalid_spec", "issues": [{ "path": "annotations[3].at", "message": "Unknown anchor target \"@sumbit\"" }] }
```

## Edit ops

Ops edit the spec, not the pixels, so anchors stay live:

```json
[
  { "op": "update", "id": "submit", "set": { "x": 300, "color": "#22C55E" } },
  { "op": "add", "annotation": { "type": "pin", "at": "@email.top-right", "note": "Needs a label" } },
  { "op": "reorder", "id": "submit", "index": 0 },
  { "op": "delete", "id": "a3" },
  { "op": "setFrame", "frame": { "crop": { "x": 200, "y": 70, "width": 580, "height": 400 } } },
  { "op": "clear" }
]
```

In `update.set`, `null` removes a field. Annotations without an `id` get stable ids (`a1`, `a2`, …) the first time ops are applied, and new ids are returned as `addedIds`.

## CLI

```bash
npm install -g @ksprashu/anot8                  # or run any command as `npx -y @ksprashu/anot8 <cmd>`

anot8 inspect shot.png                # {"width":2880,"height":1800}: placing coordinates needs this
anot8 init shot.png                   # writes shot.anot8.json with the image dimensions
anot8 render shot.anot8.json -o out.png --md notes.md [--format list|table|checklist|report] [--scale 2]
anot8 markdown shot.anot8.json --format checklist -o tasks.md
anot8 validate shot.anot8.json        # exit 1 with path-addressed issues on stderr
anot8 apply shot.anot8.json --ops '[{"op":"update","id":"submit","set":{"x":300}}]' --in-place
anot8 share shot.anot8.json           # prints #spec=<base64url> link for opening in the browser app
anot8 schema [spec|ops]
```

Output is JSON on stdout. Errors are JSON on stderr, with exit code 1 for an invalid spec or failure and 2 for a usage error. Pass `-` instead of a file name to read the spec from stdin.

## MCP server

Register the published package as a stdio server:

```bash
claude mcp add -s user anot8 -- npx -y @ksprashu/anot8 mcp     # Claude Code
gemini mcp add -s user anot8 npx -y @ksprashu/anot8 mcp         # Gemini CLI
codex mcp add anot8 -- npx -y @ksprashu/anot8 mcp               # Codex CLI
```

```json
{ "mcpServers": { "anot8": { "command": "npx", "args": ["-y", "@ksprashu/anot8", "mcp"] } } }
```

Inside this repo, `.mcp.json` points at the local build (`node dist-cli/anot8.js mcp`) instead, so run `npm run build:cli` after changing `cli/` or `src/`.

### Tools

- `anot8_schema`: usage guide plus the spec and ops JSON Schemas. Call this first.
- `anot8_inspect_image`: natural image dimensions (`width`, `height`).
- `anot8_init_spec`: inspects an image, creates a starter v1 spec with `width` and `height` populated, and optionally writes it to `output`.
- `anot8_validate`: checks a spec and returns path-addressed issues or compiled annotation summaries with pixel `bounds`.
- `anot8_apply_ops`: applies spec-level ops (`add`, `update`, `delete`, `reorder`, `clear`, `setFrame`) and returns the new spec. Pass `write: true` to update `specPath` in place.
- `anot8_render`: writes the PNG to `output`, optionally writes markdown notes (`markdownOutput`, `markdownFormat`), and **returns the rendered image** (downscaled to 1568px on the long side) plus each annotation's pixel `bounds` so the agent can check its own edit and adjust in the same loop.
- `anot8_markdown`: compiles a spec and serializes its numbered notes in `list`, `table`, `checklist`, or `report` format without rasterizing the PNG.
- `anot8_share_url`: encodes a spec as a `#spec=<base64url>` link that opens directly in the Anot8 browser editor.

Each spec tool takes either an inline `spec` object or a `specPath`.

### Resources & Prompts

- **Resources**: `anot8://guide` (usage instructions), `anot8://schema/spec` (DocumentSpec v1 JSON Schema), `anot8://schema/ops` (SpecOp[] JSON Schema).
- **Prompts**: `annotate-screenshot` (`image`, `goal?`, `output?`) and `redact-screenshot` (`image`, `output?`).

## Agent Skill (`skills/anot8/SKILL.md`)

`skills/anot8/SKILL.md` follows the [`npx skills`](https://github.com/vercel-labs/skills) layout, so one definition installs into every supported harness:

```bash
npx skills add ksprashu/anot8                    # interactive: choose agents and scope
npx skills add ksprashu/anot8 -g -a claude-code -a gemini-cli -a codex -y
```

The installer copies only the skill folder. The skill itself has no code: it uses connected MCP tools if present, otherwise `anot8` on `PATH`, a local build when run inside this repo, or `npx -y @ksprashu/anot8@latest`. That way the same skill works after a plain install, in CI, and while developing Anot8.

Within this repo, `.claude/skills/` and `.agents/skills/` are symlinks to `skills/`, so Claude Code and `.agents`-aware harnesses pick up the skills without installing them. `skills/cloudflare-domain` is marked `metadata.internal: true` and is not offered by `npx skills add`.

It packages the closed-loop workflow (`inspect` → `author spec with @id anchors` → `render & inspect preview + bounds` → `apply_ops` → `render`), coordinate and anchor recipes, badge numbering rules, and CLI/MCP reference.

## Browser bridge

With the app open (`npm run dev`, or the installed PWA), `window.anot8` exposes:

| Method | Description |
|---|---|
| `schema()` | `{ spec, ops }` JSON Schemas |
| `loadSpec(spec)` | Loads a spec (http(s) or data URL image). If the image is already on the canvas, only annotations change. |
| `apply(ops)` | Applies edit ops. Returns `{ addedIds, spec }`. |
| `getSpec({ embedImage? })` | The current document. Pasted images (`blob:`) are embedded as data URLs. |
| `render()` | Composite PNG as a data URL, exactly what Export produces |
| `markdown()` | The notes as markdown |

Agent edits go through the normal undo history, so a person can press ⌘Z to revert them. Anchors stay live until someone edits the canvas by hand or presses undo. After that, the spec is derived from what is on screen, in pixels. Frame changes are not part of undo history.

People can also:

- drop or paste a `.anot8.json` file (or spec JSON text) onto the app
- open a link like `https://anot8.ksprashu.dev/#spec=<base64url JSON>`; the hash never leaves the browser
- use **Save spec** (the file-with-braces icon at the end of the export toolbar) to download the current document as `.anot8.json`

## Security & Resource Guardrails

- **Local execution**: The MCP server runs strictly over `stdio` as a child process with no network listener.
- **SSRF protection**: In Node, `http(s)` image fetches reject loopback, link-local, private RFC1918/ULA IPs, and cloud metadata hosts (including across redirects), with a 15s timeout and 50 MB size ceiling. Set `ANOT8_ALLOW_PRIVATE_URLS=1` only when intentionally fetching from a local test server.
- **Canvas & spec bounds**: Coordinates, annotation counts (`<= 1000`), and output canvas dimensions (`<= 16384px` per side, `<= 64 MP`) are bounded to prevent memory exhaustion.

## Notes and limits

- Text uses system sans-serif fonts. Label widths may differ by a few pixels between machines, and the golden image tests allow for this.
- Badge size scales with the source image size, not the cropped output.
- There are no interactive tools for text or crop yet. Both are spec-only, and text labels can be moved but not resized in the editor.
