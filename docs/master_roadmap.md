# Anot8 — Master Architecture & Milestone Roadmap

This roadmap tracks the completed architecture tracks and feature milestones for **Anot8**: a client-side screenshot annotation and split-view Markdown note-taking application with a headless CLI, stdio MCP server, agent skill, and browser bridge.

---

## 1. System Health & Architecture Tracks

- **Core Web Application & PWA**: 100% client-side React + TypeScript + Tailwind CSS canvas and SVG overlay engine, installable offline PWA via Workbox, hosted on GitHub Pages (`anot8.ksprashu.dev`).
- **Portable Rendering Core**: DOM-free state reducer, geometry/badge/text math, Markdown serializer, and injectable `RenderBackend` Canvas2D compositor shared between browser and Node (`@napi-rs/canvas`).
- **Agent Surfaces (CLI, MCP, Skill, Browser Bridge)**:
  - Declarative `.anot8.json` v1 spec with pixel/percentage coordinates and live `@id.<position>` anchors.
  - Local `anot8` CLI (`inspect`, `init`, `render`, `markdown`, `validate`, `apply`, `share`, `schema`, `mcp`).
  - Local stdio MCP server (`anot8_schema`, `anot8_inspect_image`, `anot8_init_spec`, `anot8_validate`, `anot8_apply_ops`, `anot8_render`, `anot8_markdown`, `anot8_share_url`, 3 resources, 2 prompts).
  - Agent skill (`.claude/skills/anot8/SKILL.md`) and `window.anot8` browser bridge.

---

## 2. Completed Milestones Ledger

| Milestone | Scope | Status | Key Artifacts |
| :--- | :--- | :--- | :--- |
| **M1–M4: Core Platform** | Clipboard ingestion, vector shapes, 1..N badge invariant, split-view Markdown notes, 1:1 PNG export | Completed | `src/state/`, `src/components/`, `src/export/` |
| **R1–R5: Paste, Zoom & Toolbar** | Replace/Keep/Layer paste modal, quantized 10-step wheel zoom, responsive toolbar, stroke/fill presets | Completed | `src/math/coordinates.ts`, `src/components/toolbar/` |
| **F1–F4: Spotlight, Redact & DPI** | Aerodynamic 30° arrows with casing, additive spotlight mask, destructive Gaussian blur, 4K scalable badges | Completed | `src/math/geometry.ts`, `src/export/canvasExporter.ts` |
| **PWA & Static Hosting** | Offline-capable Workbox service worker, update toast, web manifest, GitHub Pages CI/CD | Completed | `vite.config.ts`, `.github/workflows/deploy-pages.yml` |
| **Parametric Spec, CLI, MCP & Skill** | `.anot8.json` v1 compiler/ops, `@napi-rs/canvas` backend, stdio MCP server, `.claude/skills/anot8/SKILL.md`, `window.anot8` | Completed | `src/spec/`, `src/core/node/`, `cli/`, `src/bridge/`, `docs/agent-usage.md` |
