/**
 * Local stdio MCP server for Annot8. It runs only as a subprocess of the agent: no network listener.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { OpsSchema, SpecError, applyOps, getSpecJsonSchema, parseSpec, validateSpec } from '../src/spec';
import { downscalePng, inspectImage, renderSpec } from '../src/core/node/render';

/** Long side of the preview returned to the model; larger images are downscaled by vision models anyway. */
const PREVIEW_MAX_SIDE = 1568;

const GUIDE = `Annot8 specs describe one screenshot plus annotations, in the image's natural pixels.
Workflow: annot8_inspect_image → write a spec → annot8_render (look at the preview) → annot8_apply_ops to adjust → render again.
- Coordinates: pixels, or percentage strings ("25%") of image width (x, width) / height (y, height).
- Points (arrow from/to, pin at, text at): [x, y], "@id" or "@id.<center|top|bottom|left|right|top-left|top-right|bottom-left|bottom-right>", or { "anchor": "@id.right", "dx": 20, "dy": 0 }.
- Give annotations ids so arrows/pins/labels can anchor to them and ops can target them; anchors stay live when the target moves.
- box/ellipse/arrow/pin get numbered badges 1..N in list order (set "badge": false to hide); highlight, blur and text are unnumbered.
- Colors: red, amber, green, cyan, purple, or "#RRGGBB".
- frame: { crop: {x,y,width,height}, padding, background } is applied at render time.
- Relative image paths resolve against the spec file's directory (or baseDir).`;

const specInput = {
  spec: z.unknown().optional().describe('Annot8 spec object (see annot8_schema)'),
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

async function loadSpecArgs(args: SpecArgs): Promise<{ data: unknown; baseDir: string }> {
  if (args.spec !== undefined) {
    // Some clients send nested objects as JSON strings.
    const data = typeof args.spec === 'string' ? JSON.parse(args.spec) : args.spec;
    return { data, baseDir: path.resolve(args.baseDir ?? process.cwd()) };
  }
  if (args.specPath) {
    const file = path.resolve(args.baseDir ?? process.cwd(), args.specPath);
    return { data: JSON.parse(await readFile(file, 'utf8')), baseDir: args.baseDir ? path.resolve(args.baseDir) : path.dirname(file) };
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
  const server = new McpServer({ name: 'annot8', version: '1.0.0' }, { instructions: GUIDE });

  server.registerTool(
    'annot8_schema',
    {
      title: 'Annot8 spec schema',
      description: 'Returns a usage guide plus the JSON Schemas for Annot8 specs and edit ops. Call this first.',
      inputSchema: {},
    },
    tool(async () =>
      json({ guide: GUIDE, specSchema: getSpecJsonSchema(), opsSchema: z.toJSONSchema(OpsSchema) })
    )
  );

  server.registerTool(
    'annot8_inspect_image',
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
    'annot8_validate',
    {
      title: 'Validate spec',
      description: 'Checks a spec and returns path-addressed issues, e.g. { path: "annotations[2].to", message }.',
      inputSchema: specInput,
    },
    tool(async (args: SpecArgs) => {
      const { data, baseDir } = await loadSpecArgs(args);
      const spec = parseSpec(data);
      const dims = await inspectImage(spec.image.source, baseDir).catch(() => undefined);
      const issues = validateSpec(spec, dims);
      if (!dims && !spec.image.width) {
        issues.push({ path: 'image.source', message: `Could not load image "${spec.image.source}"` });
      }
      if (issues.length > 0) throw new SpecError(issues);
      return json({ valid: true, ...(dims ? { image: dims } : {}) });
    })
  );

  server.registerTool(
    'annot8_apply_ops',
    {
      title: 'Apply edit ops',
      description:
        'Applies ops (add, update, delete, reorder, clear, setFrame) to a spec and returns the new spec. ' +
        'With specPath and write=true the file is updated in place.',
      inputSchema: {
        ...specInput,
        ops: z.array(z.unknown()).describe('Edit ops; see opsSchema from annot8_schema'),
        write: z.boolean().optional().describe('Write the result back to specPath (or to "output")'),
        output: z.string().optional().describe('Write the result to this path instead of specPath'),
      },
    },
    tool(async (args: SpecArgs & { ops: unknown[]; write?: boolean; output?: string }) => {
      const { data, baseDir } = await loadSpecArgs(args);
      const spec = parseSpec(data);
      const dims = await inspectImage(spec.image.source, baseDir).catch(() => undefined);
      const { spec: next, addedIds } = applyOps(spec, args.ops, dims);
      const target = args.output ?? (args.write ? args.specPath : undefined);
      if (target) {
        await writeFile(path.resolve(args.baseDir ?? process.cwd(), target), `${JSON.stringify(next, null, 2)}\n`);
      }
      return json({ spec: next, addedIds, ...(target ? { written: target } : {}) });
    })
  );

  server.registerTool(
    'annot8_render',
    {
      title: 'Render spec',
      description:
        'Renders a spec to PNG, writes it to "output" if given, and returns a preview image so you can check the result.',
      inputSchema: {
        ...specInput,
        output: z.string().optional().describe('PNG path to write (relative to cwd)'),
        markdownOutput: z.string().optional().describe('Also write the annotation notes as markdown here'),
        scale: z.number().positive().optional().describe('Output scale factor (default 1)'),
        preview: z.boolean().optional().describe('Return the image content (default true)'),
      },
    },
    tool(
      async (
        args: SpecArgs & { output?: string; markdownOutput?: string; scale?: number; preview?: boolean }
      ): Promise<CallToolResult> => {
        const { data, baseDir } = await loadSpecArgs(args);
        const result = await renderSpec(data, { baseDir, scale: args.scale });
        if (args.output) await writeFile(path.resolve(args.output), result.png);
        if (args.markdownOutput) await writeFile(path.resolve(args.markdownOutput), result.markdown);
        const summary = {
          width: result.width,
          height: result.height,
          ...(args.output ? { output: path.resolve(args.output) } : {}),
          annotations: result.compiled.annotations.map((a) => ({ id: a.id, type: a.geometry.type, index: a.index })),
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
