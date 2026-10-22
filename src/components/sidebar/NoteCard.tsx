import React, { useRef, useEffect } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { Annotation } from '../../types';
import { resolveColor } from '../../constants/colors';
import { useApp } from '../../state/AppContext';
import { MarkdownEditor } from './MarkdownEditor';
import { formatTimestamp, getShapeTypeMeta } from '../../utils/sidebar';

export interface NoteCardProps {
  annotation: Annotation;
  index: number;
  totalCount: number;
  isSelected?: boolean;
  isHovered?: boolean;
  onSelect?: (id: string) => void;
  onHover?: ((id: string | null) => void) | ((isEntering: boolean) => void);
  onDelete?: ((id: string) => void) | (() => void);
  onMoveUp?: ((fromIndex: number) => void) | (() => void);
  onMoveDown?: ((fromIndex: number) => void) | (() => void);
  onNoteChange?: (id: string, note: string) => void;
  className?: string;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  annotation,
  index,
  totalCount,
  isSelected: explicitSelected,
  isHovered: explicitHovered,
  onSelect,
  onHover,
  onDelete,
  onMoveUp,
  onMoveDown,
  onNoteChange,
  className = '',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  let appState = null;
  let appDispatch = null;
  try {
    const app = useApp();
    appState = app.state;
    appDispatch = app.dispatch;
  } catch {
    // Gracefully handle rendering outside AppProvider in isolated component tests
  }

  const isSelected =
    explicitSelected ?? (appState ? appState.selectedAnnotationId === annotation.id : false);
  const isHovered =
    explicitHovered ?? (appState ? appState.hoveredAnnotationId === annotation.id : false);

