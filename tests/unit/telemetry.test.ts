import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  trackEvent,
  trackPaste,
  trackCopy,
  trackAnnotate,
  getEventLogForTesting,
  clearEventLogForTesting,
  setTelemetryEnabled,
} from '../../src/analytics/telemetry';

describe('Anot8 Custom Telemetry Module', () => {
  beforeEach(() => {
    clearEventLogForTesting();
    setTelemetryEnabled(true);
    window.dataLayer = [];
    window.gtag = vi.fn();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    clearEventLogForTesting();
    setTelemetryEnabled(true);
  });

  describe('Core Event Dispatching & Test Helpers', () => {
    it('records events in the in-memory event log', () => {
      trackEvent('test_event', { key: 'value', num: 42 });
      const logs = getEventLogForTesting();
      expect(logs).toHaveLength(1);
      expect(logs[0].event).toBe('test_event');
      expect(logs[0].params).toEqual({ key: 'value', num: 42 });
      expect(typeof logs[0].timestamp).toBe('number');
    });

    it('clears event log with clearEventLogForTesting', () => {
      trackEvent('event_1');
      trackEvent('event_2');
      expect(getEventLogForTesting()).toHaveLength(2);

      clearEventLogForTesting();
      expect(getEventLogForTesting()).toHaveLength(0);
    });

    it('respects setTelemetryEnabled(false) by not logging or dispatching events', async () => {
      setTelemetryEnabled(false);
      trackEvent('disabled_event', { foo: 'bar' });

      expect(getEventLogForTesting()).toHaveLength(0);

      // Wait for microtask queue
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).not.toHaveBeenCalled();
    });

    it('dispatches to window.gtag asynchronously via microtask', async () => {
      trackEvent('custom_click', { button_id: 'btn_save' });

      // Before microtask runs
      expect(window.gtag).not.toHaveBeenCalled();

      // Wait for microtask
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      expect(window.gtag).toHaveBeenCalledTimes(1);
      expect(window.gtag).toHaveBeenCalledWith('event', 'custom_click', { button_id: 'btn_save' });
    });

    it('falls back to window.dataLayer if window.gtag is undefined', async () => {
      delete (window as { gtag?: unknown }).gtag;
      window.dataLayer = [];

      trackEvent('fallback_event', { score: 100 });

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      expect(window.dataLayer).toEqual([{ event: 'fallback_event', score: 100 }]);
    });

    it('safely absorbs errors when window.gtag throws an exception', async () => {
      window.gtag = vi.fn().mockImplementation(() => {
        throw new Error('Gtag script network error or blocked by ad-blocker');
      });

      expect(() => {
        trackEvent('error_prone_event');
      }).not.toThrow();

      // Ensure async execution also doesn't trigger unhandled rejection
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalled();
    });

    it('safely skips network dispatch when navigator.onLine is false', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      trackEvent('offline_event', { action: 'cache' });

      // Event is still recorded in local test log
      expect(getEventLogForTesting()).toHaveLength(1);

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).not.toHaveBeenCalled();
    });
  });

  describe('trackPaste Payload Formatting', () => {
    it('correctly tracks paste event from clipboard with dimensions and file size', async () => {
      trackPaste({
        source: 'clipboard',
        fileSize: 102400,
        fileType: 'image/png',
        width: 1920,
        height: 1080,
      });

      const log = getEventLogForTesting()[0];
      expect(log.event).toBe('paste');
      expect(log.params).toEqual({
        source: 'clipboard',
        file_size: 102400,
        file_type: 'image/png',
        width: 1920,
        height: 1080,
        dimensions: '1920x1080',
      });

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledWith('event', 'paste', {
        source: 'clipboard',
        file_size: 102400,
        file_type: 'image/png',
        width: 1920,
        height: 1080,
        dimensions: '1920x1080',
      });
    });

    it('correctly tracks paste event from drag-and-drop', async () => {
      trackPaste({
        source: 'drop',
        fileSize: 50000,
        width: 800,
        height: 600,
      });

      const log = getEventLogForTesting()[0];
      expect(log.event).toBe('paste');
      expect(log.params).toEqual({
        source: 'drop',
        file_size: 50000,
        width: 800,
        height: 600,
        dimensions: '800x600',
      });
    });

    it('correctly tracks paste event from file picker with minimal fields', () => {
      trackPaste({
        source: 'file_picker',
      });

      const log = getEventLogForTesting()[0];
      expect(log.event).toBe('paste');
      expect(log.params).toEqual({
        source: 'file_picker',
      });
    });
  });

  describe('trackCopy Payload Formatting', () => {
    it('correctly tracks copy of composite image to clipboard', async () => {
      trackCopy({
        type: 'image_clipboard',
        annotationCount: 5,
      });

      const log = getEventLogForTesting()[0];
      expect(log.event).toBe('copy');
      expect(log.params).toEqual({
        copy_type: 'image_clipboard',
        annotation_count: 5,
      });

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledWith('event', 'copy', {
        copy_type: 'image_clipboard',
        annotation_count: 5,
      });
    });

    it('correctly tracks copy of markdown notes to clipboard', () => {
      trackCopy({
        type: 'notes_clipboard',
        annotationCount: 12,
      });

      const log = getEventLogForTesting()[0];
      expect(log.event).toBe('copy');
      expect(log.params).toEqual({
        copy_type: 'notes_clipboard',
        annotation_count: 12,
      });
    });

    it('correctly tracks combined clipboard export', () => {
      trackCopy({
        type: 'combined_clipboard',
        annotationCount: 3,
      });

      const log = getEventLogForTesting()[0];
      expect(log.event).toBe('copy');
      expect(log.params).toEqual({
        copy_type: 'combined_clipboard',
        annotation_count: 3,
      });
    });

    it('correctly tracks png download and markdown download', () => {
      trackCopy({ type: 'png_download', annotationCount: 1 });
      trackCopy({ type: 'markdown_download', annotationCount: 1 });

      const logs = getEventLogForTesting();
      expect(logs).toHaveLength(2);
      expect(logs[0].params.copy_type).toBe('png_download');
      expect(logs[1].params.copy_type).toBe('markdown_download');
    });
  });

  describe('trackAnnotate Payload Formatting', () => {
    it('correctly tracks box annotation creation', async () => {
      trackAnnotate({
        shapeType: 'box',
        color: 'red',
        strokeWidth: 4,
        index: 1,
      });

      const log = getEventLogForTesting()[0];
      expect(log.event).toBe('annotate');
      expect(log.params).toEqual({
        shape_type: 'box',
        color: 'red',
        stroke_width: 4,
        annotation_index: 1,
      });

      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      expect(window.gtag).toHaveBeenCalledWith('event', 'annotate', {
        shape_type: 'box',
        color: 'red',
        stroke_width: 4,
        annotation_index: 1,
      });
    });

    it('correctly tracks ellipse, arrow, and pin annotations', () => {
      trackAnnotate({ shapeType: 'ellipse', color: 'amber', strokeWidth: 3, index: 2 });
      trackAnnotate({ shapeType: 'arrow', color: 'green', strokeWidth: 6, index: 3 });
      trackAnnotate({ shapeType: 'pin', color: 'purple', strokeWidth: 2, index: 4 });

      const logs = getEventLogForTesting();
      expect(logs).toHaveLength(3);
      expect(logs[0].params.shape_type).toBe('ellipse');
      expect(logs[1].params.shape_type).toBe('arrow');
      expect(logs[2].params.shape_type).toBe('pin');
    });
  });
});
