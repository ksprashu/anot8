import React, { useCallback } from 'react';
import { useApp } from '../../state/AppContext';
import { NoteCard } from './NoteCard';
import { EmptySidebarState } from './EmptySidebarState';
import {
  FileText,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

export interface NotesSidebarProps {
  isOpen?: boolean;
  onToggleOpen?: () => void;
  className?: string;
  onSelectAnnotation?: (id: string) => void;
  onHoverAnnotation?: ((id: string | null) => void) | ((isEntering: boolean) => void);
  onDeleteAnnotation?: (id: string) => void;
  onMoveUpAnnotation?: (id: string, index: number) => void;
  onMoveDownAnnotation?: (id: string, index: number) => void;
}

export const NotesSidebar: React.FC<NotesSidebarProps> = ({
  isOpen: explicitIsOpen,
  onToggleOpen: explicitOnToggleOpen,
  className = '',
  onSelectAnnotation,
  onHoverAnnotation,
  onDeleteAnnotation,
  onMoveUpAnnotation,
  onMoveDownAnnotation,
}) => {
  let appState = null;
  let appDispatch = null;
  try {
    const app = useApp();
    appState = app.state;
    appDispatch = app.dispatch;
  } catch {
    // Isolated tests
  }

  const allAnnotations = appState ? appState.annotations : [];
  // Only annotatable callouts (box, ellipse, arrow, pin) appear as notes in the sidebar
  const annotations = allAnnotations.filter(
    (ann) => ann.geometry.type !== 'highlight' && ann.geometry.type !== 'blur'
  );
  const selectedAnnotationId = appState ? appState.selectedAnnotationId : null;
  const hoveredAnnotationId = appState ? appState.hoveredAnnotationId : null;
  const stateIsOpen = appState ? appState.isSidebarOpen : true;

  const isSidebarOpen = explicitIsOpen ?? stateIsOpen;

  const handleToggle = useCallback(() => {
    if (explicitOnToggleOpen) {
      explicitOnToggleOpen();
    } else if (appDispatch) {
      appDispatch({ type: 'TOGGLE_SIDEBAR' });
    }
  }, [explicitOnToggleOpen, appDispatch]);

  const handleSelect = useCallback(
    (id: string) => {
      if (onSelectAnnotation) {
        onSelectAnnotation(id);
      } else if (appDispatch) {
        appDispatch({ type: 'SELECT_ANNOTATION', payload: id });
      }
    },
    [onSelectAnnotation, appDispatch]
  );

  const handleHover = useCallback(
    (id: string | null) => {
      if (onHoverAnnotation) {
        try {
          (onHoverAnnotation as (id: string | null) => void)(id);
        } catch {
          (onHoverAnnotation as (isEntering: boolean) => void)(Boolean(id));
        }
      } else if (appDispatch) {
        appDispatch({ type: 'HOVER_ANNOTATION', payload: id });
      }
    },
    [onHoverAnnotation, appDispatch]
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (onDeleteAnnotation) {
        onDeleteAnnotation(id);
      } else if (appDispatch) {
        appDispatch({ type: 'DELETE_ANNOTATION', payload: { id } });
      }
    },
    [onDeleteAnnotation, appDispatch]
  );

  const handleMoveUp = useCallback(
    (id: string, currentArrayIdx: number) => {
      if (currentArrayIdx <= 0) return;
      if (onMoveUpAnnotation) {
        onMoveUpAnnotation(id, currentArrayIdx);
      } else if (appDispatch) {
        // Visible indices skip highlight/blur effects, so resolve positions in the full list.
        appDispatch({
          type: 'REORDER_ANNOTATIONS',
          payload: {
            fromIndex: allAnnotations.findIndex((a) => a.id === id),
            toIndex: allAnnotations.findIndex((a) => a.id === annotations[currentArrayIdx - 1].id),
          },
        });
      }
    },
    [allAnnotations, annotations, onMoveUpAnnotation, appDispatch]
  );

  const handleMoveDown = useCallback(
    (id: string, currentArrayIdx: number) => {
      if (currentArrayIdx >= annotations.length - 1) return;
      if (onMoveDownAnnotation) {
        onMoveDownAnnotation(id, currentArrayIdx);
      } else if (appDispatch) {
        appDispatch({
          type: 'REORDER_ANNOTATIONS',
          payload: {
            fromIndex: allAnnotations.findIndex((a) => a.id === id),
            toIndex: allAnnotations.findIndex((a) => a.id === annotations[currentArrayIdx + 1].id),
          },
        });
      }
    },
    [allAnnotations, annotations, onMoveDownAnnotation, appDispatch]
  );

  // If sidebar is collapsed, render compact rail with expand button
  if (!isSidebarOpen) {
    return (
      <aside
        data-testid="notes-sidebar-collapsed"
        aria-label="Annotation notes sidebar collapsed"
        className={`w-12 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col items-center py-4 justify-between transition-all duration-200 ease-in-out shrink-0 select-none z-10 ${className}`}
      >
        <button
          type="button"
          data-testid="sidebar-expand-btn"
          onClick={handleToggle}
          title="Expand notes sidebar"
          aria-label="Expand notes sidebar"
          aria-expanded={false}
          className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 border border-slate-200 dark:border-slate-700 hover:border-amber-500/50 transition flex flex-col items-center gap-1 shadow-xs cursor-pointer active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
          <FileText className="w-4 h-4" />
        </button>

        {annotations.length > 0 && (
          <div
            data-testid="sidebar-collapsed-badge"
            title={`${annotations.length} annotations`}
            className="w-7 h-7 rounded-full bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 text-xs font-bold font-mono flex items-center justify-center shadow-inner"
          >
            {annotations.length}
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside
      data-testid="notes-sidebar"
      role="complementary"
      aria-label="Annotation notes sidebar"
      className={`w-80 md:w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full shrink-0 transition-all duration-200 ease-in-out select-none z-10 ${className}`}
    >
      {/* Sidebar Header */}
      <header
        data-testid="sidebar-header"
        className="h-14 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur shrink-0"
      >
        <div className="flex items-center gap-2.5">
          <FileText className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          <h2
            data-testid="sidebar-title"
            className="font-semibold text-sm tracking-tight text-slate-900 dark:text-white"
          >
            Annotation Notes
          </h2>
          <span
            data-testid="sidebar-count-badge"
            aria-label={`${annotations.length} annotations`}
            className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-amber-700 dark:text-amber-400 text-xs font-mono font-medium border border-slate-200 dark:border-slate-700/80 shadow-inner"
          >
            {annotations.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="sidebar-collapse-btn"
            onClick={handleToggle}
            title="Collapse notes sidebar"
            aria-label="Collapse notes sidebar"
            aria-expanded={true}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition cursor-pointer active:scale-95"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content: Notes List or Empty State */}
      <div
        data-testid="sidebar-content"
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 custom-scrollbar"
      >
        {annotations.length === 0 ? (
          <EmptySidebarState />
        ) : (
          <div data-testid="sidebar-notes-list" className="space-y-3">
            {annotations.map((ann, arrayIdx) => (
              <NoteCard
                key={ann.id}
                annotation={ann}
                index={ann.index}
                totalCount={annotations.length}
                isSelected={ann.id === selectedAnnotationId}
                isHovered={ann.id === hoveredAnnotationId}
                onSelect={() => handleSelect(ann.id)}
                onHover={(val: string | null | boolean) => handleHover(typeof val === 'string' || val === null ? val : val ? ann.id : null)}
                onDelete={() => handleDelete(ann.id)}
                onMoveUp={() => handleMoveUp(ann.id, arrayIdx)}
                onMoveDown={() => handleMoveDown(ann.id, arrayIdx)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

export default NotesSidebar;
