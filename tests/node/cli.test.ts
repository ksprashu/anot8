/**
 * End-to-end tests for the built CLI (dist-cli/anot8.js) and its stdio MCP server.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  assertCanvasDimensions,
  assertSafeHttpUrl,
  isPrivateOrReservedIp,
  MAX_CANVAS_SIDE,
  publicOnlyLookup,
  readImageSource,
} from '../../src/core/node/backend';

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'dist-cli/anot8.js');
const FIXTURES = path.join(ROOT, 'tests/fixtures');
const SHAPES = path.join(FIXTURES, 'specs/shapes.anot8.json');
const PNG_SIGNATURE = '89504e470d0a1a0a';

function run(args: string[], input?: string) {
  const result = spawnSync('node', [CLI, ...args], { cwd: ROOT, input, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

let tmp: string;

beforeAll(() => {
  execFileSync('npx', ['tsup', '--silent'], { cwd: ROOT, stdio: 'ignore' });
  tmp = mkdtempSync(path.join(tmpdir(), 'anot8-cli-'));
}, 60_000);

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('anot8 CLI', () => {
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

  it('render writes a PNG and markdown notes with bounds', () => {
    const out = path.join(tmp, 'shapes.png');
    const md = path.join(tmp, 'shapes.md');
    const { code, stdout } = run(['render', SHAPES, '-o', out, '--md', md, '--format', 'table']);
    expect(code).toBe(0);
    const summary = JSON.parse(stdout);
    expect(summary).toMatchObject({ output: out, width: 800, height: 500 });
    expect(summary.annotations.map((a: { index: number }) => a.index)).toEqual([1, 2, 3, 4, 5]);
    expect(summary.annotations[0].bounds).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    expect(readFileSync(out).subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
    expect(readFileSync(md, 'utf8')).toContain('| # | Type | Color | Note |');
  });

  it('markdown command serializes notes in requested format', () => {
    const out = path.join(tmp, 'checklist.md');
    const { code, stdout } = run(['markdown', SHAPES, '--format', 'checklist', '-o', out]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).format).toBe('checklist');
    expect(readFileSync(out, 'utf8')).toContain('- [ ] **#1');
  });

  it('share command prints a #spec=<base64url> link', () => {
    const { code, stdout } = run(['share', SHAPES, '--app-url', 'https://anot8.ksprashu.dev/']);
    expect(code).toBe(0);
    const res = JSON.parse(stdout);
    expect(res.hash).toMatch(/^#spec=[A-Za-z0-9_-]+$/);
    expect(res.url).toBe(`https://anot8.ksprashu.dev/${res.hash}`);
  });

  it('render --scale multiplies the output size', () => {
    const out = path.join(tmp, 'scaled.png');
    expect(JSON.parse(run(['render', SHAPES, '-o', out, '--scale', '2']).stdout)).toMatchObject({
      width: 1600,
      height: 1000,
    });
  });

  it('render rejects --scale above 8', () => {
    const { code, stderr } = run(['render', SHAPES, '-o', path.join(tmp, 'huge.png'), '--scale', '9']);
    expect(code).not.toBe(0);
    expect(stderr).toContain('--scale must be a positive number up to 8');
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
    expect(run(['markdown', SHAPES, '--format', 'bogus']).code).toBe(2);
  });
});

describe('anot8 MCP server', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: 'anot8-test', version: '0.0.0' });
    await client.connect(new StdioClientTransport({ command: 'node', args: [CLI, 'mcp'], cwd: ROOT }));
  });

  afterAll(async () => {
    await client?.close();
  });

  it('lists the anot8 tools, resources, and prompts', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'anot8_apply_ops',
      'anot8_init_spec',
      'anot8_inspect_image',
      'anot8_markdown',
      'anot8_render',
      'anot8_schema',
      'anot8_share_url',
      'anot8_validate',
    ]);

    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual([
      'anot8://guide',
      'anot8://schema/ops',
      'anot8://schema/spec',
    ]);

    const guideResource = await client.readResource({ uri: 'anot8://guide' });
    expect((guideResource.contents[0] as { text: string }).text).toContain('Anot8 specs');

    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['annotate-screenshot', 'redact-screenshot']);

    const prompt = await client.getPrompt({
      name: 'annotate-screenshot',
      arguments: { image: 'screen.png', goal: 'Highlight login button' },
    });
    expect((prompt.messages[0].content as { text: string }).text).toContain('Highlight login button');
  });

  it('initializes a starter spec via anot8_init_spec', async () => {
    const outSpec = path.join(tmp, 'init-mcp.anot8.json');
    const result = await client.callTool({
      name: 'anot8_init_spec',
      arguments: {
        source: path.join(FIXTURES, 'screen.png'),
        output: outSpec,
        defaults: { color: 'cyan' },
        annotations: [{ id: 'box1', type: 'box', x: '10%', y: '10%', width: 100, height: 50, note: 'Header' }],
      },
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(payload).toMatchObject({ width: 800, height: 500, written: outSpec });
    expect(JSON.parse(readFileSync(outSpec, 'utf8')).annotations[0].id).toBe('box1');
  });

  it('renders a spec and returns image content plus annotation bounds', async () => {
    const output = path.join(tmp, 'mcp.png');
    const result = await client.callTool({
      name: 'anot8_render',
      arguments: { specPath: SHAPES, output, markdownFormat: 'report' },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    const summary = JSON.parse(content[0].text!);
    expect(summary).toMatchObject({ width: 800, height: 500, output });
    expect(summary.annotations[0].bounds).toMatchObject({ x: 244, y: 114, width: 232, height: 36 });
    expect(summary.markdown).toContain('# Annotation Report:');
    expect(content[1]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(Buffer.from(content[1].data!, 'base64').subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
    expect(readFileSync(output).subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  });

  it('refuses output paths with the wrong extension', async () => {
    const cases = [
      { name: 'anot8_render', arguments: { specPath: SHAPES, output: path.join(tmp, 'evil.sh') } },
      { name: 'anot8_render', arguments: { specPath: SHAPES, markdownOutput: path.join(tmp, 'notes.txt') } },
      { name: 'anot8_markdown', arguments: { specPath: SHAPES, output: path.join(tmp, '.bashrc') } },
      { name: 'anot8_apply_ops', arguments: { specPath: SHAPES, ops: [], output: path.join(tmp, 'spec.js') } },
      { name: 'anot8_init_spec', arguments: { source: path.join(FIXTURES, 'screen.png'), output: path.join(tmp, 'x.png') } },
    ];
    for (const call of cases) {
      const result = await client.callTool(call);
      expect(result.isError, call.name).toBe(true);
      expect((result.content as Array<{ text: string }>)[0].text).toContain('Output file must end in');
    }
  });

  it('serializes markdown via anot8_markdown and encodes share URLs via anot8_share_url', async () => {
    const mdResult = await client.callTool({
      name: 'anot8_markdown',
      arguments: { specPath: SHAPES, format: 'checklist' },
    });
    expect(mdResult.isError).toBeFalsy();
    const mdPayload = JSON.parse((mdResult.content as Array<{ text: string }>)[0].text);
    expect(mdPayload.markdown).toContain('- [ ] **#1');

    const shareResult = await client.callTool({
      name: 'anot8_share_url',
      arguments: { specPath: SHAPES },
    });
    expect(shareResult.isError).toBeFalsy();
    const sharePayload = JSON.parse((shareResult.content as Array<{ text: string }>)[0].text);
    expect(sharePayload.url).toMatch(/^https:\/\/anot8\.ksprashu\.dev\/#spec=[A-Za-z0-9_-]+$/);
    const decoded = JSON.parse(
      Buffer.from(sharePayload.hash.slice('#spec='.length), 'base64url').toString('utf8')
    );
    expect(decoded.image.source).toMatch(/^data:image\/png;base64,/);
  });

  it('returns path-addressed issues as a tool error', async () => {
    const result = await client.callTool({
      name: 'anot8_validate',
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
      name: 'anot8_apply_ops',
      arguments: { specPath, ops: [{ op: 'delete', id: 'email' }], write: true },
    });
    expect(result.isError).toBeFalsy();
    const written = JSON.parse(readFileSync(specPath, 'utf8'));
    expect(written.annotations.some((a: { id?: string }) => a.id === 'email')).toBe(false);
  });
});

describe('Node backend URL and resource guards', () => {
  it('blocks private, loopback, and metadata URLs while allowing public https URLs', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.10')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.5.4')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:7f00:1')).toBe(true);
    expect(isPrivateOrReservedIp('64:ff9b::7f00:1')).toBe(true);
    expect(isPrivateOrReservedIp('2001:0000:4136:e378:8000:63bf:3fff:fdd2')).toBe(true);
    expect(isPrivateOrReservedIp('2002:7f00:1::')).toBe(true);
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false);

    expect(() => assertSafeHttpUrl('http://localhost:8080/x.png')).toThrow(/private or loopback/);
    expect(() => assertSafeHttpUrl('http://[::ffff:127.0.0.1]/x.png')).toThrow(/private or loopback/);
    expect(() => assertSafeHttpUrl('http://169.254.169.254/latest/meta-data')).toThrow(/private or loopback/);
    expect(() => assertSafeHttpUrl('http://metadata.google.internal/computeMetadata/v1/')).toThrow(/private or loopback/);
    expect(() => assertSafeHttpUrl('https://user:pass@example.com/a.png')).toThrow(/credentials/);
    expect(() => assertSafeHttpUrl('ftp://example.com/a.png')).toThrow(/protocol/);
    expect(assertSafeHttpUrl('https://example.com/a.png').hostname).toBe('example.com');
  });

  it('blocks private addresses at connect time, whatever the DNS check saw', async () => {
    const lookup = (hostname: string, all: boolean) =>
      new Promise<unknown>((resolve, reject) =>
        publicOnlyLookup(hostname, { all }, (err: Error | null, address: unknown) =>
          err ? reject(err) : resolve(address)
        )
      );
    await expect(lookup('127.0.0.1', false)).rejects.toThrow(/private IP 127\.0\.0\.1/);
    await expect(lookup('127.0.0.1', true)).rejects.toThrow(/private IP/);
    await expect(lookup('93.184.216.34', false)).resolves.toBe('93.184.216.34');
    await expect(lookup('93.184.216.34', true)).resolves.toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('flags the additional reserved ranges', () => {
    expect(isPrivateOrReservedIp('192.88.99.1')).toBe(true);
    expect(isPrivateOrReservedIp('fec0::1')).toBe(true);
    expect(isPrivateOrReservedIp('100::1')).toBe(true);
    expect(isPrivateOrReservedIp('2606:4700::1111')).toBe(false);
  });

  it('fetches images over HTTP, following redirects, when private URLs are allowed', async () => {
    const png = readFileSync(path.join(FIXTURES, 'screen.png'));
    const server = http.createServer((req, res) => {
      if (req.url === '/old.png') {
        res.writeHead(302, { location: '/screen.png' }).end();
      } else {
        res.writeHead(200, { 'content-type': 'image/png' }).end(png);
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/old.png`;
    try {
      await expect(readImageSource(url)).rejects.toThrow(/private or loopback/);
      process.env.ANOT8_ALLOW_PRIVATE_URLS = '1';
      expect((await readImageSource(url)).equals(png)).toBe(true);
    } finally {
      delete process.env.ANOT8_ALLOW_PRIVATE_URLS;
      server.close();
    }
  });

  it('only reads regular files', async () => {
    await expect(readImageSource(FIXTURES)).rejects.toThrow(/not a regular file/);
    const png = await readImageSource(path.join(FIXTURES, 'screen.png'));
    expect(png.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  });

  it('caps canvas dimensions', () => {
    expect(assertCanvasDimensions(800.4, 500.6)).toEqual({ width: 800, height: 501 });
    expect(() => assertCanvasDimensions(MAX_CANVAS_SIDE + 1, 10)).toThrow();
    expect(() => assertCanvasDimensions(16_000, 16_000)).toThrow();
    expect(() => assertCanvasDimensions(Number.NaN, 10)).toThrow();
  });
});
