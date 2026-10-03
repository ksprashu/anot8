import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Transparent icons + favicon. Maskable/Apple icons come from scripts/generate-maskable-icons.mjs.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: minimal2023Preset,
  images: ['public/logo.svg'],
});
