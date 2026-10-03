import React from 'react';
import { Point } from '../../types';

export interface AnnotationDeleteButtonProps {
  position: Point;
  scale?: number;
  annotationId: string;
  onDelete?: (id: string) => void;
}

export const AnnotationDeleteButton: React.FC<AnnotationDeleteButtonProps> = ({
  position,
  scale = 1.0,
  annotationId,
  onDelete,
}) => {
  const safeScale = typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1.0;
  const radius = Math.max(9, Math.round(9 * safeScale));
  const iconOffset = Math.round(radius * 0.42);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDelete && annotationId) {
      onDelete(annotationId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.stopPropagation();
    e.preventDefault();
    if (onDelete && annotationId) {
      onDelete(annotationId);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <g
      data-testid="annotation-delete-btn"
      data-annotation-id={annotationId}
      className="cursor-pointer select-none transition-transform duration-150 ease-out hover:scale-110 active:scale-95"
      style={{
        transformOrigin: `${position.x}px ${position.y}px`,
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      role="button"
      aria-label="Delete annotation"
      tabIndex={0}
    >
      {/* Outer contrast drop shadow ring */}
      <circle
        cx={position.x}
        cy={position.y}
        r={radius + 1.5 * safeScale}
        fill="rgba(0, 0, 0, 0.4)"
      />
      {/* Red circular button */}
      <circle
        cx={position.x}
        cy={position.y}
        r={radius}
        fill="#ef4444"
        stroke="#ffffff"
        strokeWidth={Math.max(1.5, 1.5 * safeScale)}
        className="transition-colors hover:fill-red-600"
      />
      {/* 'X' cross icon lines */}
      <line
        x1={position.x - iconOffset}
        y1={position.y - iconOffset}
        x2={position.x + iconOffset}
        y2={position.y + iconOffset}
        stroke="#ffffff"
        strokeWidth={Math.max(1.8, 1.8 * safeScale)}
        strokeLinecap="round"
      />
      <line
        x1={position.x - iconOffset}
        y1={position.y + iconOffset}
        x2={position.x + iconOffset}
        y2={position.y - iconOffset}
        stroke="#ffffff"
        strokeWidth={Math.max(1.8, 1.8 * safeScale)}
        strokeLinecap="round"
      />
    </g>
  );
};

export default AnnotationDeleteButton;