  // Smooth scroll into view when hovered from canvas
  useEffect(() => {
    if (isHovered && cardRef.current) {
      if (typeof cardRef.current.scrollIntoView === 'function') {
        cardRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        });
      }
    }
  }, [isHovered]);

  const colorDef = resolveColor(annotation.style.color);
  const shapeMeta = getShapeTypeMeta(annotation.geometry.type);
  const ShapeIcon = shapeMeta.icon;
  const timeString = formatTimestamp(annotation.updatedAt || annotation.createdAt);

  const isFirst = index <= 1;
  const isLast = index >= totalCount;

  // Selection Handler
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('textarea') || target.closest('[data-interactive]')) {
      return;
    }
    if (onSelect) {
      onSelect(annotation.id);
    } else if (appDispatch) {
      appDispatch({ type: 'SELECT_ANNOTATION', payload: annotation.id });
    }
  };

  // Hover Handlers
  const handlePointerEnter = () => {
    if (onHover) {
      (onHover as (id: string | null) => void)(annotation.id);
    } else if (appDispatch) {
      appDispatch({ type: 'HOVER_ANNOTATION', payload: annotation.id });
    }
  };

  const handlePointerLeave = () => {
    if (onHover) {
      (onHover as (id: string | null) => void)(null);
    } else if (appDispatch) {
      appDispatch({ type: 'HOVER_ANNOTATION', payload: null });
    }
  };

  // Reorder Handlers
  const handleMoveUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFirst) return;
    const fromIdx = index - 1;
    const toIdx = fromIdx - 1;
    if (onMoveUp) {
      try {
        (onMoveUp as (fromIndex: number) => void)(fromIdx);
      } catch {
        (onMoveUp as () => void)();
      }
    } else if (appDispatch) {
      appDispatch({ type: 'REORDER_ANNOTATIONS', payload: { fromIndex: fromIdx, toIndex: toIdx } });
    }
  };

  const handleMoveDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLast) return;
    const fromIdx = index - 1;
    const toIdx = fromIdx + 1;
    if (onMoveDown) {
      try {
        (onMoveDown as (fromIndex: number) => void)(fromIdx);
      } catch {
        (onMoveDown as () => void)();
      }
    } else if (appDispatch) {
      appDispatch({ type: 'REORDER_ANNOTATIONS', payload: { fromIndex: fromIdx, toIndex: toIdx } });
    }
  };

  // Delete Handler
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      try {
        (onDelete as (id: string) => void)(annotation.id);
      } catch {
        (onDelete as () => void)();
      }
    } else if (appDispatch) {
      appDispatch({ type: 'DELETE_ANNOTATION', payload: { id: annotation.id } });
    }
  };

  // Note Change Handler
  const handleNoteChange = (newNote: string) => {
    if (onNoteChange) {
      onNoteChange(annotation.id, newNote);
    } else if (appDispatch) {
      appDispatch({
        type: 'UPDATE_ANNOTATION_NOTE',
        payload: { id: annotation.id, note: newNote },
      });
    }
  };

  return (
    <div
      ref={cardRef}
      data-testid={`note-card-${annotation.id}`}
      data-annotation-id={annotation.id}
      data-index={index}
      data-is-selected={isSelected ? 'true' : 'false'}
      data-is-hovered={isHovered ? 'true' : 'false'}
      onClick={handleCardClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      className={`rounded-lg border transition-all duration-150 overflow-hidden text-slate-800 dark:text-slate-200 ${
        isSelected
          ? 'bg-amber-50/30 dark:bg-slate-900 border-amber-500/80 ring-2 ring-amber-500/50 shadow-md'
          : isHovered
          ? 'bg-slate-50 dark:bg-slate-900/90 border-slate-300 dark:border-slate-600 ring-2 ring-amber-500/30 dark:ring-amber-500/40 shadow-xs'
          : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700'
      } ${className}`}
    >
      {/* Header Row */}
      <div
        data-testid={`note-card-header-${annotation.id}`}
        className="px-3 py-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/40 select-none cursor-pointer"
      >
        {/* Left: Sequence Badge + Shape Tag + Timestamp */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Sequence Badge */}
          <span
            data-testid={`note-card-badge-${index}`}
            className="flex items-center justify-center font-bold text-xs shrink-0 rounded-full transition-transform"
            style={{
              backgroundColor: colorDef.badgeBg,
              color: colorDef.badgeText,
              minWidth: '1.375rem',
              height: '1.375rem',
              paddingLeft: index >= 10 ? '0.375rem' : '0',
              paddingRight: index >= 10 ? '0.375rem' : '0',
            }}
            title={`Annotation #${index} (${colorDef.name})`}
          >
            <span data-testid={`card-badge-${annotation.id}`}>{index}</span>
          </span>

          {/* Shape Type Tag */}
          <span
            data-testid={`note-card-type-${annotation.id}`}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border shrink-0 ${shapeMeta.badgeStyle}`}
            title={`Shape: ${shapeMeta.label}`}
          >
            <ShapeIcon className="w-3 h-3" />
            <span>{shapeMeta.label}</span>
          </span>

          {/* Timestamp */}
          {timeString && (
            <span
              data-testid={`note-card-time-${annotation.id}`}
              className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate hidden sm:inline"
              title={new Date(annotation.updatedAt || annotation.createdAt).toISOString()}
            >
              {timeString}
            </span>
          )}
        </div>

        {/* Right: Reorder & Delete Action Buttons */}
        <div
          data-testid={`note-card-actions-${annotation.id}`}
          className="flex items-center gap-0.5 shrink-0"
        >
          {/* Move Up */}
          <button
            type="button"
            data-testid={`note-card-move-up-${index}`}
            onClick={handleMoveUp}
            disabled={isFirst}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer active:scale-95"
            title="Move up"
            aria-label={`Move annotation #${index} up`}
          >
            <span data-testid={`btn-move-up-${annotation.id}`} className="contents">
              <span data-testid={`reorder-up-${annotation.id}`} className="contents">
                <ChevronUp className="w-3.5 h-3.5" />
              </span>
            </span>
          </button>

          {/* Move Down */}
          <button
            type="button"
            data-testid={`note-card-move-down-${index}`}
            onClick={handleMoveDown}
            disabled={isLast}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer active:scale-95"
            title="Move down"
            aria-label={`Move annotation #${index} down`}
          >
            <span data-testid={`btn-move-down-${annotation.id}`} className="contents">
              <span data-testid={`reorder-down-${annotation.id}`} className="contents">
                <ChevronDown className="w-3.5 h-3.5" />
              </span>
            </span>
          </button>

          {/* Delete */}
          <button
            type="button"
            data-testid={`note-card-delete-${index}`}
            onClick={handleDelete}
            className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-0.5 cursor-pointer active:scale-95"
            title="Delete annotation"
            aria-label={`Delete annotation #${index}`}
          >
            <span data-testid={`btn-delete-${annotation.id}`} className="contents">
              <span data-testid={`delete-annotation-${annotation.id}`} className="contents">
                <Trash2 className="w-3.5 h-3.5" />
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Body: Embedded Markdown Editor */}
      <div data-testid={`note-card-body-${annotation.id}`} className="p-2.5">
        <MarkdownEditor
          value={annotation.note}
          onChange={handleNoteChange}
          annotationId={annotation.id}
          placeholder="Add markdown note (e.g. # Issue, **fix**, `code`)..."
        />
      </div>
    </div>
  );
};

export default NoteCard;
