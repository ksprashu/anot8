/**
 * Local stdio MCP server for Anot8. It runs only as a subprocess of the agent: no network listener.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { MarkdownExportFormat } from '../src/export/markdownSerializer';
import { encodeSpecHash } from '../src/bridge/agentSession';
import {
  AnnotationSpec,
  DocumentSpec,
  FrameSpec,
  OpsSchema,
  SpecError,
  applyOps,
  compileSpec,
  getSpecJsonSchema,
  parseSpec,
} from '../src/spec';
import {
  buildStarterSpec,
  downscalePng,
  inspectImage,
  inspectImageForSpec,
  prepareShareableSpec,
  renderSpec,
  renderSpecMarkdown,
  summarizeCompiledAnnotations,
} from '../src/core/node/render';

/** Long side of the preview returned to the model; larger images are downscaled by vision models anyway. */
const PREVIEW_MAX_SIDE = 1568;

export const GUIDE = `Anot8 specs describe one screenshot plus annotations, in the image's natural pixels.
Workflow: anot8_inspect_image (or anot8_init_spec) → write a spec → anot8_render (look at the preview & bounds) → anot8_apply_ops to adjust → render again.
- Coordinates: pixels, or percentage strings ("25%") of image width (x, width) / height (y, height).
- Points (arrow from/to, pin at, text at): [x, y], "@id" or "@id.<center|top|bottom|left|right|top-left|top-right|bottom-left|bottom-right>", or { "anchor": "@id.right", "dx": 20, "dy": 0 }.
- Give annotations ids so arrows/pins/labels can anchor to them and ops can target them; anchors stay live when the target moves.
- box/ellipse/arrow/pin get numbered badges 1..N in list order (set "badge": false to hide); highlight, blur and text are unnumbered.
- Colors: red, amber, green, cyan, purple, or "#RRGGBB".
- frame: { crop: {x,y,width,height}, padding, background } is applied at render time.
- Relative image paths resolve against the spec file's directory (or baseDir).`;

const MarkdownFormatEnum = z
  .enum(['list', 'table', 'checklist', 'report'])
  .optional()
  .describe('Markdown output format: numbered "list" (default), GFM "table", task "checklist", or full "report"');

const specInput = {
  spec: z.unknown().optional().describe('Anot8 spec object (see anot8_schema)'),
  specPath: z.string().optional().describe('Path to a spec JSON file; used when "spec" is omitted'),
  baseDir: z
    .string()
    .optional()
    .describe('Directory for resolving relative image paths (default: the spec file directory, else cwd)'),
};

interface SpecArgs {
  spec?: unknown;
  specPath?: string;
  baseDir?: string;
}

function parseJsonArg<T>(value: T, field: string): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new SpecError([{ path: field, message: `Not valid JSON: ${(err as Error).message}` }]);
  }
}

async function loadSpecArgs(args: SpecArgs): Promise<{ data: unknown; baseDir: string }> {
  if (args.spec !== undefined) {
    // Some clients send nested objects as JSON strings.
    const data = parseJsonArg(args.spec, 'spec');
    return { data, baseDir: path.resolve(args.baseDir ?? process.cwd()) };
  }
  if (args.specPath) {
    const file = path.resolve(args.baseDir ?? process.cwd(), args.specPath);
    const raw = await readFile(file, 'utf8');
    return {
      data: parseJsonArg(raw, 'specPath'),
      baseDir: args.baseDir ? path.resolve(args.baseDir) : path.dirname(file),
    };
  }
  throw new SpecError([{ path: '', message: 'Pass either "spec" or "specPath"' }]);
}

