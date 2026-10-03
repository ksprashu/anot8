// Full-bleed icons for platforms that crop to their own shape (Android/Windows maskable, Apple).
import sharp from 'sharp';

const source = 'scripts/logo-maskable.svg';
const outputs = [
  ['public/maskable-icon-512x512.png', 512],
  ['public/apple-touch-icon-180x180.png', 180],
];

for (const [file, size] of outputs) {
  await sharp(source, { density: 300 }).resize(size, size).png().toFile(file);
  console.log(`generated ${file}`);
}
