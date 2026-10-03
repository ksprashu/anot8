import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Static hosting guarantees: hashed build output and fully client-side operation.
 */
describe('Static Bundle & Offline Autonomy', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const distDir = path.join(rootDir, 'dist');

  describe('Production bundle', () => {
    it('verifies built production bundle produces cryptographic content-hashes in /assets/', () => {
      if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
        execSync('npm run build', { cwd: rootDir, stdio: 'pipe' });
      }
      expect(fs.existsSync(distDir)).toBe(true);
      const assetsDir = path.join(distDir, 'assets');
      expect(fs.existsSync(assetsDir)).toBe(true);

      const files = fs.readdirSync(assetsDir);
      const jsFiles = files.filter((f) => f.endsWith('.js'));
      const cssFiles = files.filter((f) => f.endsWith('.css'));

      expect(jsFiles.length).toBeGreaterThanOrEqual(1);
      expect(cssFiles.length).toBeGreaterThanOrEqual(1);

      // Every chunk carries a content hash (name-[hash].js); lazy chunks such as workbox-window are allowed
      for (const jsFile of jsFiles) {
        expect(jsFile).toMatch(/^[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js$/);
      }
      for (const cssFile of cssFiles) {
        expect(cssFile).toMatch(/^index-[A-Za-z0-9_-]+\.css$/);
      }

      // index.html points directly at the hashed entry bundle and stylesheet
      const indexHtmlContent = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
      const entryJs = jsFiles.filter((f) => f.startsWith('index-'));
      expect(entryJs).toHaveLength(1);
      expect(indexHtmlContent).toContain(entryJs[0]);
      for (const cssFile of cssFiles) {
        expect(indexHtmlContent).toContain(cssFile);
      }
    });
  });

  describe('Installable PWA', () => {
    const readDist = (file: string) => fs.readFileSync(path.join(distDir, file), 'utf-8');

    it('ships a web app manifest with standalone display and installable icons', () => {
      const manifest = JSON.parse(readDist('manifest.webmanifest'));

      expect(manifest.name).toContain('Annot8');
      expect(manifest.short_name).toBe('Annot8');
      expect(manifest.display).toBe('standalone');
      expect(manifest.start_url).toBe('./');
      expect(manifest.scope).toBe('./');

      const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
      expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
      expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true);
      for (const icon of manifest.icons) {
        expect(fs.existsSync(path.join(distDir, icon.src))).toBe(true);
      }
    });

    it('links the manifest, apple touch icon, and theme color from index.html', () => {
      const html = readDist('index.html');
      expect(html).toContain('rel="manifest"');
      expect(html).toContain('apple-touch-icon-180x180.png');
      expect(html).toContain('name="theme-color"');
      expect(fs.existsSync(path.join(distDir, 'apple-touch-icon-180x180.png'))).toBe(true);
    });

    it('generates a service worker that precaches the app shell for offline launch', () => {
      const sw = readDist('sw.js');
      expect(sw).toContain('index.html');
      expect(sw).toMatch(/assets\/index-[A-Za-z0-9_-]+\.js/);
      // Updates wait for the user: skipWaiting only runs when the page posts SKIP_WAITING
      expect(sw).toContain('SKIP_WAITING');
    });
  });

  describe('Dimension 3: Client-Side 100% Offline Autonomy & Zero Network Egress Oracle', () => {
    it('verifies zero external API fetch/xhr/ws egress calls in source code', () => {
      const srcDir = path.join(rootDir, 'src');

      function scanDirForEgress(dir: string): string[] {
        let violations: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            violations = violations.concat(scanDirForEgress(fullPath));
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            const content = fs.readFileSync(fullPath, 'utf-8');

            // Look for active fetch(), new WebSocket(), new XMLHttpRequest(), new EventSource()
            const fetchCalls = content.match(/\bfetch\s*\(/g);
            const wsCalls = content.match(/\bnew\s+WebSocket\s*\(/g);
            const xhrCalls = content.match(/\bnew\s+XMLHttpRequest\s*\(/g);
            const eventSourceCalls = content.match(/\bnew\s+EventSource\s*\(/g);

            if (fetchCalls) violations.push(`${entry.name}: fetch() detected`);
            if (wsCalls) violations.push(`${entry.name}: WebSocket detected`);
            if (xhrCalls) violations.push(`${entry.name}: XMLHttpRequest detected`);
            if (eventSourceCalls) violations.push(`${entry.name}: EventSource detected`);
          }
        }
        return violations;
      }

      const violations = scanDirForEgress(srcDir);
      expect(violations).toEqual([]);
    });

    it('verifies telemetry handles offline state without throwing or blocking UI', async () => {
      const { trackEvent, trackPaste, trackCopy, trackAnnotate, setTelemetryEnabled } = await import(
        '../../src/analytics/telemetry'
      );

      setTelemetryEnabled(true);

      // Mock offline navigator
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      // Track events while offline
      expect(() => {
        trackEvent('test_offline_event', { key: 'val' });
        trackPaste({ source: 'clipboard', fileSize: 1024, width: 800, height: 600 });
        trackCopy({ type: 'image_clipboard', annotationCount: 3 });
        trackAnnotate({ shapeType: 'box', color: '#ff0000', strokeWidth: 3 });
      }).not.toThrow();

      // Restore navigator.onLine
      Object.defineProperty(navigator, 'onLine', {
        value: originalOnLine,
        configurable: true,
        writable: true,
      });
    });

    it('verifies telemetry handles throwing window.gtag safely without crashing app thread', async () => {
      const { trackEvent, setTelemetryEnabled } = await import('../../src/analytics/telemetry');

      setTelemetryEnabled(true);

      // Mock online navigator
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
        writable: true,
      });

      // Mock broken gtag that throws
      window.gtag = vi.fn().mockImplementation(() => {
        throw new Error('Network / AdBlock / Offline failure');
      });

      // Should not throw
      expect(() => {
        trackEvent('test_throwing_gtag');
      }).not.toThrow();

      // Allow microtasks to resolve
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });
});
