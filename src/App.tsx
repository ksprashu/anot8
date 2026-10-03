import React, { useState, useCallback, useContext } from 'react';
import { AppProvider, useApp, AppContext } from './state/AppContext';
import { ThemeProvider, useTheme, ThemeContext } from './theme/ThemeContext';
import { CanvasWorkspace } from './components/canvas/CanvasWorkspace';
import { MainToolbar } from './components/toolbar/MainToolbar';
import { ColorPalette } from './components/toolbar/ColorPalette';
import { HistoryControls } from './components/toolbar/HistoryControls';
import { ZoomControls } from './components/toolbar/ZoomControls';
import { ImageActions } from './components/toolbar/ImageActions';
import { ExportActions, sanitizeBaseFilename } from './components/export/ExportActions';
import { ToastProvider, useToast, ToastContext } from './components/export/ToastNotification';
import { ReplaceImageModal } from './components/modals/ReplaceImageModal';
import { ShortcutsModal } from './components/modals/ShortcutsModal';
import { ThemeToggle } from './components/toolbar/ThemeToggle';
import { useClipboardPaste } from './hooks/useClipboardPaste';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { exportCompositeBlob } from './export/canvasExporter';
import { serializeAnnotationsToMarkdown } from './export/markdownSerializer';
import {
  writeImageToClipboard,
  writeTextToClipboard,
  downloadBlob,
  downloadTextFile,
} from './export/clipboard';
import { trackCopy } from './analytics/telemetry';
import { PanelRight, HelpCircle } from 'lucide-react';
import { NotesSidebar } from './components/sidebar/NotesSidebar';
import { PwaUpdatePrompt } from './components/pwa/PwaUpdatePrompt';
import { AppState } from './types';

