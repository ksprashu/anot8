import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { anot8: 'cli/anot8.ts' },
  outDir: 'dist-cli',
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  splitting: false,
  sourcemap: false,
  // Dependencies resolve from node_modules at runtime; @napi-rs/canvas is native and cannot be bundled.
  skipNodeModulesBundle: true,
});
