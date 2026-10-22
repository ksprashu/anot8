import React, { useMemo } from 'react';
import { Annotation, AnnotationColor, Point } from '../../types';
import { getBadgePositionForShape, getBadgeDimensions } from '../../math/badges';
import { resolveColor } from '../../constants/colors';
import { useApp } from '../../state/AppContext';

export interface BadgeRendererProps {
  annotation?: Annotation;
  index?: number;
  position?: Point;
  color?: AnnotationColor;
  isSelected?: boolean;
  isHovered?: boolean;
  isDraft?: boolean;
  scale?: number;
  zoom?: number;
  onClick?: (e: React.MouseEvent) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

export const BadgeRenderer: React.FC<BadgeRendererProps> = ({
  annotation,
  index: explicitIndex,
  position: explicitPosition,
  color: explicitColor,
  isSelected: explicitSelected,
  isHovered: explicitHovered,
  isDraft = false,
  scale = 1.0,
  zoom: _zoom = 1.0,
  onClick,
  onPointerEnter,
  onPointerLeave,
}) => {
  let appState = null;
  let appDispatch = null;
  try {
    const app = useApp();
    appState = app.state;
    appDispatch = app.dispatch;
  } catch {
    // Rendered outside AppProvider in isolated unit tests
  }

  const safeScale = typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1.0;
  const scaledOffset = Math.round(3 * safeScale);

  const index = annotation?.index ?? explicitIndex ?? 1;
  const colorDef = resolveColor(annotation?.style.color ?? explicitColor ?? 'amber');

  const isSelected =
    explicitSelected ?? (annotation && appState ? appState.selectedAnnotationId === annotation.id : false);
  const isHovered =
    explicitHovered ?? (annotation && appState ? appState.hoveredAnnotationId === annotation.id : false);

  const anchor = useMemo<Point>(() => {
    if (explicitPosition) return explicitPosition;
    if (annotation) return getBadgePositionForShape(annotation.geometry, safeScale);
    return { x: 0, y: 0 };
  }, [explicitPosition, annotation, safeScale]);

  const dims = useMemo(() => getBadgeDimensions(index, safeScale), [index, safeScale]);
  const { width, height, radius, isPill, fontSize } = dims;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick(e);
    } else if (annotation && appDispatch) {
      appDispatch({ type: 'SELECT_ANNOTATION', payload: annotation.id });
    }
  };

  const handlePointerEnter = () => {
    if (onPointerEnter) {
      onPointerEnter();
    } else if (annotation && appDispatch) {
      appDispatch({ type: 'HOVER_ANNOTATION', payload: annotation.id });
    }
  };

  const handlePointerLeave = () => {
    if (onPointerLeave) {
      onPointerLeave();
    } else if (annotation && appDispatch) {
      appDispatch({ type: 'HOVER_ANNOTATION', payload: null });
    }
  };

  return (
    <g
      data-testid={`annotation-badge-${index}`}
      data-annotation-id={annotation?.id}
      className={isDraft ? 'pointer-events-none select-none' : 'cursor-pointer transition-transform duration-150 ease-out'}
      style={{
        transformOrigin: `${anchor.x}px ${anchor.y}px`,
        transform: isHovered ? 'scale(1.15)' : 'scale(1)',
      }}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onMouseEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onMouseLeave={handlePointerLeave}
      opacity={isDraft ? 0.85 : 1.0}
    >
      <g data-testid="shape-badge">
        {/* Outer Selection Highlight Ring */}
        {isSelected && (
          <>
            {isPill ? (
              <rect
                data-testid={`badge-selection-ring-${index}`}
                x={anchor.x - (width + scaledOffset * 2) / 2}
                y={anchor.y - (height + scaledOffset * 2) / 2}
                width={width + scaledOffset * 2}
                height={height + scaledOffset * 2}
                rx={radius + scaledOffset}
                ry={radius + scaledOffset}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={Math.max(1.5, 2 * safeScale)}
                strokeDasharray={`${scaledOffset} ${scaledOffset}`}
                opacity={0.9}
              />
            ) : (
              <circle
                data-testid={`badge-selection-ring-${index}`}
                cx={anchor.x}
                cy={anchor.y}
                r={radius + scaledOffset}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={Math.max(1.5, 2 * safeScale)}
                strokeDasharray={`${scaledOffset} ${scaledOffset}`}
                opacity={0.9}
              />
            )}
          </>
        )}

        {/* Main Badge Background Shape */}
        {isPill ? (
          <rect
            data-testid={`badge-shape-${index}`}
            x={anchor.x - width / 2}
            y={anchor.y - height / 2}
            width={width}
            height={height}
            rx={radius}
            ry={radius}
            fill={colorDef.badgeBg}
            stroke="#ffffff"
            strokeWidth={Math.max(1, 1.5 * safeScale)}
            filter="url(#badge-drop-shadow)"
          />
        ) : (
          <circle
            data-testid={`badge-shape-${index}`}
            cx={anchor.x}
            cy={anchor.y}
            r={radius}
            fill={colorDef.badgeBg}
            stroke="#ffffff"
            strokeWidth={Math.max(1, 1.5 * safeScale)}
            filter="url(#badge-drop-shadow)"
          />
        )}

        {/* Badge Sequence Index Number */}
        <text
          data-testid={`badge-text-${index}`}
          x={anchor.x}
          y={anchor.y}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colorDef.badgeText}
          fontSize={fontSize}
          fontWeight="700"
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          className="select-none pointer-events-none"
        >
          {index}
        </text>
      </g>
    </g>
  );
};

export default BadgeRenderer;