export const AppContent: React.FC = () => {
  const { state, dispatch } = useApp();
  const { toggleTheme } = useTheme();
  const toast = useToast();
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  const {
    isReplaceModalOpen,
    pendingImage,
    replaceAndClearAnnotations,
    replaceAndKeepAnnotations,
    addAsLayer,
    confirmImageReplacement,
    cancelImageReplacement,
    openFilePicker,
    fileInputRef,
    handleFileInputChange,
    processImageBlob,
  } = useClipboardPaste({
    requireConfirmationIfAnnotated: true,
  });

  const handleCopyImage = useCallback(async () => {
    if (!state.image) return;
    trackCopy({ type: 'image_clipboard', annotationCount: state.annotations.length });
    try {
      const blob = await exportCompositeBlob(state.image, state.annotations, state.overlays);
      const res = await writeImageToClipboard(blob);
      if (res.success && !res.fallbackUsed) {
        toast.success('Copied image to clipboard!', 'Ready to paste into chat, PRs, or docs');
      } else {
        const baseName = sanitizeBaseFilename(state.image.fileName);
        downloadBlob(blob, `${baseName}-annotated.png`);
        toast.warning('Clipboard write not supported', 'Downloaded annotated PNG file instead');
      }
    } catch (err: any) {
      toast.error('Failed to copy image', err?.message);
    }
  }, [state.image, state.annotations, state.overlays, toast]);

  const handleCopyNotes = useCallback(async () => {
    if (state.annotations.length === 0) return;
    trackCopy({ type: 'notes_clipboard', annotationCount: state.annotations.length });
    try {
      const markdown = serializeAnnotationsToMarkdown(state.annotations, {
        imageFileName: state.image?.fileName,
      });
      const res = await writeTextToClipboard(markdown);
      if (res.success && !res.fallbackUsed) {
        toast.success('Copied notes to clipboard!', `${state.annotations.length} ordered items serialized`);
      } else {
        const baseName = sanitizeBaseFilename(state.image?.fileName);
        downloadTextFile(markdown, `${baseName}-notes.md`);
        toast.warning('Clipboard write not supported', 'Downloaded markdown notes file instead');
      }
    } catch (err: any) {
      toast.error('Failed to copy notes', err?.message);
    }
  }, [state.annotations, state.image, toast]);

  // Activate global keyboard shortcuts
  useKeyboardShortcuts({
    onCopyImage: handleCopyImage,
    onCopyNotes: handleCopyNotes,
    onToggleShortcutsModal: () => setIsShortcutsModalOpen((prev) => !prev),
    onToggleTheme: toggleTheme,
  });

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans select-none transition-colors duration-200">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml"
        onChange={handleFileInputChange}
        className="hidden"
        data-testid="global-image-file-input"
        aria-hidden="true"
      />

      {/* Top Application Header / Toolbar */}
      <header
        data-testid="app-header"
        className="min-h-14 h-auto border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-y-2 gap-x-2 bg-white/90 dark:bg-slate-900/80 backdrop-blur z-20 shrink-0 transition-colors duration-200"
      >
        {/* Left: Branding & History Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 order-1">
          <div
            data-testid="app-brand-logo"
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 flex items-center justify-center font-black text-slate-950 shadow-md shadow-amber-500/20 text-base select-none transition-transform hover:scale-105 tracking-tighter"
          >
            8
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span
              data-testid="app-brand-title"
              className="font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white"
            >
              Annot8
            </span>
            <span
              data-testid="app-brand-badge"
              className="hidden sm:inline-block text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold border border-amber-500/30"
            >
              Developer Canvas
            </span>
          </div>
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-0.5 sm:mx-1" />
          <HistoryControls />
        </div>

        {/* Right: Export Actions, ThemeToggle, Help & Sidebar Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 order-2 xl:order-3">
          <ExportActions />

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />

          {/* Theme Toggle Button */}
          <ThemeToggle />

          {/* Shortcuts Modal Help Button */}
          <button
            type="button"
            data-testid="shortcuts-help-btn"
            title="Keyboard Shortcuts (?)"
            aria-label="Open Keyboard Shortcuts Modal (?)"
            onClick={() => setIsShortcutsModalOpen(true)}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer active:scale-95 shadow-xs"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />

          {/* Sidebar Toggle Button */}
          <button
            type="button"
            data-testid="toggle-sidebar-button"
            title={state.isSidebarOpen ? 'Hide Notes Sidebar' : 'Show Notes Sidebar'}
            aria-label={state.isSidebarOpen ? 'Hide Notes Sidebar' : 'Show Notes Sidebar'}
            aria-expanded={state.isSidebarOpen}
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className={`relative p-2 rounded-lg border transition-all cursor-pointer active:scale-95 ${
              state.isSidebarOpen
                ? 'bg-amber-500/10 dark:bg-slate-800 text-amber-700 dark:text-amber-400 border-amber-500/40 shadow-xs'
                : 'bg-white hover:bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200 dark:hover:bg-slate-800 shadow-xs'
            }`}
          >
            <PanelRight className="w-4 h-4" />
            {state.annotations.length > 0 && (
              <span
                data-testid="sidebar-badge-count"
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center shadow"
              >
                {state.annotations.length}
              </span>
            )}
          </button>
        </div>

        {/* Center / Multi-Row: Annotation Tools, Styling Palette, Zoom & Image Actions */}
        <div
          data-testid="annotation-tools-container"
          className="flex flex-wrap items-center justify-center sm:justify-start xl:justify-center gap-1.5 sm:gap-2 py-0.5 order-3 xl:order-2 w-full xl:w-auto"
        >
          <MainToolbar />
          <ColorPalette />
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ZoomControls />
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
            <ImageActions onRequestUpload={openFilePicker} />
          </div>
        </div>
      </header>

      {/* Main Split-View Workspace */}
      <main className="flex-1 min-h-0 relative w-full overflow-hidden flex flex-row">
        {/* Left / Primary: Canvas Workspace */}
        <div className="flex-1 relative h-full overflow-hidden min-w-0">
          <CanvasWorkspace onImageDropped={(file) => processImageBlob(file, file.name)} />
        </div>

        {/* Right / Secondary: Synchronized Notes Sidebar */}
        <div data-testid="notes-sidebar-container" className="h-full flex flex-col shrink-0 z-10">
          <NotesSidebar />
        </div>
      </main>

      {/* Confirmation Modal when replacing an image with active annotations */}
      <ReplaceImageModal
        isOpen={isReplaceModalOpen && pendingImage !== null}
        annotationCount={state.annotations.length}
        onReplaceClear={replaceAndClearAnnotations}
        onReplaceKeep={replaceAndKeepAnnotations}
        onAddLayer={addAsLayer}
        onConfirm={confirmImageReplacement}
        onCancel={cancelImageReplacement}
      />

      <PwaUpdatePrompt />

      {/* Keyboard Shortcuts Cheat-Sheet Modal */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
};

export interface AppProps {
  initialState?: Partial<AppState>;
}

export const App: React.FC<AppProps> = ({ initialState }) => {
  const existingApp = useContext(AppContext);
  const existingTheme = useContext(ThemeContext);
  const existingToast = useContext(ToastContext);

  let content = <AppContent />;

  if (!existingToast) {
    content = <ToastProvider>{content}</ToastProvider>;
  }
  if (!existingApp) {
    content = <AppProvider initialState={initialState}>{content}</AppProvider>;
  }
  if (!existingTheme) {
    content = <ThemeProvider defaultTheme="dark">{content}</ThemeProvider>;
  }

  return content;
};

export default App;
