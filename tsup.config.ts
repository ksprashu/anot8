import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { annot8: 'cli/annot8.ts' },
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
