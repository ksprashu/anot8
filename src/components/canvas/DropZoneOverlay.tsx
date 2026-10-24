import React, { useState, useRef, useCallback } from 'react';
import { ArrowDownToLine, FolderOpen } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { decodeImageFile } from '../toolbar/ImageActions';
import { useDragReset } from '../../hooks/useDragReset';

export interface DropZoneOverlayProps {
  className?: string;
  onFileDrop?: (file: File) => void;
  onFileSelect?: (file: File) => void;
  disabled?: boolean;
}

export const DropZoneOverlay: React.FC<DropZoneOverlayProps> = ({
  className = '',
  onFileDrop,
  onFileSelect,
  disabled = false,
}) => {
  const { state, dispatch } = useApp();
  const { image } = state;
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useDragReset(() => {
    dragCounterRef.current = 0;
    setIsDragOver(false);
  });

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || '');
  const pasteShortcut = isMac ? '⌘V' : 'Ctrl+V';
  const screenshotShortcut = isMac ? '⌘⇧4 / ⌘⌃⇧4' : 'Win+Shift+S / PrtScn';

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      dragCounterRef.current += 1;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      e.dataTransfer.dropEffect = 'copy';
      if (!isDragOver) {
        setIsDragOver(true);
      }
    },
    [disabled, isDragOver]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragOver(false);
      }
    },
    [disabled]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (disabled) return;

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const imageFile = Array.from(files).find(
        (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.name)
      );
      if (!imageFile) return;

      if (onFileDrop) {
        onFileDrop(imageFile);
      } else {
        try {
          const loadedImage = await decodeImageFile(imageFile);
          dispatch({ type: 'SET_IMAGE', payload: loadedImage });
        } catch (err) {
          console.error('Drop image loading error:', err);
        }
      }
    },
    [disabled, onFileDrop, dispatch]
  );

  const handleBrowseClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    if (onFileSelect) {
      onFileSelect(file);
    } else {
      try {
        const loadedImage = await decodeImageFile(file);
        dispatch({ type: 'SET_IMAGE', payload: loadedImage });
      } catch (err) {
        console.error('File picker loading error:', err);
      }
    }
    e.target.value = '';
  };

  // If an image is already loaded and user is NOT dragging, do not render overlay
  if (image !== null && !isDragOver) {
    return null;
  }

  // Active Drag-Over Overlay State
  if (isDragOver) {
    return (
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`absolute inset-0 z-50 flex items-center justify-center p-8 bg-slate-950/85 backdrop-blur-md border-4 border-dashed border-amber-400 transition-all ${className}`}
        data-testid="dropzone-active-dragover"
        role="region"
        aria-label="Drop image zone"
      >
        <div className="flex flex-col items-center text-center max-w-lg pointer-events-none">
          <div className="w-20 h-20 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center mb-6 text-amber-400 animate-bounce shadow-lg shadow-amber-500/10">
            <ArrowDownToLine className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {image ? 'Drop to replace image' : 'Drop image to load into canvas'}
          </h2>
          <p className="text-sm text-slate-300 font-medium">
            Supports PNG, JPEG, WebP, SVG, and high-DPI retina screenshots
          </p>
        </div>
      </div>
    );
  }

  // Default Empty State (No Image Loaded)
  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`absolute inset-0 z-30 flex items-center justify-center p-6 bg-slate-950/60 ${className}`}
      data-testid="dropzone-empty-state"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml"
        onChange={handleFileInputChange}
        className="hidden"
        data-testid="dropzone-file-input"
        aria-hidden="true"
      />

      <div className="flex flex-col items-center text-center max-w-lg w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl transition-all">
        {/* Brand Icon Header */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-3xl text-slate-950 mb-6 shadow-lg shadow-amber-500/20 tracking-tighter">
          8
        </div>

        {/* Primary Prompt */}
        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
          Paste screenshot or drop image
        </h1>
        <p className="text-sm text-slate-400 mb-6 max-w-sm">
          Anot8 gives developers instant visual annotation, auto-numbering, and synchronized markdown notes.
        </p>

        {/* Prominent Keyboard Paste Badge */}
        <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 rounded-xl px-5 py-3.5 mb-6 w-full justify-center shadow-inner group">
          <kbd
            className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-400 font-mono font-bold text-base tracking-wide shadow-sm"
            data-testid="paste-shortcut-badge"
          >
            {pasteShortcut}
          </kbd>
          <span className="text-sm text-slate-300 font-medium">
            Paste directly from clipboard
          </span>
        </div>

        {/* Secondary Drag & Drop / File Picker Action */}
        <div className="flex items-center gap-3 w-full my-1">
          <div className="h-[1px] bg-slate-800 flex-1" />
          <span className="text-xs uppercase text-slate-500 font-semibold tracking-wider">or</span>
          <div className="h-[1px] bg-slate-800 flex-1" />
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
          <button
            type="button"
            onClick={handleBrowseClick}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-sm font-medium text-slate-200 hover:text-white transition-all shadow-sm hover:shadow"
            data-testid="browse-files-btn"
          >
            <FolderOpen className="w-4 h-4 text-amber-400" />
            <span>Browse Files</span>
          </button>
        </div>

        {/* Format Badges & Tips */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 w-full flex flex-col items-center gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">PNG</span>
            <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">JPEG</span>
            <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">WebP</span>
            <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">SVG</span>
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">1:1 Native Resolution</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Tip: Press <span className="font-mono text-slate-300">{screenshotShortcut}</span> to snap a screenshot and paste directly.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DropZoneOverlay;
