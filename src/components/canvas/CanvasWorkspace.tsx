import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from '../../state/AppContext';
import {
  quantizeWheelZoom,
  computeZoomTransform,
  getFitToViewportTransform,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_PADDING,
} from '../../math/coordinates';
import { Point } from '../../types';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import { EmptyDropZone } from './EmptyDropZone';
import { SvgOverlay } from './SvgOverlay';
import { useDragReset } from '../../hooks/useDragReset';

export interface CanvasWorkspaceProps {
  className?: string;
  onImageDropped?: (file: File) => void;
  children?: React.ReactNode;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  className = '',
  onImageDropped,
  children,
}) => {
  const { state, dispatch } = useApp();
  const { image, viewport, activeTool } = state;
  const overlays = state.overlays ?? [];

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gesture state
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  useDragReset(() => setIsDragOver(false));

  // Pan tracking refs
  const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistanceRef = useRef<number | null>(null);
  const lastAutoFittedImageIdRef = useRef<string | null>(image?.id ?? null);

  // Helper: check if element is text input to avoid spacebar hijacking
  const isInputElement = (el: Element | null): boolean => {
    if (!el) return false;
    const tagName = el.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || (el as HTMLElement).isContentEditable;
  };

  // Helper: Auto-fit viewport to container
  const fitToContainer = useCallback((allowUpscale = false) => {
    if (!image || !containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    const fitTransform = getFitToViewportTransform(
      image.naturalWidth,
      image.naturalHeight,
      clientWidth,
      clientHeight,
      DEFAULT_PADDING,
      allowUpscale,
      MIN_ZOOM,
      MAX_ZOOM
    );

    dispatch({
      type: 'SET_VIEWPORT',
      payload: fitTransform,
    });
  }, [image, dispatch]);

  // Auto-fit on new image load
  useEffect(() => {
    if (image && lastAutoFittedImageIdRef.current !== image.id) {
      lastAutoFittedImageIdRef.current = image.id;
      fitToContainer(false);
    }
  }, [image, fitToContainer]);

  // ResizeObserver for initial layout or viewport resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          if (image && lastAutoFittedImageIdRef.current !== image.id) {
            lastAutoFittedImageIdRef.current = image.id;
            fitToContainer(false);
          }
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [image, fitToContainer]);

  // Track latest viewport in a ref to prevent stale closures and eliminate listener churn
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Non-passive wheel zoom listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Guard: Ignore wheel if deltaY is 0 (pure horizontal trackpad scroll)
      if (e.deltaY === 0) return;

      const currentViewport = viewportRef.current;
      const targetZoom = quantizeWheelZoom(currentViewport.zoom, e.deltaY);

      // Guard: If zoom is clamped at boundary and unchanged, skip redundant transform
      if (targetZoom === currentViewport.zoom) return;

      const rect = container.getBoundingClientRect();
      const focalPointScreen: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      const nextViewport = computeZoomTransform(
        currentViewport,
        focalPointScreen,
        targetZoom,
        MIN_ZOOM,
        MAX_ZOOM
      );

      // Synchronously update ref so back-to-back intra-frame wheel ticks read the latest zoom
      viewportRef.current = nextViewport;

      dispatch({
        type: 'SET_VIEWPORT',
        payload: nextViewport,
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [dispatch]);

  // Global spacebar key tracking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isInputElement(document.activeElement)) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    const handleBlur = () => {
      setIsSpacePressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Check if pointerdown initiates pan
  const isPanInitiator = useCallback((e: React.PointerEvent): boolean => {
    // Middle click is always pan
    if (e.button === 1) return true;
    // Left click with spacebar pressed is pan
    if (e.button === 0 && isSpacePressed) return true;
    // Left click with pan tool active is pan
    if (e.button === 0 && activeTool === 'pan') return true;
    return false;
  }, [isSpacePressed, activeTool]);

  // Pointer Down Handler
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Single or primary pointer pan
    if (isPanInitiator(e)) {
      e.preventDefault();
      setIsDraggingPan(true);
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        panX: viewport.panX,
        panY: viewport.panY,
      };

      if (containerRef.current && typeof containerRef.current.setPointerCapture === 'function') {
        try {
          containerRef.current.setPointerCapture(e.pointerId);
        } catch {
          // Fallback if capture fails
        }
      }
    }
  };

  // Pointer Move Handler
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Touch pinch gesture with 2 pointers
    if (activePointersRef.current.size === 2 && containerRef.current) {
      const points = Array.from(activePointersRef.current.values());
      const p1 = points[0];
      const p2 = points[1];
      const currentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (lastPinchDistanceRef.current !== null && lastPinchDistanceRef.current > 0) {
        const ratio = currentDistance / lastPinchDistanceRef.current;
        const rect = containerRef.current.getBoundingClientRect();
        const midpoint: Point = {
          x: (p1.x + p2.x) / 2 - rect.left,
          y: (p1.y + p2.y) / 2 - rect.top,
        };

        const targetZoom = Math.min(Math.max(viewport.zoom * ratio, MIN_ZOOM), MAX_ZOOM);
        const nextViewport = computeZoomTransform(viewport, midpoint, targetZoom, MIN_ZOOM, MAX_ZOOM);
        dispatch({ type: 'SET_VIEWPORT', payload: nextViewport });
      }

      lastPinchDistanceRef.current = currentDistance;
      return;
    }

    // Active mouse or single touch pan drag
    if (isDraggingPan && panStartRef.current) {
      const deltaX = e.clientX - panStartRef.current.clientX;
      const deltaY = e.clientY - panStartRef.current.clientY;

      dispatch({
        type: 'SET_VIEWPORT',
        payload: {
          panX: panStartRef.current.panX + deltaX,
          panY: panStartRef.current.panY + deltaY,
        },
      });
    }
  };

  // Pointer Up / End Handler
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);

    if (activePointersRef.current.size < 2) {
      lastPinchDistanceRef.current = null;
    }

    if (isDraggingPan && activePointersRef.current.size === 0) {
      setIsDraggingPan(false);
      panStartRef.current = null;

      if (containerRef.current && typeof containerRef.current.releasePointerCapture === 'function') {
        try {
          containerRef.current.releasePointerCapture(e.pointerId);
        } catch {
          // Fallback
        }
      }
    }
  };

  // Compute active cursor style
  const cursorStyle = useMemo(() => {
    if (isDraggingPan) return 'grabbing';
    if (isSpacePressed || activeTool === 'pan') return 'grab';
    if (activeTool === 'select') return 'default';
    if (['box', 'ellipse', 'arrow', 'pin'].includes(activeTool)) return 'crosshair';
    return 'default';
  }, [isDraggingPan, isSpacePressed, activeTool]);

  // File Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      if (onImageDropped) {
        onImageDropped(file);
      } else {
        const src = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          if (state.image?.src && state.image.src.startsWith('blob:')) {
            URL.revokeObjectURL(state.image.src);
          }
          dispatch({
            type: 'SET_IMAGE',
            payload: {
              id: 'img_' + Date.now().toString(36),
              src,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              fileName: file.name,
              fileSize: file.size,
            },
          });
        };
        img.src = src;
      }
    }
  };

  // File Input Picker Handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      if (onImageDropped) {
        onImageDropped(file);
      } else {
        const src = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          if (state.image?.src && state.image.src.startsWith('blob:')) {
            URL.revokeObjectURL(state.image.src);
          }
          dispatch({
            type: 'SET_IMAGE',
            payload: {
              id: 'img_' + Date.now().toString(36),
              src,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              fileName: file.name,
              fileSize: file.size,
            },
          });
        };
        img.src = src;
      }
    }
    // Reset file input value to allow re-selecting the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Zoom HUD Action Handlers
  const handleZoomIn = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerPoint: Point = { x: rect.width / 2, y: rect.height / 2 };
    const nextZoom = Math.min(viewport.zoom * 1.25, MAX_ZOOM);
    const nextViewport = computeZoomTransform(viewport, centerPoint, nextZoom, MIN_ZOOM, MAX_ZOOM);
    dispatch({ type: 'SET_VIEWPORT', payload: nextViewport });
  };

  const handleZoomOut = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerPoint: Point = { x: rect.width / 2, y: rect.height / 2 };
    const nextZoom = Math.max(viewport.zoom / 1.25, MIN_ZOOM);
    const nextViewport = computeZoomTransform(viewport, centerPoint, nextZoom, MIN_ZOOM, MAX_ZOOM);
    dispatch({ type: 'SET_VIEWPORT', payload: nextViewport });
  };

  const handleResetZoom100 = () => {
    if (!containerRef.current || !image) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerPoint: Point = { x: rect.width / 2, y: rect.height / 2 };
    const nextViewport = computeZoomTransform(viewport, centerPoint, 1.0, MIN_ZOOM, MAX_ZOOM);
    dispatch({ type: 'SET_VIEWPORT', payload: nextViewport });
  };

  return (
    <div
      ref={containerRef}
      data-testid="canvas-workspace-container"
      className={`relative w-full h-full overflow-hidden select-none bg-slate-950 canvas-checkerboard ${className}`}
      style={{ cursor: cursorStyle }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handlePointerUp}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden File Input for Picker Fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        data-testid="canvas-file-input"
        onChange={handleFileInputChange}
      />

      {/* Empty State / Dropzone when no image loaded */}
      {!image && (
        <EmptyDropZone
          isDraggingOver={isDragOver}
          onOpenFilePicker={() => fileInputRef.current?.click()}
        />
      )}

      {/* Active Image Layer and SvgOverlay Children */}
      {image && (
        <div
          data-testid="canvas-transform-layer"
          className="absolute top-0 left-0"
          style={{
            transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
            width: image.naturalWidth,
            height: image.naturalHeight,
            willChange: 'transform',
          }}
        >
          {/* Base Screenshot Image */}
          <img
            src={image.src}
            alt={image.fileName || 'Canvas Image'}
            width={image.naturalWidth}
            height={image.naturalHeight}
            draggable={false}
            data-testid="canvas-base-image"
            className="block select-none pointer-events-none max-w-none shadow-2xl rounded-sm"
            style={{
              imageRendering: viewport.zoom >= 3.0 ? 'pixelated' : 'auto',
            }}
          />

          {/* Overlay Image Layers (Rendered between Base Image and SvgOverlay) */}
          {overlays.map((layer) => (
            <img
              key={layer.id}
              src={layer.src}
              alt={layer.fileName || 'Overlay Layer'}
              data-testid={`canvas-overlay-image-${layer.id}`}
              data-overlay-id={layer.id}
              draggable={false}
              className="absolute select-none pointer-events-none max-w-none shadow-md rounded-sm"
              style={{
                left: `${layer.x ?? 0}px`,
                top: `${layer.y ?? 0}px`,
                width: `${layer.width ?? layer.naturalWidth}px`,
                height: `${layer.height ?? layer.naturalHeight}px`,
                opacity: layer.opacity ?? 1,
                imageRendering: viewport.zoom >= 3.0 ? 'pixelated' : 'auto',
              }}
            />
          ))}

          {/* Children: SVG Vector Overlay & Annotations (M3) */}
          <SvgOverlay />
          {children}
        </div>
      )}

      {/* Floating HUD Viewport Controls */}
      {image && (
        <div
          data-testid="canvas-viewport-hud"
          className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur border border-slate-800 text-slate-200 px-2 py-1.5 rounded-xl shadow-lg z-20"
        >
          <button
            type="button"
            data-testid="hud-zoom-out"
            title="Zoom Out"
            onClick={handleZoomOut}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid="hud-zoom-level"
            title="Reset to 100%"
            onClick={handleResetZoom100}
            className="px-2 py-0.5 text-xs font-mono font-medium rounded hover:bg-slate-800 text-amber-400 hover:text-amber-300 transition"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>

          <button
            type="button"
            data-testid="hud-zoom-in"
            title="Zoom In"
            onClick={handleZoomIn}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-slate-800 mx-0.5" />

          <button
            type="button"
            data-testid="hud-fit-to-screen"
            title="Fit to Screen"
            onClick={() => fitToContainer(false)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid="hud-reset-100"
            title="Reset 1:1"
            onClick={handleResetZoom100}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default CanvasWorkspace;
