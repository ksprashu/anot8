# Contributing to Anot8

Thank you for your interest in contributing to Anot8! We welcome community contributions, bug reports, and enhancements to help make developer screenshot annotations and split-view note-taking faster, cleaner, and more productive.

---

> [!IMPORTANT]
> ### ⚠️ Project Scope & Support Disclaimer
> **Anot8 is an independent, personal open-source project created and maintained by Prashanth Subrahmanyam. It is not an official Google project or product, and is not supported, certified, or endorsed by Google LLC in any capacity.**
>
> This project is maintained strictly on a personal, best-effort basis during spare time. **There is no Service Level Agreement (SLA), guaranteed response time, or official technical support.**
>
> This software is provided strictly on an **"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND**, either express or implied, including, without limitation, any warranties or conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE. Use and contribute at your own risk.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Development Prerequisites & Setup](#development-prerequisites--setup)
3. [Architecture & Design Principles](#architecture--design-principles)
4. [Code Standards & Conventions](#code-standards--conventions)
5. [Testing & Quality Assurance](#testing--quality-assurance)
6. [Contribution Workflow](#contribution-workflow)
7. [Reporting Bugs & Feature Requests](#reporting-bugs--feature-requests)
8. [License Notice](#license-notice)

---

## Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for everyone, regardless of background or experience level. Please be respectful, constructive, and empathetic in all interactions across issues, pull requests, and discussions.

---

## Development Prerequisites & Setup

### Prerequisites

- **Node.js**: `v18.0.0` or higher (Node 20+ / 22+ recommended)
- **npm**: `v9.0.0` or higher
- **Git**: Modern git client

### Local Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ksprashu/anot8.git
   cd anot8
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start local development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser. Vite provides instant Hot Module Replacement (HMR).

4. **Verify tests and typecheck**:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```

---

## Architecture & Design Principles

Anot8 is designed as a zero-backend, 100% client-side web application structured around a **5-Layer Hybrid Model**:

1. **Interactive Viewport Layer**:
   - Native unscaled base image container with hardware-accelerated CSS transforms for pan and zoom.
   - Interactive SVG overlay rendering vector shapes (box, circle/ellipse, directional arrow, numbered callout pin) and dynamic numbered badges.
2. **State & Invariant Management**:
   - Annotations stored strictly in intrinsic natural image coordinates ($[0, W_{\text{native}}] \times [0, H_{\text{native}}]$), decoupled from viewport zoom/pan scale.
   - Dynamic Sequence Invariant ($1..N$): Sequential auto-numbering maintained by the pure reducer (`src/state/appReducer.ts`) across all shape creations, deletions, and sidebar reorderings.
   - 50-step immutable undo/redo history stack (`src/state/historyManager.ts`) with pointer-up transaction batching.
3. **Synchronized Split-View Notes**:
   - Bidirectional hover and selection synchronization between canvas vectors and sidebar cards.
   - Rich inline markdown note editor with syntax formatting and live preview.
4. **1:1 Native Resolution Export Engine**:
   - Dedicated Offscreen Canvas 2D rasterizer (`src/export/canvasExporter.ts`) rendering unscaled base bitmaps with crisp vector geometry and drop shadows.
   - Asynchronous Clipboard API (`src/export/clipboard.ts`) supporting `image/png` binary blobs and `text/plain` markdown notes with automatic download fallbacks.
5. **Modern UI & Theming Engine**:
   - Semantic dark and light theme tokens with automatic system preference detection and localStorage persistence.
   - Keyboard navigation and accessible shortcuts modal.

### Portable core and agent surfaces

The reducer (`src/state/appReducer.ts`), geometry math (`src/math/`), markdown serializer, Canvas2D exporter, spec compiler (`src/spec/`), and Node backend (`src/core/`) must not import React or touch `window`, `document`, or `Image`. ESLint enforces this so the same code renders headlessly in Node. The exporter receives canvases and images through an injectable `RenderBackend`.

The CLI and MCP server (`cli/`) and the browser bridge (`src/bridge/`) are thin layers over the spec. If you change annotation types or styles, update `src/spec/schema.ts`, `compileSpec`, and `toSpec` together, and regenerate the golden images. See [docs/agent-usage.md](docs/agent-usage.md).

---

## Code Standards & Conventions

### TypeScript Guidelines

- **Strict Type Checking**: TypeScript strict mode is enabled. Avoid `any` — use precise discriminated unions, interfaces, and generic types defined in `src/types/index.ts`.
- **Coordinate Integrity**: Always differentiate between Screen Space (DOM mouse coordinates) and Natural Image Space. Use transformation utilities from `src/math/coordinates.ts`.
- **Pure Reducers & Immutability**: All state mutations in `src/state/appReducer.ts` must remain pure functions returning new immutable state references.

### Styling & CSS

- **Tailwind CSS**: Use utility classes with semantic color tokens. Avoid raw arbitrary inline styles unless dynamic coordinates (e.g. SVG `transform`, `width`, `height`) are required.
- **Theme Variables**: Ensure all new UI components properly adapt to both `.dark` and `.light` theme contexts.
- **Responsive Layout**: Maintain clean layout integrity across desktop, tablet, and mobile split-view viewports.

### Linting & Formatting

- Run ESLint before committing:
  ```bash
  npm run lint
  ```
- Keep all code free of syntax errors and unresolved linting issues.

---

## Testing & Quality Assurance

Anot8 enforces strict testing standards. Every pull request must pass all test suites.

### Running Tests

```bash
# Run all tests once with Vitest
npm test

# Run tests in watch mode during development
npm run test:watch

# Run tests with code coverage
npm run test:coverage

# Run only the headless (Node) project: golden renders, CLI, MCP
npx vitest run --project node

# Regenerate golden images after an intentional rendering change, then review the PNG diffs
UPDATE_GOLDEN=1 npx vitest run --project node
```

### Test Organization

- **Unit Tests (`tests/unit/`)**: Coordinate math, geometry transforms, arrowheads, badge anchoring, reducer transitions, markdown serialization, and theme persistence.
- **Component Tests (`tests/component/`)**: UI components, toolbars, color pickers, sidebar synchronization, markdown editor, and modals.
- **Integration Tests (`tests/integration/`)**: Canvas export pipeline, offscreen rasterization, clipboard actions, and bidirectional hover states.
- **Spec & Bridge Tests (`tests/unit/spec.test.ts`, `tests/unit/agentBridge.test.tsx`)**: Spec validation, percentage and anchor resolution, edit ops, round trips, and the `window.anot8` session.
- **Headless Tests (`tests/node/`)**: Golden image renders of `tests/fixtures/specs/*` compared with `tests/fixtures/golden/*` (pixelmatch, small tolerance for font differences), plus the built CLI and the MCP server over stdio.
- **E2E & Stress Tests (`tests/e2e/`, `tests/stress/`)**: Multi-tier opaque-box scenarios, boundary conditions, rapid lifecycle oscillations, and large annotation datasets (100+ items).

---

## Contribution Workflow

We use a standard GitHub feature branch and Pull Request workflow:

1. **Fork the Repository**:
   Create your personal fork of `ksprashu/anot8`.

2. **Create a Topic Branch**:
   ```bash
   git checkout -b feature/my-new-feature
   # or
   git checkout -b fix/issue-description
   ```

3. **Follow Conventional Commits**:
   Structure your commits using clear, descriptive conventional commit prefixes:
   - `feat(canvas): add support for polygon annotations`
   - `fix(export): resolve alpha channel clipping in Safari`
   - `docs(readme): clarify shortcuts for Windows/Linux`
   - `test(math): add focal zoom boundary test cases`

4. **Run Pre-Commit Verification**:
   Before submitting your PR, ensure all checks pass locally:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   npm run build:cli
   ```

5. **Submit a Pull Request**:
   - Push your branch to your fork and open a Pull Request targeting the `main` branch.
   - Complete the [Pull Request Template](.github/pull_request_template.md).
   - Link any relevant issues being resolved.

---

## Reporting Bugs & Feature Requests

- **Bug Reports**: Please open an issue using the [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md). Provide reproduction steps, browser/OS version, and screenshots if applicable.
- **Feature Requests**: Open an issue using the [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md) describing the problem, proposed solution, and alternative considerations.

Please keep in mind that this is a personal open-source project; issues and PRs are reviewed on a best-effort basis as time permits.

---

## License Notice

By contributing to Anot8, you agree that your contributions will be licensed under the [Apache License, Version 2.0](LICENSE).
