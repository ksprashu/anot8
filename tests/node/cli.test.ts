/**
 * End-to-end tests for the built CLI (dist-cli/annot8.js) and its stdio MCP server.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'dist-cli/annot8.js');
const FIXTURES = path.join(ROOT, 'tests/fixtures');
const SHAPES = path.join(FIXTURES, 'specs/shapes.annot8.json');
const PNG_SIGNATURE = '89504e470d0a1a0a';

function run(args: string[], input?: string) {
  const result = spawnSync('node', [CLI, ...args], { cwd: ROOT, input, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

let tmp: string;

beforeAll(() => {
  execFileSync('npx', ['tsup', '--silent'], { cwd: ROOT, stdio: 'ignore' });
  tmp = mkdtempSync(path.join(tmpdir(), 'annot8-cli-'));
}, 60_000);

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('annot8 CLI', () => {
  it('inspect prints image dimensions', () => {
    const { code, stdout } = run(['inspect', path.join(FIXTURES, 'screen.png')]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ width: 800, height: 500 });
  });

  it('init writes a starter spec with a relative image path', () => {
    const out = path.join(FIXTURES, 'specs', '_init.tmp.json');
    try {
      expect(run(['init', path.join(FIXTURES, 'screen.png'), '-o', out]).code).toBe(0);
      expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({
        version: 1,
        image: { source: '../screen.png', width: 800, height: 500 },
        annotations: [],
      });
    } finally {
      rmSync(out, { force: true });
    }
  });

  it('render writes a PNG and markdown notes', () => {
    const out = path.join(tmp, 'shapes.png');
    const md = path.join(tmp, 'shapes.md');
    const { code, stdout } = run(['render', SHAPES, '-o', out, '--md', md]);
    expect(code).toBe(0);
    const summary = JSON.parse(stdout);
    expect(summary).toMatchObject({ output: out, width: 800, height: 500 });
    expect(summary.annotations.map((a: { index: number }) => a.index)).toEqual([1, 2, 3, 4, 5]);
    expect(readFileSync(out).subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
    expect(readFileSync(md, 'utf8')).toContain('Page title');
  });

  it('render --scale multiplies the output size', () => {
    const out = path.join(tmp, 'scaled.png');
    expect(JSON.parse(run(['render', SHAPES, '-o', out, '--scale', '2']).stdout)).toMatchObject({
      width: 1600,
      height: 1000,
    });
  });

  it('validate reports path-addressed issues with exit code 1', () => {
    const spec = {
      version: 1,
      image: { source: 'tests/fixtures/screen.png' },
      annotations: [{ type: 'arrow', from: '@missing.right', to: [10, 10] }],
    };
    const { code, stderr } = run(['validate', '-'], JSON.stringify(spec));
    expect(code).toBe(1);
    expect(JSON.parse(stderr)).toEqual({
      error: 'invalid_spec',
      issues: [{ path: 'annotations[0].from', message: 'Unknown anchor target "@missing"' }],
    });
    expect(run(['validate', SHAPES]).code).toBe(0);
  });

  it('apply edits a spec and keeps anchors live', () => {
    const out = path.join(tmp, 'applied.json');
    const ops = [
      { op: 'update', id: 'title', set: { color: '#FF3366' } },
      { op: 'add', annotation: { type: 'pin', at: '@title.bottom' } },
    ];
    const { code, stdout } = run(['apply', SHAPES, '--ops', JSON.stringify(ops), '-o', out]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).addedIds).toEqual(['a4']);
    const next = JSON.parse(readFileSync(out, 'utf8'));
    expect(next.annotations[0].color).toBe('#FF3366');
    expect(next.annotations.at(-1)).toEqual({ id: 'a4', type: 'pin', at: '@title.bottom' });
  });

  it('apply rejects ops that target unknown ids', () => {
    const { code, stderr } = run(['apply', SHAPES, '--ops', '[{"op":"delete","id":"nope"}]']);
    expect(code).toBe(1);
    expect(JSON.parse(stderr).issues[0].path).toBe('ops[0].id');
  });

  it('schema prints JSON Schemas for specs and ops', () => {
    expect(JSON.parse(run(['schema']).stdout).type).toBe('object');
    expect(JSON.parse(run(['schema', 'ops']).stdout).type).toBe('array');
  });

  it('exits with code 2 on usage errors', () => {
    expect(run(['bogus']).code).toBe(2);
    expect(run(['render']).code).toBe(2);
    expect(run(['apply', SHAPES]).code).toBe(2);
  });
});

describe('annot8 MCP server', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: 'annot8-test', version: '0.0.0' });
    await client.connect(new StdioClientTransport({ command: 'node', args: [CLI, 'mcp'], cwd: ROOT }));
  });

  afterAll(async () => {
    await client?.close();
  });

  it('lists the annot8 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'annot8_apply_ops',
      'annot8_inspect_image',
      'annot8_render',
      'annot8_schema',
      'annot8_validate',
    ]);
  });

  it('renders a spec and returns image content', async () => {
    const output = path.join(tmp, 'mcp.png');
    const result = await client.callTool({ name: 'annot8_render', arguments: { specPath: SHAPES, output } });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    expect(JSON.parse(content[0].text!)).toMatchObject({ width: 800, height: 500, output });
    expect(content[1]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(Buffer.from(content[1].data!, 'base64').subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
    expect(readFileSync(output).subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  });

  it('returns path-addressed issues as a tool error', async () => {
    const result = await client.callTool({
      name: 'annot8_validate',
      arguments: { spec: { version: 1, image: { source: 'x.png', width: 10, height: 10 }, annotations: [{ type: 'box' }] } },
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(body.error).toBe('invalid_spec');
    expect(body.issues[0].path).toMatch(/^annotations\[0\]/);
  });

  it('applies ops and writes the spec back', async () => {
    const specPath = path.join(tmp, 'mcp-spec.json');
    const spec = JSON.parse(readFileSync(SHAPES, 'utf8'));
    spec.image.source = path.join(FIXTURES, 'screen.png');
    writeFileSync(specPath, JSON.stringify(spec));
    const result = await client.callTool({
      name: 'annot8_apply_ops',
      arguments: { specPath, ops: [{ op: 'delete', id: 'email' }], write: true },
    });
    expect(result.isError).toBeFalsy();
    const written = JSON.parse(readFileSync(specPath, 'utf8'));
    expect(written.annotations.some((a: { id?: string }) => a.id === 'email')).toBe(false);
  });
});
