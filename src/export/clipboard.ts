/**
 * Annot8 Clipboard & Export Service
 * Async Clipboard API integration with permission handling, legacy execCommand fallback,
 * automatic file download fallback, and secure Object URL lifecycle management.
 */

import { BaseImage, Annotation, ImageOverlay } from '../types';
import { exportCompositeBlob } from './canvasExporter';
import {
  serializeAnnotationsToMarkdown,
  generateExportFilename,
  sanitizeFileName,
  MarkdownExportFormat,
} from './markdownSerializer';

export type ClipboardWriteMethod = 'async-clipboard' | 'execCommand' | 'download-fallback';

export interface ClipboardResult {
  success: boolean;
  method: ClipboardWriteMethod;
  fallbackUsed: boolean;
  /** Set when only part of a combined payload reached the clipboard. */
  partial?: 'image-only';
  error?: Error;
}

export interface ClipboardImageOptions {
  fallbackFileName?: string;
  autoDownloadFallback?: boolean;
}

export interface ClipboardTextOptions {
  fallbackFileName?: string;
  autoDownloadFallback?: boolean;
}

/**
 * Feature detection for Async Clipboard API support.
 */
export function isAsyncClipboardSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    typeof navigator.clipboard.writeText === 'function'
  );
}

/**
 * Feature detection for standard ClipboardItem constructor support.
 */
export function isClipboardItemSupported(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).ClipboardItem !== 'undefined';
}

/**
 * Checks whether clipboard write permission is granted if Permissions API is present.
 */
export async function isClipboardWritePermissionGranted(): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.permissions ||
    typeof navigator.permissions.query !== 'function'
  ) {
    return true; // Assume granted if Permissions API unavailable
  }

  try {
    const status = await navigator.permissions.query({
      name: 'clipboard-write' as PermissionName,
    });
    return status.state === 'granted' || status.state === 'prompt';
  } catch {
    // Some browsers throw TypeError for 'clipboard-write' permission queries
    return true;
  }
}

/**
 * Triggers a direct browser file download for a given Blob and automatically revokes Object URL.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;

  const sanitized = sanitizeFileName(fileName);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = sanitized;
  anchor.style.display = 'none';
  anchor.setAttribute('aria-hidden', 'true');

  // Prevent JSDOM navigation error in test environment
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
    });
  }

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoke Object URL after short delay to ensure browser downloads correctly
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore cleanup errors
    }
  }, 1000);
}

/**
 * Convenience alias for triggering file downloads matching canvasExporter / test harnesses.
 */
export const triggerFileDownload = downloadBlob;

/**
 * Downloads arbitrary text content as a file (e.g. Markdown .md).
 */
export function downloadTextFile(
  content: string,
  fileName: string,
  mimeType = 'text/markdown;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, fileName);
}

/**
 * Writes an image Blob or HTMLCanvasElement to the system clipboard via Async Clipboard API.
 * Automatically falls back to file download if clipboard access fails or is denied.
 */
export async function writeImageToClipboard(
  imageSource: Blob | HTMLCanvasElement,
  options?: ClipboardImageOptions
): Promise<ClipboardResult> {
  let blob: Blob;

  if (imageSource instanceof Blob) {
    blob = imageSource;
  } else if (
    typeof HTMLCanvasElement !== 'undefined' &&
    imageSource instanceof HTMLCanvasElement
  ) {
    blob = await new Promise<Blob>((resolve, reject) => {
      imageSource.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas toBlob conversion failed'));
      }, 'image/png');
    });
  } else {
    throw new TypeError('Invalid imageSource: Expected Blob or HTMLCanvasElement');
  }

  const canUseClipboard = isAsyncClipboardSupported() && isClipboardItemSupported();

  if (canUseClipboard) {
    try {
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      return {
        success: true,
        method: 'async-clipboard',
        fallbackUsed: false,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (options?.autoDownloadFallback !== false) {
        const fallbackName = options?.fallbackFileName || `annot8-screenshot-${Date.now()}.png`;
        downloadBlob(blob, fallbackName);
        return {
          success: true,
          method: 'download-fallback',
          fallbackUsed: true,
          error,
        };
      }
      throw error;
    }
  }

  // Browser lacks Async Clipboard support
  if (options?.autoDownloadFallback !== false) {
    const fallbackName = options?.fallbackFileName || `annot8-screenshot-${Date.now()}.png`;
    downloadBlob(blob, fallbackName);
    return {
      success: true,
      method: 'download-fallback',
      fallbackUsed: true,
    };
  }

  throw new Error(
    'Async Clipboard API with ClipboardItem is not supported in this browser environment.'
  );
}

/**
 * Direct boolean helper matching canvasExporter interface.
 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  const result = await writeImageToClipboard(blob, { autoDownloadFallback: false });
  return result.success;
}

/**
 * Writes plain text / markdown string to system clipboard with 3-tier fallback.
 * 1. Async navigator.clipboard.writeText
 * 2. Legacy document.execCommand('copy') via temporary textarea
 * 3. Automatic text file download
 */
