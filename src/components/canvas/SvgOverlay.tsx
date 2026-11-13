import React, { useRef, useState, useCallback } from 'react';
import { useApp } from '../../state/AppContext';
import { isAnnotatableGeometry } from '../../state/appReducer';
import {
  Point,
  AnnotationGeometry,
  HighlightGeometry,
  BlurGeometry,
} from '../../types';
import {
  normalizeBox,
  calculateEllipseBounds,
  translateGeometry,
} from '../../math/geometry';
import { computeResolutionScale } from '../../math/badges';
import { ShapeRenderer } from './ShapeRenderer';
import { TransformHandles } from './TransformHandles';
import { trackAnnotate } from '../../analytics/telemetry';

export interface SvgOverlayProps {
  className?: string;
}

export interface DrawingState {
  isDrawing: boolean;
  startPoint: Point;
  currentPoint: Point;
  draftGeometry: AnnotationGeometry | null;
  pointerId: number | null;
}

interface DragMoveState {
  isDragging: boolean;
  annotationId: string | null;
  startPoint: Point;
  startGeometry: AnnotationGeometry | null;
  pointerId: number | null;
}

export const SvgOverlay: React.FC<SvgOverlayProps> = ({ className = '' }) => {
  const { state, dispatch, txManager, commitGesture } = useApp();
  const {
    image,
    activeTool,
    activeColor,
    activeStrokeWidth,
    activeFillOpacity,
    annotations,
    selectedAnnotationId,
    hoveredAnnotationId,
  } = state;

  const resolutionScale = image
    ? computeResolutionScale(image.naturalWidth, image.naturalHeight)
    : 1.0;
  const zoom = state.viewport?.zoom ?? 1.0;

  const svgRef = useRef<SVGSVGElement>(null);

  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    startPoint: { x: 0, y: 0 },
    currentPoint: { x: 0, y: 0 },
    draftGeometry: null,
    pointerId: null,
  });

  const [dragMoveState, setDragMoveState] = useState<DragMoveState>({
    isDragging: false,
    annotationId: null,
    startPoint: { x: 0, y: 0 },
    startGeometry: null,
    pointerId: null,
  });

  const getNativeCoordinates = useCallback(
    (e: React.PointerEvent | PointerEvent): Point => {
      if (!svgRef.current || !image) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };

      const scaleX = rect.width / image.naturalWidth;
      const scaleY = rect.height / image.naturalHeight;
      const rawX = (e.clientX - rect.left) / scaleX;
      const rawY = (e.clientY - rect.top) / scaleY;

      return {
        x: Math.max(0, Math.min(rawX, image.naturalWidth)),
        y: Math.max(0, Math.min(rawY, image.naturalHeight)),
      };
    },
    [image]
  );

  const isDrawingTool = ['box', 'ellipse', 'arrow', 'pin', 'highlight', 'blur'].includes(activeTool);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!image || e.button !== 0) return;

    if (isDrawingTool) {
      const startPoint = getNativeCoordinates(e);

      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch (_err) {
        // Pointer capture unsupported in test environments
      }

      let initialDraft: AnnotationGeometry;
      switch (activeTool) {
        case 'box':
          initialDraft = { type: 'box', x: startPoint.x, y: startPoint.y, width: 0, height: 0 };
          break;
        case 'highlight':
          initialDraft = { type: 'highlight', x: startPoint.x, y: startPoint.y, width: 0, height: 0 };
          break;
        case 'blur':
          initialDraft = { type: 'blur', x: startPoint.x, y: startPoint.y, width: 0, height: 0 };
          break;
        case 'ellipse':
          initialDraft = { type: 'ellipse', cx: startPoint.x, cy: startPoint.y, rx: 0, ry: 0 };
          break;
        case 'arrow':
          initialDraft = { type: 'arrow', startX: startPoint.x, startY: startPoint.y, endX: startPoint.x, endY: startPoint.y };
          break;
        case 'pin':
          initialDraft = { type: 'pin', x: startPoint.x, y: startPoint.y };
          break;
        default:
          return;
      }

      if (selectedAnnotationId !== null) {
        dispatch({ type: 'SELECT_ANNOTATION', payload: null });
      }

      setDrawingState({
        isDrawing: true,
        startPoint,
        currentPoint: startPoint,
        draftGeometry: initialDraft,
        pointerId: e.pointerId,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!image) return;

    // 1. Drawing Drag
    if (drawingState.isDrawing && e.pointerId === drawingState.pointerId) {
      const currentPoint = getNativeCoordinates(e);
      let updatedDraft: AnnotationGeometry;

      switch (activeTool) {
        case 'box': {
          let box = normalizeBox(drawingState.startPoint, currentPoint);
          if (e.shiftKey) {
            const side = Math.max(box.width, box.height);
            const signX = currentPoint.x >= drawingState.startPoint.x ? 1 : -1;
            const signY = currentPoint.y >= drawingState.startPoint.y ? 1 : -1;
            box = {
              type: 'box',
              x: signX === 1 ? drawingState.startPoint.x : drawingState.startPoint.x - side,
              y: signY === 1 ? drawingState.startPoint.y : drawingState.startPoint.y - side,
              width: side,
              height: side,
            };
          }
          updatedDraft = box;
          break;
        }
        case 'highlight': {
          let box = normalizeBox(drawingState.startPoint, currentPoint);
          if (e.shiftKey) {
            const side = Math.max(box.width, box.height);
            const signX = currentPoint.x >= drawingState.startPoint.x ? 1 : -1;
            const signY = currentPoint.y >= drawingState.startPoint.y ? 1 : -1;
            box = {
              type: 'box',
              x: signX === 1 ? drawingState.startPoint.x : drawingState.startPoint.x - side,
              y: signY === 1 ? drawingState.startPoint.y : drawingState.startPoint.y - side,
              width: side,
              height: side,
            };
          }
          updatedDraft = {
            type: 'highlight',
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          };
          break;
        }
        case 'blur': {
          let box = normalizeBox(drawingState.startPoint, currentPoint);
          if (e.shiftKey) {
            const side = Math.max(box.width, box.height);
            const signX = currentPoint.x >= drawingState.startPoint.x ? 1 : -1;
            const signY = currentPoint.y >= drawingState.startPoint.y ? 1 : -1;
            box = {
              type: 'box',
              x: signX === 1 ? drawingState.startPoint.x : drawingState.startPoint.x - side,
              y: signY === 1 ? drawingState.startPoint.y : drawingState.startPoint.y - side,
              width: side,
              height: side,
            };
          }
          updatedDraft = {
            type: 'blur',
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          };
          break;
        }
        case 'ellipse': {
          updatedDraft = calculateEllipseBounds(drawingState.startPoint, currentPoint, e.shiftKey);
          break;
        }
        case 'arrow': {
          let endX = currentPoint.x;
          let endY = currentPoint.y;
          if (e.shiftKey) {
            const dx = endX - drawingState.startPoint.x;
            const dy = endY - drawingState.startPoint.y;
            const length = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
            endX = drawingState.startPoint.x + length * Math.cos(snapped);
            endY = drawingState.startPoint.y + length * Math.sin(snapped);
          }
          updatedDraft = {
            type: 'arrow',
            startX: drawingState.startPoint.x,
            startY: drawingState.startPoint.y,
            endX,
            endY,
          };
          break;
        }
        case 'pin': {
          updatedDraft = {
            type: 'pin',
            x: currentPoint.x,
            y: currentPoint.y,
          };
          break;
        }
        default:
          return;
      }

      setDrawingState((prev) => ({
        ...prev,
        currentPoint,
        draftGeometry: updatedDraft,
      }));
      return;
    }

    // 2. Shape Body Translation Drag
    if (dragMoveState.isDragging && dragMoveState.startGeometry && dragMoveState.annotationId) {
      const currentPoint = getNativeCoordinates(e);
      const deltaX = currentPoint.x - dragMoveState.startPoint.x;
      const deltaY = currentPoint.y - dragMoveState.startPoint.y;

      const translated = translateGeometry(dragMoveState.startGeometry, deltaX, deltaY);
      dispatch({
        type: 'UPDATE_ANNOTATION_GEOMETRY',
        payload: {
          id: dragMoveState.annotationId,
          geometry: translated,
        },
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    // 1. Finalize Drawing
    if (drawingState.isDrawing) {
      try {
        (e.target as Element).releasePointerCapture?.(e.pointerId);
      } catch (_err) {
        // Pointer capture unsupported in test environments
      }

      const draft = drawingState.draftGeometry;
      let isValid = false;

      if (draft) {
        if (draft.type === 'box' || draft.type === 'highlight' || draft.type === 'blur') {
          isValid = draft.width >= 4 || draft.height >= 4;
        } else if (draft.type === 'ellipse') {
          isValid = draft.rx >= 2 || draft.ry >= 2;
        } else if (draft.type === 'arrow') {
          isValid = Math.hypot(draft.endX - draft.startX, draft.endY - draft.startY) >= 8;
        } else if (draft.type === 'pin') {
          isValid = true;
        }
      }

      if (isValid && draft) {
        if (
          draft.type === 'box' ||
          draft.type === 'ellipse' ||
          draft.type === 'arrow' ||
          draft.type === 'pin'
        ) {
          trackAnnotate({
            shapeType: draft.type,
            color: activeColor,
            strokeWidth: activeStrokeWidth,
            index: annotations.length + 1,
          });
        }
        dispatch({
          type: 'ADD_ANNOTATION',
          payload: {
            geometry: draft,
            style: {
              color: activeColor,
              strokeWidth: activeStrokeWidth,
              fillOpacity: activeFillOpacity,
            },
            note: '',
          },
        });
      }

      setDrawingState({
        isDrawing: false,
        startPoint: { x: 0, y: 0 },
        currentPoint: { x: 0, y: 0 },
        draftGeometry: null,
        pointerId: null,
      });
      return;
    }

    // 2. Finalize Body Drag Movement
    if (dragMoveState.isDragging) {
      try {
        (e.target as Element).releasePointerCapture?.(e.pointerId);
      } catch (_err) {
        // Pointer capture unsupported in test environments
      }

      commitGesture();
      setDragMoveState({
        isDragging: false,
        annotationId: null,
        startPoint: { x: 0, y: 0 },
        startGeometry: null,
        pointerId: null,
      });
    }
  };

  const handleShapePointerDown = (
    e: React.PointerEvent,
    ann: { id: string; geometry: AnnotationGeometry }
  ) => {
    if (activeTool !== 'select' || e.button !== 0) return;

    e.stopPropagation();
    dispatch({ type: 'SELECT_ANNOTATION', payload: ann.id });

    txManager.beginTransaction({
      annotations,
      selectedAnnotationId: ann.id,
    });

    const startPoint = getNativeCoordinates(e);
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch (_err) {
      // Pointer capture unsupported in test environments
    }

    setDragMoveState({
      isDragging: true,
      annotationId: ann.id,
      startPoint,
      startGeometry: ann.geometry,
      pointerId: e.pointerId,
    });
  };

  if (!image) return null;

  const selectedAnnotation = annotations.find((ann) => ann.id === selectedAnnotationId);
  const highlightAnnotations = annotations.filter((ann) => ann.geometry.type === 'highlight');
  const isHighlightDrafting = drawingState.isDrawing && drawingState.draftGeometry?.type === 'highlight';
  const hasSpotlight = highlightAnnotations.length > 0 || isHighlightDrafting;

  const blurAnnotations = annotations.filter((ann) => ann.geometry.type === 'blur');
  const isBlurDrafting = drawingState.isDrawing && drawingState.draftGeometry?.type === 'blur';

  return (
    <svg
      ref={svgRef}
      data-testid="svg-overlay"
      width={image.naturalWidth}
      height={image.naturalHeight}
      viewBox={`0 0 ${image.naturalWidth} ${image.naturalHeight}`}
      className={`absolute inset-0 w-full h-full overflow-visible select-none ${className}`}
      style={{
        pointerEvents: activeTool === 'pan' ? 'none' : 'auto',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <defs>
        <filter id="shape-hover-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="badge-drop-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy={2 * resolutionScale} stdDeviation={2.5 * resolutionScale} floodColor="#000000" floodOpacity="0.45" />
        </filter>
        <filter id="arrow-drop-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy={1.5 * resolutionScale} stdDeviation={2 * resolutionScale} floodColor="#000000" floodOpacity="0.45" />
        </filter>

        {/* Gaussian Blur Filter */}
        <filter id="gaussian-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" edgeMode="duplicate" />
        </filter>

        {/* Per-Annotation Blur ClipPaths */}
        {blurAnnotations.map((ann) => {
          const geom = ann.geometry as BlurGeometry;
          return (
            <clipPath key={`blur-clip-${ann.id}`} id={`blur-clip-${ann.id}`}>
              <rect
                x={geom.x}
                y={geom.y}
                width={geom.width}
                height={geom.height}
                rx={geom.borderRadius ?? 2}
              />
            </clipPath>
          );
        })}
        {isBlurDrafting && drawingState.draftGeometry && (
          <clipPath id="blur-clip-draft">
            <rect
              x={(drawingState.draftGeometry as BlurGeometry).x}
              y={(drawingState.draftGeometry as BlurGeometry).y}
              width={(drawingState.draftGeometry as BlurGeometry).width}
              height={(drawingState.draftGeometry as BlurGeometry).height}
              rx={(drawingState.draftGeometry as BlurGeometry).borderRadius ?? 2}
            />
          </clipPath>
        )}

        {/* Unified Spotlight Mask */}
        <mask id="spotlight-mask" maskUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="white" />
          {highlightAnnotations.map((ann) => {
            const geom = ann.geometry as HighlightGeometry;
            return (
              <rect
                key={ann.id}
                x={geom.x}
                y={geom.y}
                width={geom.width}
                height={geom.height}
                fill="black"
                rx={geom.borderRadius ?? 4}
              />
            );
          })}
          {isHighlightDrafting && drawingState.draftGeometry && (
            <rect
              x={(drawingState.draftGeometry as HighlightGeometry).x}
              y={(drawingState.draftGeometry as HighlightGeometry).y}
              width={(drawingState.draftGeometry as HighlightGeometry).width}
              height={(drawingState.draftGeometry as HighlightGeometry).height}
              fill="black"
              rx={(drawingState.draftGeometry as HighlightGeometry).borderRadius ?? 4}
            />
          )}
        </mask>
      </defs>

      {/* Layer 1: Background Click Catcher for Deselection */}
      <rect
        x={0}
        y={0}
        width={image.naturalWidth}
        height={image.naturalHeight}
        fill="transparent"
        data-testid="canvas-background-catcher"
        onClick={() => {
          if (activeTool === 'select') {
            dispatch({ type: 'SELECT_ANNOTATION', payload: null });
          }
        }}
      />

      {/* Layer 1.2: Blurred Base Image Slices */}
      {blurAnnotations.map((ann) => (
        <image
          key={`blur-slice-${ann.id}`}
          data-testid={`blur-slice-${ann.id}`}
          href={image.src}
          width={image.naturalWidth}
          height={image.naturalHeight}
          filter="url(#gaussian-blur)"
          clipPath={`url(#blur-clip-${ann.id})`}
          pointerEvents="none"
        />
      ))}
      {isBlurDrafting && (
        <image
          data-testid="blur-slice-draft"
          href={image.src}
          width={image.naturalWidth}
          height={image.naturalHeight}
          filter="url(#gaussian-blur)"
          clipPath="url(#blur-clip-draft)"
          pointerEvents="none"
        />
      )}

      {/* Layer 1.5: Spotlight Dimming Backdrop */}
      {hasSpotlight && (
        <rect
          data-testid="spotlight-backdrop"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.68)"
          mask="url(#spotlight-mask)"
          pointerEvents="none"
        />
      )}

      {/* Layer 2: Rendered Annotations */}
      {annotations.map((ann) => (
        <ShapeRenderer
          key={ann.id}
          annotation={ann}
          isSelected={ann.id === selectedAnnotationId}
          isHovered={ann.id === hoveredAnnotationId}
          resolutionScale={resolutionScale}
          onPointerDown={(e) => handleShapePointerDown(e, ann)}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'SELECT_ANNOTATION', payload: ann.id });
          }}
          onMouseEnter={() => {
            dispatch({ type: 'HOVER_ANNOTATION', payload: ann.id });
          }}
          onMouseLeave={() => {
            dispatch({ type: 'HOVER_ANNOTATION', payload: null });
          }}
          onDelete={(id) => {
            dispatch({ type: 'DELETE_ANNOTATION', payload: { id } });
          }}
        />
      ))}

      {/* Layer 3: Live Drag Preview */}
      {drawingState.isDrawing && drawingState.draftGeometry && (
        <ShapeRenderer
          annotation={{
            geometry: drawingState.draftGeometry,
            style: {
              color: activeColor,
              strokeWidth: activeStrokeWidth,
              fillOpacity: activeFillOpacity,
            },
            index: isAnnotatableGeometry(drawingState.draftGeometry)
              ? annotations.filter((a) => isAnnotatableGeometry(a.geometry)).length + 1
              : 0,
          }}
          isDraft={true}
          resolutionScale={resolutionScale}
        />
      )}

      {/* Layer 4: Selection Box & Resize Handles */}
      {selectedAnnotation && activeTool === 'select' && (
        <TransformHandles
          annotation={selectedAnnotation}
          zoom={zoom}
          resolutionScale={resolutionScale}
        />
      )}
    </svg>
  );
};

export default SvgOverlay;
