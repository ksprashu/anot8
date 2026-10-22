import React, { useState, useCallback } from 'react';
import {
  Copy,
  FileText,
  Download,
  FileDown,
  Layers,
  Loader2,
  FileJson,
} from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { useToast, ToastType } from './ToastNotification';
import { exportCompositeBlob } from '../../export/canvasExporter';
import { serializeAnnotationsToMarkdown } from '../../export/markdownSerializer';
import {
  writeImageToClipboard,
  writeTextToClipboard,
  writeCombinedToClipboard,
  downloadBlob,
  downloadTextFile,
} from '../../export/clipboard';
import { trackCopy } from '../../analytics/telemetry';
import { toSpec } from '../../spec';

export interface ExportActionsProps {
  className?: string;
  disabled?: boolean;
  onCopyImage?: () => Promise<void> | void;
  onCopyNotes?: () => Promise<void> | void;
  onExportPng?: () => Promise<void> | void;
  onExportMarkdown?: () => Promise<void> | void;
  onCopyCombined?: () => Promise<void> | void;
  onNotifyToast?: (type: ToastType, message: string, description?: string) => void;
  showLabels?: boolean;
}

export function sanitizeBaseFilename(fileName?: string): string {
  if (!fileName) {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return `annot8-${timestamp}`;
  }
  return fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export const ExportActions: React.FC<ExportActionsProps> = ({
  className = '',
  disabled = false,
  onCopyImage,
  onCopyNotes,
  onExportPng,
  onExportMarkdown,
  onCopyCombined,
  onNotifyToast,
  showLabels = true,
}) => {
  let appState = null;
  try {
    const app = useApp();
    appState = app.state;
  } catch {
    // Graceful fallback for testing in isolation without AppContext
  }

  const toast = useToast();
  const notify = useCallback(
    (type: ToastType, message: string, description?: string) => {
      if (onNotifyToast) {
        onNotifyToast(type, message, description);
      } else {
        toast.showToast(type, message, { description });
      }
    },
    [onNotifyToast, toast]
  );

  const [exportingType, setExportingType] = useState<
    'image' | 'notes' | 'png' | 'md' | 'combined' | 'spec' | null
  >(null);

  const image = appState?.image ?? null;
  const annotations = appState?.annotations ?? [];
  const overlays = appState?.overlays ?? [];
  const frame = appState?.frame;

  const hasImage = Boolean(image);
  const hasAnnotations = annotations.length > 0;
  const isBusy = exportingType !== null;

  // 1. Copy Image Handler (Cmd+C)
  const handleCopyImage = async () => {
    if (disabled || isBusy || !image) return;
    trackCopy({ type: 'image_clipboard', annotationCount: annotations.length });
    if (onCopyImage) {
      await onCopyImage();
      return;
    }

    setExportingType('image');
    try {
      const blob = await exportCompositeBlob(image, annotations, overlays, { frame });
      const res = await writeImageToClipboard(blob);

      if (res.success && !res.fallbackUsed) {
        notify('success', 'Copied image to clipboard!', 'Ready to paste into chat, PRs, or docs');
      } else {
        const baseName = sanitizeBaseFilename(image?.fileName);
        downloadBlob(blob, `${baseName}-annotated.png`);
        notify('warning', 'Clipboard write not supported', 'Downloaded annotated PNG file instead');
      }
    } catch (err: any) {
      console.error('Failed to copy image:', err);
      notify('error', 'Failed to copy image', err?.message || 'Offscreen canvas rasterization error');
    } finally {
      setExportingType(null);
    }
  };

  // 2. Copy Notes Handler (Cmd+Shift+C)
  const handleCopyNotes = async () => {
    if (disabled || isBusy || !hasAnnotations) return;
    trackCopy({ type: 'notes_clipboard', annotationCount: annotations.length });
    if (onCopyNotes) {
      await onCopyNotes();
      return;
    }

    setExportingType('notes');
    try {
      const markdown = serializeAnnotationsToMarkdown(annotations, {
        imageFileName: image?.fileName,
      });
      const res = await writeTextToClipboard(markdown);

      if (res.success && !res.fallbackUsed) {
        notify('success', 'Copied notes to clipboard!', `${annotations.length} ordered items serialized`);
      } else {
        const baseName = sanitizeBaseFilename(image?.fileName);
        downloadTextFile(markdown, `${baseName}-notes.md`);
        notify('warning', 'Clipboard write not supported', 'Downloaded markdown notes file instead');
      }
    } catch (err: any) {
      console.error('Failed to copy notes:', err);
      notify('error', 'Failed to copy notes', err?.message || 'Markdown serialization error');
    } finally {
      setExportingType(null);
    }
  };

  // 3. Combined Copy Handler
  const handleCopyCombined = async () => {
    if (disabled || isBusy || !image) return;
    trackCopy({ type: 'combined_clipboard', annotationCount: annotations.length });
    if (onCopyCombined) {
      await onCopyCombined();
      return;
    }

    setExportingType('combined');
    try {
      const blob = await exportCompositeBlob(image, annotations, overlays, { frame });
      const markdown = serializeAnnotationsToMarkdown(annotations, {
        imageFileName: image?.fileName,
      });

      const res = await writeCombinedToClipboard(blob, markdown);
      if (res.success && !res.fallbackUsed) {
        notify('success', 'Copied image & notes to clipboard!');
      } else {
        const baseName = sanitizeBaseFilename(image?.fileName);
        downloadBlob(blob, `${baseName}-annotated.png`);
        downloadTextFile(markdown, `${baseName}-notes.md`);
        notify('warning', 'Downloaded image and notes files');
      }
    } catch (err: any) {
      console.error('Failed combined export:', err);
      notify('error', 'Failed combined export', err?.message || 'Export error');
    } finally {
      setExportingType(null);
    }
  };

  // 4. Export PNG File Download
  const handleExportPng = async () => {
    if (disabled || isBusy || !image) return;
    trackCopy({ type: 'png_download', annotationCount: annotations.length });
    if (onExportPng) {
      await onExportPng();
      return;
    }

    setExportingType('png');
    try {
      const blob = await exportCompositeBlob(image, annotations, overlays, { frame });
      const baseName = sanitizeBaseFilename(image?.fileName);
      downloadBlob(blob, `${baseName}-annotated.png`);
      notify('success', 'Exported PNG screenshot!', `${baseName}-annotated.png`);
    } catch (err: any) {
      console.error('Failed to export PNG:', err);
      notify('error', 'Failed to export PNG', err?.message || 'Rasterization error');
    } finally {
      setExportingType(null);
    }
  };

  // 5. Export Markdown File Download
  const handleExportMarkdown = async () => {
    if (disabled || isBusy || !hasAnnotations) return;
    trackCopy({ type: 'markdown_download', annotationCount: annotations.length });
    if (onExportMarkdown) {
      await onExportMarkdown();
      return;
    }

    setExportingType('md');
    try {
      const markdown = serializeAnnotationsToMarkdown(annotations, {
        imageFileName: image?.fileName,
      });
      const baseName = sanitizeBaseFilename(image?.fileName);
      downloadTextFile(markdown, `${baseName}-notes.md`);
      notify('success', 'Exported markdown notes!', `${baseName}-notes.md`);
    } catch (err: any) {
      console.error('Failed to export markdown:', err);
      notify('error', 'Failed to export markdown', err?.message || 'Serialization error');
    } finally {
      setExportingType(null);
    }
  };

  // 6. Save the document as an Annot8 spec (reloadable by drop, the CLI, or agents)
  const handleSaveSpec = async () => {
    if (disabled || isBusy || !image) return;
    setExportingType('spec');
    try {
      // The agent bridge keeps anchors from a loaded spec and embeds blob: images; fall back to a pixel spec.
      const spec = window.annot8
        ? await window.annot8.getSpec()
        : toSpec({ image, annotations, frame });
      const baseName = sanitizeBaseFilename(image.fileName);
      downloadTextFile(`${JSON.stringify(spec, null, 2)}\n`, `${baseName}.annot8.json`, 'application/json');
      notify('success', 'Saved Annot8 spec', `${baseName}.annot8.json`);
    } catch (err: unknown) {
      notify('error', 'Failed to save spec', err instanceof Error ? err.message : String(err));
    } finally {
      setExportingType(null);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Export and clipboard actions"
      data-testid="export-actions-toolbar"
      className={`flex items-center gap-1.5 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 rounded-lg p-1 text-slate-700 dark:text-slate-200 shadow-sm select-none ${className}`}
    >
      {/* Primary Action: Copy Image (Cmd+C) */}
      <button
        type="button"
        data-testid="btn-copy-image"
        onClick={handleCopyImage}
        disabled={disabled || !hasImage || isBusy}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-xs transition-colors shadow-sm disabled:opacity-40 disabled:hover:bg-amber-500 disabled:cursor-not-allowed cursor-pointer active:scale-95"
        title="Copy annotated image to clipboard (⌘C)"
        aria-label="Copy annotated image to clipboard"
      >
        {exportingType === 'image' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" data-testid="spinner-copy-image" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
        {showLabels && <span>Copy Image</span>}
        <kbd className="hidden sm:inline-block ml-1 px-1 py-0.2 rounded bg-slate-950/20 text-[10px] font-mono font-medium">
          ⌘C
        </kbd>
      </button>

      {/* Copy Notes (Cmd+Shift+C) */}
      <button
        type="button"
        data-testid="btn-copy-notes"
        onClick={handleCopyNotes}
        disabled={disabled || !hasAnnotations || isBusy}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 active:bg-slate-200 dark:active:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white font-medium text-xs border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors disabled:opacity-40 disabled:hover:bg-slate-100 dark:disabled:hover:bg-slate-800 disabled:cursor-not-allowed cursor-pointer active:scale-95"
        title="Copy structured markdown notes to clipboard (⌘⇧C)"
        aria-label="Copy structured markdown notes to clipboard"
      >
        {exportingType === 'notes' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" data-testid="spinner-copy-notes" />
        ) : (
          <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        )}
        {showLabels && <span>Copy Notes</span>}
        <kbd className="hidden sm:inline-block ml-1 px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-900 text-slate-600 dark:text-slate-400 text-[10px] font-mono font-medium">
          ⌘⇧C
        </kbd>
      </button>

      {/* Combined Copy */}
      <button
        type="button"
        data-testid="btn-copy-combined"
        onClick={handleCopyCombined}
        disabled={disabled || !hasImage || isBusy}
        className="flex items-center gap-1 p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer active:scale-95"
        title="Copy both composite image and notes"
        aria-label="Copy composite image and notes"
      >
        {exportingType === 'combined' ? (
          <Loader2 className="w-4 h-4 animate-spin" data-testid="spinner-copy-combined" />
        ) : (
          <Layers className="w-4 h-4" />
        )}
      </button>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-800 mx-0.5" />

      {/* Export PNG Download */}
      <button
        type="button"
        data-testid="btn-export-png"
        onClick={handleExportPng}
        disabled={disabled || !hasImage || isBusy}
        className="flex items-center gap-1 p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer active:scale-95"
        title="Download composite image as PNG"
        aria-label="Download PNG image"
      >
        {exportingType === 'png' ? (
          <Loader2 className="w-4 h-4 animate-spin" data-testid="spinner-export-png" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </button>

      {/* Export Markdown Download */}
      <button
        type="button"
        data-testid="btn-export-md"
        onClick={handleExportMarkdown}
        disabled={disabled || !hasAnnotations || isBusy}
        className="flex items-center gap-1 p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer active:scale-95"
        title="Download notes as Markdown file"
        aria-label="Download Markdown file"
      >
        {exportingType === 'md' ? (
          <Loader2 className="w-4 h-4 animate-spin" data-testid="spinner-export-md" />
        ) : (
          <FileDown className="w-4 h-4" />
        )}
      </button>

      {/* Save Annot8 spec */}
      <button
        type="button"
        data-testid="btn-save-spec"
        onClick={handleSaveSpec}
        disabled={disabled || !hasImage || isBusy}
        className="flex items-center gap-1 p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer active:scale-95"
        title="Save as an editable Annot8 spec (.annot8.json)"
        aria-label="Save Annot8 spec"
      >
        {exportingType === 'spec' ? (
          <Loader2 className="w-4 h-4 animate-spin" data-testid="spinner-save-spec" />
        ) : (
          <FileJson className="w-4 h-4" />
        )}
      </button>
    </div>
  );
};

export default ExportActions;
