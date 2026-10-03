/**
 * Annot8 Custom Telemetry & Analytics Module
 * Provides typed, asynchronous, non-blocking GA4 event tracking with error boundaries and offline resilience.
 */

export type TelemetryPasteSource = 'clipboard' | 'drop' | 'file_picker' | 'unknown';

export interface TelemetryPastePayload {
  source: TelemetryPasteSource;
  fileSize?: number;
  fileType?: string;
  width?: number;
  height?: number;
}

export type TelemetryCopyType =
  | 'image_clipboard'
  | 'notes_clipboard'
  | 'combined_clipboard'
  | 'png_download'
  | 'markdown_download';

export interface TelemetryCopyPayload {
  type: TelemetryCopyType;
  annotationCount: number;
}

export type TelemetryShapeType = 'box' | 'ellipse' | 'arrow' | 'pin';

export interface TelemetryAnnotatePayload {
  shapeType: TelemetryShapeType;
  color?: string;
  strokeWidth?: number;
  index?: number;
}

export interface TelemetryEventEntry {
  event: string;
  params: Record<string, unknown>;
  timestamp: number;
}

export type GtagFunction = (command: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: GtagFunction;
  }
}

// In-memory event log for inspection, testing, and debugging
const eventLog: TelemetryEventEntry[] = [];
const MAX_EVENT_LOG_SIZE = 5000;
let isEnabled = true;

/**
 * Enable or disable telemetry event dispatching.
 */
export function setTelemetryEnabled(enabled: boolean): void {
  isEnabled = enabled;
}

/**
 * Retrieve a copy of all recorded telemetry events in testing environments.
 */
export function getEventLogForTesting(): TelemetryEventEntry[] {
  return [...eventLog];
}

/**
 * Clear the in-memory telemetry event log for testing isolation.
 */
export function clearEventLogForTesting(): void {
  eventLog.length = 0;
}

/**
 * Dispatches an event to GA4 gtag or dataLayer asynchronously with strict error boundary protection.
 */
export function trackEvent(eventName: string, params: Record<string, unknown> = {}): void {
  if (!isEnabled) return;

  const entry: TelemetryEventEntry = {
    event: eventName,
    params: { ...params },
    timestamp: Date.now(),
  };
  eventLog.push(entry);
  if (eventLog.length > MAX_EVENT_LOG_SIZE) {
    eventLog.splice(0, eventLog.length - MAX_EVENT_LOG_SIZE);
  }

  if (typeof window === 'undefined') return;

  // Safe fallback if client is offline
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isOffline) {
    return;
  }

  const dispatchToAnalytics = () => {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, params);
      } else if (Array.isArray(window.dataLayer)) {
        window.dataLayer.push({ event: eventName, ...params });
      }
    } catch (_err) {
      // Swallowed safely to protect application thread from external analytics failures
    }
  };

  // Non-blocking asynchronous scheduling
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(dispatchToAnalytics);
  } else {
    setTimeout(dispatchToAnalytics, 0);
  }
}

/**
 * Track an image paste / ingestion event.
 */
export function trackPaste(payload: TelemetryPastePayload): void {
  const params: Record<string, unknown> = {
    source: payload.source,
  };
  if (payload.fileSize !== undefined) params.file_size = payload.fileSize;
  if (payload.fileType !== undefined) params.file_type = payload.fileType;
  if (payload.width !== undefined) params.width = payload.width;
  if (payload.height !== undefined) params.height = payload.height;
  if (payload.width !== undefined && payload.height !== undefined) {
    params.dimensions = `${payload.width}x${payload.height}`;
  }
  trackEvent('paste', params);
}

/**
 * Track an export or clipboard copy event.
 */
export function trackCopy(payload: TelemetryCopyPayload): void {
  trackEvent('copy', {
    copy_type: payload.type,
    annotation_count: payload.annotationCount,
  });
}

/**
 * Track an annotation creation event.
 */
export function trackAnnotate(payload: TelemetryAnnotatePayload): void {
  const params: Record<string, unknown> = {
    shape_type: payload.shapeType,
  };
  if (payload.color !== undefined) params.color = payload.color;
  if (payload.strokeWidth !== undefined) params.stroke_width = payload.strokeWidth;
  if (payload.index !== undefined) params.annotation_index = payload.index;
  trackEvent('annotate', params);
}
