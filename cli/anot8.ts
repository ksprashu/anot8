#!/usr/bin/env node
/**
 * anot8 CLI: render, validate, and edit Anot8 specs from the shell.
 * Machine-readable output goes to stdout as JSON; errors go to stderr as JSON with a non-zero exit code.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { SpecError, applyOps, getSpecJsonSchema, OpsSchema, SPEC_VERSION, validateSpec, parseSpec } from '../src/spec';
import { z } from 'zod';
import { inspectImage, renderSpec } from '../src/core/node/render';
import { startMcpServer } from './mcp';

const USAGE = `anot8 — parametric screenshot annotation

Usage:
  anot8 inspect <image>                          Print image dimensions as JSON
  anot8 init <image> [-o spec.json]              Write a starter spec for an image
  anot8 render <spec.json|-> [-o out.png] [--md notes.md] [--scale n]
  anot8 validate <spec.json|->                   Check a spec; prints issues with paths
  anot8 apply <spec.json|-> (--ops '<json>' | --ops-file ops.json) [-o out.json | --in-place]
  anot8 schema [spec|ops]                        Print the JSON Schema for specs (or edit ops)
  anot8 mcp                                      Run the local stdio MCP server

Image paths in a spec resolve relative to the spec file.`;

class UsageError extends Error {}

async function readJson(file: string): Promise<{ data: unknown; baseDir: string }> {
  const text =
    file === '-'
      ? await new Promise<string>((resolve, reject) => {
          let buf = '';
          process.stdin.setEncoding('utf8');
          process.stdin.on('data', (chunk) => (buf += chunk));
          process.stdin.on('end', () => resolve(buf));
          process.stdin.on('error', reject);
        })
      : await readFile(file, 'utf8');
  try {
    return { data: JSON.parse(text), baseDir: file === '-' ? process.cwd() : path.dirname(path.resolve(file)) };
  } catch (err) {
    throw new SpecError([{ path: '', message: `Not valid JSON: ${(err as Error).message}` }]);
  }
}

function parseOpsFlag(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new SpecError([{ path: 'ops', message: `Not valid JSON: ${(err as Error).message}` }]);
  }
}

function print(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function requirePositional(positionals: string[], name: string): string {
  const value = positionals[0];
  if (!value) throw new UsageError(`Missing <${name}>`);
  return value;
}

function parseCommandArgs(args: string[]) {
  try {
    return parseArgs({
      args,
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
        md: { type: 'string' },
        scale: { type: 'string' },
        ops: { type: 'string' },
        'ops-file': { type: 'string' },
        'in-place': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const { values, positionals } = parseCommandArgs(rest);

  if (!command || command === 'help' || command === '--help' || command === '-h' || values.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  switch (command) {
    case 'inspect': {
      const image = requirePositional(positionals, 'image');
      print({ source: image, ...(await inspectImage(image)) });
      return;
    }

    case 'init': {
      const image = requirePositional(positionals, 'image');
      const { width, height } = await inspectImage(image);
      const out = values.out ?? `${image.replace(/\.[^./\\]+$/, '')}.anot8.json`;
      const outDir = path.dirname(path.resolve(out));
      const imagePath = path.resolve(image);
      // Keep specs portable with a relative path, unless the two only share the filesystem root.
      const source =
        outDir.split(path.sep)[1] === imagePath.split(path.sep)[1] ? path.relative(outDir, imagePath) : imagePath;
      const spec = { version: SPEC_VERSION, image: { source, width, height }, annotations: [] };
      await writeFile(out, `${JSON.stringify(spec, null, 2)}\n`);
      print({ spec: out, width, height });
      return;
    }

    case 'render': {
      const file = requirePositional(positionals, 'spec.json');
      const { data, baseDir } = await readJson(file);
      const scale = values.scale !== undefined ? Number(values.scale) : undefined;
      if (scale !== undefined && !(scale > 0)) throw new UsageError('--scale must be a positive number');
      const result = await renderSpec(data, { baseDir, scale });
      const out = values.out ?? (file === '-' ? 'anot8.png' : file.replace(/(\.anot8)?\.json$/i, '') + '.png');
      await writeFile(out, result.png);
      if (values.md) await writeFile(values.md, result.markdown);
      print({
        output: out,
        width: result.width,
        height: result.height,
        ...(values.md ? { markdown: values.md } : {}),
        annotations: result.compiled.annotations.map((a) => ({ id: a.id, type: a.geometry.type, index: a.index })),
      });
      return;
    }

    case 'validate': {
      const file = requirePositional(positionals, 'spec.json');
      const { data, baseDir } = await readJson(file);
      const spec = parseSpec(data);
      const dims = await inspectImage(spec.image.source, baseDir).catch(() => undefined);
      const issues = validateSpec(spec, dims);
      if (!dims && !spec.image.width) {
        issues.push({ path: 'image.source', message: `Could not load image "${spec.image.source}"` });
      }
      if (issues.length > 0) throw new SpecError(issues);
      print({ valid: true });
      return;
    }

    case 'apply': {
      const file = requirePositional(positionals, 'spec.json');
      const { data, baseDir } = await readJson(file);
      if (!values.ops && !values['ops-file']) throw new UsageError('Pass --ops \'<json>\' or --ops-file <file>');
      const opsData = values.ops ? parseOpsFlag(values.ops) : (await readJson(values['ops-file']!)).data;
      const spec = parseSpec(data);
      const dims = await inspectImage(spec.image.source, baseDir).catch(() => undefined);
      const { spec: next, addedIds } = applyOps(spec, Array.isArray(opsData) ? opsData : [opsData], dims);
      const target = values['in-place'] ? (file === '-' ? undefined : file) : values.out;
      if (target) {
        await writeFile(target, `${JSON.stringify(next, null, 2)}\n`);
        print({ output: target, addedIds });
      } else {
        print(next);
      }
      return;
    }

    case 'schema': {
      const which = positionals[0] ?? 'spec';
      if (which !== 'spec' && which !== 'ops') throw new UsageError('Use "anot8 schema spec" or "anot8 schema ops"');
      print(which === 'ops' ? z.toJSONSchema(OpsSchema) : getSpecJsonSchema());
      return;
    }

    case 'mcp':
      await startMcpServer();
      return;

    default:
      throw new UsageError(`Unknown command "${command}"`);
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  if (err instanceof SpecError) {
    process.stderr.write(`${JSON.stringify({ error: 'invalid_spec', issues: err.issues }, null, 2)}\n`);
    process.exitCode = 1;
  } else if (err instanceof UsageError) {
    process.stderr.write(`${err.message}\n\n${USAGE}\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write(`${JSON.stringify({ error: 'failed', message: (err as Error).message ?? String(err) })}\n`);
    process.exitCode = 1;
  }
});