export async function writeTextToClipboard(
  text: string,
  options?: ClipboardTextOptions
): Promise<ClipboardResult> {
  // Tier 1: Async Clipboard API
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return {
        success: true,
        method: 'async-clipboard',
        fallbackUsed: false,
      };
    } catch {
      // Async write failed, attempt Tier 2 legacy fallback
    }
  }

  // Tier 2: Legacy execCommand('copy')
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);

      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (successful) {
        return {
          success: true,
          method: 'execCommand',
          fallbackUsed: true,
        };
      }
    } catch {
      // Legacy copy failed, proceed to Tier 3 fallback
    }
  }

  // Tier 3: Automatic Download Fallback
  if (options?.autoDownloadFallback !== false) {
    const fallbackName = options?.fallbackFileName || `annot8-notes-${Date.now()}.md`;
    downloadTextFile(text, fallbackName);
    return {
      success: true,
      method: 'download-fallback',
      fallbackUsed: true,
    };
  }

  throw new Error(
    'Failed to copy text to clipboard: All clipboard mechanisms were unavailable or denied.'
  );
}

/**
 * Direct boolean helper matching canvasExporter interface.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const result = await writeTextToClipboard(text, { autoDownloadFallback: false });
  return result.success;
}

/**
 * Writes both image blob and plain text markdown to system clipboard simultaneously.
 */
export async function writeCombinedToClipboard(
  blob: Blob,
  markdown: string,
  options?: { fallbackFileNameBase?: string; autoDownloadFallback?: boolean }
): Promise<ClipboardResult> {
  const canUseClipboard = isAsyncClipboardSupported() && isClipboardItemSupported();

  if (canUseClipboard) {
    try {
      const textBlob = new Blob([markdown], { type: 'text/plain' });
      const item = new ClipboardItem({
        'image/png': blob,
        'text/plain': textBlob,
      });
      await navigator.clipboard.write([item]);
      return {
        success: true,
        method: 'async-clipboard',
        fallbackUsed: false,
      };
    } catch {
      // If multi-mime ClipboardItem fails, try writing image then text
      try {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        return {
          success: true,
          method: 'async-clipboard',
          fallbackUsed: true,
          partial: 'image-only',
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (options?.autoDownloadFallback !== false) {
          const baseName = options?.fallbackFileNameBase || `annot8-${Date.now()}`;
          downloadBlob(blob, `${baseName}-annotated.png`);
          downloadTextFile(markdown, `${baseName}-notes.md`);
          return {
            success: true,
            method: 'download-fallback',
            fallbackUsed: true,
            error,
          };
        }
        throw error;
      }
    }
  }

  if (options?.autoDownloadFallback !== false) {
    const baseName = options?.fallbackFileNameBase || `annot8-${Date.now()}`;
    downloadBlob(blob, `${baseName}-annotated.png`);
    downloadTextFile(markdown, `${baseName}-notes.md`);
    return {
      success: true,
      method: 'download-fallback',
      fallbackUsed: true,
    };
  }

  throw new Error('Combined clipboard write is not supported in this environment');
}

/**
 * High-level orchestration: renders composite 1:1 image and copies to clipboard.
 */
export async function copyCompositeImage(
  baseImage: BaseImage,
  annotations: Annotation[],
  overlaysOrOptions?: ImageOverlay[] | ClipboardImageOptions,
  options?: ClipboardImageOptions
): Promise<ClipboardResult> {
  let overlays: ImageOverlay[] | undefined;
  let opts: ClipboardImageOptions | undefined;
  if (Array.isArray(overlaysOrOptions)) {
    overlays = overlaysOrOptions;
    opts = options;
  } else {
    opts = overlaysOrOptions;
  }
  const blob = await exportCompositeBlob(baseImage, annotations, overlays);
  const fallbackName = generateExportFilename(baseImage, 'png', 'annotated');
  return writeImageToClipboard(blob, { fallbackFileName: fallbackName, ...opts });
}

/**
 * High-level orchestration: serializes annotations and copies markdown to clipboard.
 */
export async function copyAnnotationNotes(
  annotations: Annotation[],
  format: MarkdownExportFormat = 'list',
  baseImage?: BaseImage | null,
  options?: ClipboardTextOptions
): Promise<ClipboardResult> {
  const markdown = serializeAnnotationsToMarkdown(annotations, format);
  const fallbackName = generateExportFilename(baseImage ?? null, 'md', 'notes');
  return writeTextToClipboard(markdown, { fallbackFileName: fallbackName, ...options });
}

/**
 * High-level orchestration: renders composite image and downloads as PNG file.
 */
export async function downloadCompositeImageFile(
  baseImage: BaseImage,
  annotations: Annotation[],
  overlaysOrCustomFileName?: ImageOverlay[] | string,
  customFileName?: string
): Promise<void> {
  let overlays: ImageOverlay[] | undefined;
  let filename: string | undefined;
  if (Array.isArray(overlaysOrCustomFileName)) {
    overlays = overlaysOrCustomFileName;
    filename = customFileName;
  } else {
    filename = overlaysOrCustomFileName;
  }
  const blob = await exportCompositeBlob(baseImage, annotations, overlays);
  const targetFilename = filename || generateExportFilename(baseImage, 'png', 'annotated');
  downloadBlob(blob, targetFilename);
}

/**
 * High-level orchestration: serializes annotations and downloads as Markdown (.md) file.
 */
export function downloadNotesMarkdownFile(
  baseImage: BaseImage | null,
  annotations: Annotation[],
  format: MarkdownExportFormat = 'list',
  customFileName?: string
): void {
  const markdown = serializeAnnotationsToMarkdown(annotations, format);
  const filename = customFileName || generateExportFilename(baseImage, 'md', 'notes');
  downloadTextFile(markdown, filename);
}