function json(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(err: unknown): CallToolResult {
  const body =
    err instanceof SpecError
      ? { error: 'invalid_spec', issues: err.issues }
      : { error: 'failed', message: err instanceof Error ? err.message : String(err) };
  return { ...json(body), isError: true };
}

function tool<A>(handler: (args: A) => Promise<CallToolResult>) {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (err) {
      return fail(err);
    }
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'anot8', version: '1.0.0' }, { instructions: GUIDE });

  server.registerResource(
    'anot8-guide',
    'anot8://guide',
    {
      title: 'Anot8 Agent Usage Guide',
      description: 'Quick-reference instructions for authoring, rendering, and editing Anot8 specs.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIDE }],
    })
  );

  server.registerResource(
    'anot8-spec-schema',
    'anot8://schema/spec',
    {
      title: 'Anot8 Document Spec JSON Schema (v1)',
      description: 'JSON Schema for .anot8.json declarative screenshot annotation documents.',
      mimeType: 'application/schema+json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/schema+json',
          text: JSON.stringify(getSpecJsonSchema(), null, 2),
        },
      ],
    })
  );

  server.registerResource(
    'anot8-ops-schema',
    'anot8://schema/ops',
    {
      title: 'Anot8 Edit Operations JSON Schema',
      description: 'JSON Schema for spec-level edit operations (add, update, delete, reorder, clear, setFrame).',
      mimeType: 'application/schema+json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/schema+json',
          text: JSON.stringify(z.toJSONSchema(OpsSchema), null, 2),
        },
      ],
    })
  );

  server.registerPrompt(
    'annotate-screenshot',
    {
      title: 'Annotate a screenshot',
      description: 'Inspect a screenshot, write an Anot8 spec with callouts and notes, render a preview, and refine.',
      argsSchema: {
        image: z.string().describe('Path or URL of the screenshot to annotate'),
        goal: z.string().optional().describe('What to call out, highlight, or document on the screenshot'),
        output: z.string().optional().describe('Output PNG file path'),
      },
    },
    async ({ image, goal, output }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Annotate the screenshot at "${image}"${goal ? ` for: ${goal}` : ''}.`,
              `1. Call anot8_inspect_image (or anot8_init_spec) on "${image}" to get its natural width and height.`,
              '2. Author an Anot8 v1 spec with explicit `id`s on key shapes and `@id.<position>` anchors for arrows/labels.',
              `3. Call anot8_render${output ? ` with output="${output}"` : ''} and inspect the returned preview image and annotation bounds.`,
              '4. If any box, arrow, or label is misaligned, call anot8_apply_ops to adjust and re-render until accurate.',
            ].join('\n'),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'redact-screenshot',
    {
      title: 'Redact sensitive regions on a screenshot',
      description: 'Locate sensitive text/credentials on a screenshot, bake destructive blur regions, and verify.',
      argsSchema: {
        image: z.string().describe('Path or URL of the screenshot to redact'),
        output: z.string().optional().describe('Output PNG file path'),
      },
    },
    async ({ image, output }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Redact sensitive regions on "${image}".`,
              `1. Call anot8_inspect_image on "${image}" to get natural dimensions.`,
              '2. Add `blur` annotations over all sensitive regions (tokens, emails, secrets, PII).',
              `3. Call anot8_render${output ? ` with output="${output}"` : ''} and visually verify in the preview that no characters remain legible.`,
              '4. Expand any blur box that clips characters via anot8_apply_ops and re-render.',
            ].join('\n'),
          },
        },
      ],
    })
  );

  server.registerTool(
    'anot8_schema',
    {
      title: 'Anot8 spec schema',
      description: 'Returns a usage guide plus the JSON Schemas for Anot8 specs and edit ops. Call this first.',
      inputSchema: {},
    },
    tool(async () =>
      json({ guide: GUIDE, specSchema: getSpecJsonSchema(), opsSchema: z.toJSONSchema(OpsSchema) })
    )
  );

  server.registerTool(
    'anot8_inspect_image',
    {
      title: 'Inspect image',
      description: 'Returns the natural width and height of an image (path, http(s) URL, or data URL).',
      inputSchema: {
        source: z.string().describe('Image path, URL, or data URL'),
        baseDir: z.string().optional().describe('Directory for resolving a relative path (default: cwd)'),
      },
    },
    tool(async ({ source, baseDir }: { source: string; baseDir?: string }) =>
      json({ source, ...(await inspectImage(source, path.resolve(baseDir ?? process.cwd()))) })
    )
  );

  server.registerTool(
    'anot8_init_spec',
    {
      title: 'Initialize Anot8 spec',
      description:
        'Inspects an image and creates a starter v1 Anot8 spec with natural width and height filled in. ' +
        'Optionally includes initial annotations/frame/defaults and writes the spec to disk.',
      inputSchema: {
        source: z.string().describe('Image path, URL, or data URL'),
        output: z.string().optional().describe('Optional path to write the .anot8.json spec file'),
        baseDir: z.string().optional().describe('Directory for resolving relative paths (default: cwd)'),
        frame: z.unknown().optional().describe('Optional frame { crop, padding, background }'),
        defaults: z.unknown().optional().describe('Optional default style { color, strokeWidth, fillOpacity, fontSize }'),
        annotations: z.array(z.unknown()).optional().describe('Optional initial annotations'),
      },
    },
    tool(
      async (args: {
        source: string;
        output?: string;
        baseDir?: string;
        frame?: unknown;
        defaults?: unknown;
        annotations?: unknown[];
      }) => {
        const baseDir = path.resolve(args.baseDir ?? process.cwd());
        const outPath = args.output ? path.resolve(baseDir, args.output) : undefined;
        const { spec, width, height } = await buildStarterSpec({
          image: args.source,
          baseDir,
          outPath,
          frame: args.frame ? (parseJsonArg(args.frame, 'frame') as FrameSpec) : undefined,
          defaults: args.defaults ? (parseJsonArg(args.defaults, 'defaults') as DocumentSpec['defaults']) : undefined,
          annotations: args.annotations
            ? (args.annotations.map((a, i) => parseJsonArg(a, `annotations[${i}]`)) as AnnotationSpec[])
            : undefined,
        });
        if (outPath) {
          await writeFile(outPath, `${JSON.stringify(spec, null, 2)}\n`);
        }
        return json({
          spec,
          width,
          height,
          ...(outPath ? { written: outPath } : {}),
        });
      }
    )
  );

  server.registerTool(
    'anot8_validate',
    {
      title: 'Validate spec',
      description: 'Checks a spec and returns path-addressed issues, e.g. { path: "annotations[2].to", message }.',
      inputSchema: specInput,
    },
    tool(async (args: SpecArgs) => {
      const { data, baseDir } = await loadSpecArgs(args);
      const spec = parseSpec(data);
      const dims = await inspectImageForSpec(spec, baseDir);
      const compiled = compileSpec(spec, dims);
      return json({
        valid: true,
        ...(dims ? { image: dims } : {}),
        annotations: summarizeCompiledAnnotations(compiled),
      });
    })
  );

  server.registerTool(
    'anot8_apply_ops',
    {
      title: 'Apply edit ops',
      description:
        'Applies ops (add, update, delete, reorder, clear, setFrame) to a spec and returns the new spec. ' +
        'With specPath and write=true the file is updated in place.',
      inputSchema: {
        ...specInput,
        ops: z.array(z.unknown()).describe('Edit ops; see opsSchema from anot8_schema'),
        write: z.boolean().optional().describe('Write the result back to specPath (or to "output")'),
        output: z.string().optional().describe('Write the result to this path instead of specPath'),
      },
    },
    tool(async (args: SpecArgs & { ops: unknown[]; write?: boolean; output?: string }) => {
      const { data, baseDir } = await loadSpecArgs(args);
      const spec = parseSpec(data);
      const dims = await inspectImageForSpec(spec, baseDir);
      const rawOps = args.ops.map((op, i) => parseJsonArg(op, `ops[${i}]`));
      const { spec: next, addedIds } = applyOps(spec, rawOps, dims);
      const target = args.output ?? (args.write ? args.specPath : undefined);
      if (args.write && !target) {
        throw new SpecError([{ path: 'write', message: 'write=true requires "specPath" or "output"' }]);
      }
      let resolvedTarget: string | undefined;
      if (target) {
        resolvedTarget = path.resolve(args.baseDir ?? process.cwd(), target);
        await writeFile(resolvedTarget, `${JSON.stringify(next, null, 2)}\n`);
      }
      return json({ spec: next, addedIds, ...(resolvedTarget ? { written: resolvedTarget } : {}) });
    })
  );

  server.registerTool(
    'anot8_markdown',
    {
      title: 'Export markdown notes',
      description:
        'Compiles a spec and serializes its numbered annotations into structured Markdown (list, table, checklist, or report).',
      inputSchema: {
        ...specInput,
        format: MarkdownFormatEnum,
        output: z.string().optional().describe('Optional path to write the Markdown file'),
      },
    },
    tool(async (args: SpecArgs & { format?: MarkdownExportFormat; output?: string }) => {
      const { data, baseDir } = await loadSpecArgs(args);
      const spec = parseSpec(data);
      const dims = await inspectImageForSpec(spec, baseDir);
      const compiled = compileSpec(spec, dims);
      const format = args.format ?? 'list';
      const markdown = renderSpecMarkdown(compiled, format);
      const outPath = args.output ? path.resolve(args.baseDir ?? process.cwd(), args.output) : undefined;
      if (outPath) {
        await writeFile(outPath, markdown);
      }
      return json({
        format,
        markdown,
        annotations: summarizeCompiledAnnotations(compiled),
        ...(outPath ? { output: outPath } : {}),
      });
    })
  );

  server.registerTool(
    'anot8_share_url',
    {
      title: 'Encode #spec share URL',
      description:
        'Validates a spec and encodes it as a "#spec=<base64url>" fragment or full web app URL for opening directly in the Anot8 browser editor.',
      inputSchema: {
        ...specInput,
        appUrl: z
          .string()
          .optional()
          .describe('Base URL of the Anot8 web app (default: "https://anot8.ksprashu.dev/")'),
      },
    },
    tool(async (args: SpecArgs & { appUrl?: string }) => {
      const { data, baseDir } = await loadSpecArgs(args);
      const shareable = await prepareShareableSpec(data, baseDir);
      const hash = encodeSpecHash(shareable);
      const base = (args.appUrl ?? 'https://anot8.ksprashu.dev/').replace(/#.*$/, '');
      const url = `${base}${hash}`;
      return json({ hash, url });
    })
  );

  server.registerTool(
    'anot8_render',
    {
      title: 'Render spec',
      description:
        'Renders a spec to PNG, writes it to "output" if given, and returns a preview image plus annotation bounds so you can check the result.',
      inputSchema: {
        ...specInput,
        output: z.string().optional().describe('PNG path to write (relative to baseDir or cwd)'),
        markdownOutput: z.string().optional().describe('Also write the annotation notes as markdown here'),
        markdownFormat: MarkdownFormatEnum,
        scale: z.number().positive().max(8).optional().describe('Output scale factor (default 1, max 8)'),
        preview: z.boolean().optional().describe('Return the image content (default true)'),
      },
    },
    tool(
      async (
        args: SpecArgs & {
          output?: string;
          markdownOutput?: string;
          markdownFormat?: MarkdownExportFormat;
          scale?: number;
          preview?: boolean;
        }
      ): Promise<CallToolResult> => {
        const { data, baseDir } = await loadSpecArgs(args);
        const outBase = path.resolve(args.baseDir ?? process.cwd());
        const outPng = args.output ? path.resolve(outBase, args.output) : undefined;
        const outMd = args.markdownOutput ? path.resolve(outBase, args.markdownOutput) : undefined;
        const result = await renderSpec(data, {
          baseDir,
          scale: args.scale,
          markdownFormat: args.markdownFormat,
        });
        if (outPng) await writeFile(outPng, result.png);
        if (outMd) await writeFile(outMd, result.markdown);
        const summary = {
          width: result.width,
          height: result.height,
          ...(outPng ? { output: outPng } : {}),
          annotations: result.annotationSummaries,
          markdown: result.markdown,
        };
        const content: CallToolResult['content'] = [{ type: 'text', text: JSON.stringify(summary, null, 2) }];
        if (args.preview !== false) {
          const preview = await downscalePng(result.png, PREVIEW_MAX_SIDE, result);
          content.push({ type: 'image', data: preview.png.toString('base64'), mimeType: 'image/png' });
        }
        return { content };
      }
    )
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}
