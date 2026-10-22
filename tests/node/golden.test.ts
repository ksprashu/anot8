/**
 * Golden image tests: every fixture spec is rendered headlessly and compared with a committed PNG.
 * Regenerate after an intentional rendering change with: UPDATE_GOLDEN=1 npx vitest run --project node
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { renderSpec } from '../../src/core/node/render';

const SPECS_DIR = path.resolve(__dirname, '../fixtures/specs');
const GOLDEN_DIR = path.resolve(__dirname, '../fixtures/golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
/** Text uses system fonts, so glyph rasterization varies slightly between machines. */
const MAX_DIFF_RATIO = 0.02;

const specs = readdirSync(SPECS_DIR).filter((f) => f.endsWith('.anot8.json'));

describe('golden renders', () => {
  it('has fixture specs', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it.each(specs)('%s matches its golden image', async (file) => {
    const spec = JSON.parse(readFileSync(path.join(SPECS_DIR, file), 'utf8'));
    const { png } = await renderSpec(spec, { baseDir: SPECS_DIR });
    const goldenPath = path.join(GOLDEN_DIR, file.replace(/\.anot8\.json$/, '.png'));

    if (UPDATE || !existsSync(goldenPath)) {
      if (!UPDATE) throw new Error(`Missing golden ${goldenPath}; run with UPDATE_GOLDEN=1 to create it`);
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(goldenPath, png);
      return;
    }

    const actual = PNG.sync.read(png);
    const expected = PNG.sync.read(readFileSync(goldenPath));
    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
    const diff = pixelmatch(actual.data, expected.data, undefined, actual.width, actual.height, { threshold: 0.2 });
    expect(diff / (actual.width * actual.height)).toBeLessThan(MAX_DIFF_RATIO);
  });
});
