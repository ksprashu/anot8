import { TextGeometry } from '../types';

export const LABEL_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const LABEL_FONT_WEIGHT = 600;
export const LABEL_LINE_HEIGHT = 1.25;
export const LABEL_PADDING_RATIO = 0.4;
export const LABEL_RADIUS_RATIO = 0.3;

/** Measures rendered text width in pixels for a given font size. */
export type TextMeasurer = (text: string, fontSize: number) => number;

/**
 * DOM-free width estimate used when no real measurer is available (e.g. jsdom, hit-testing).
 */
export const estimateTextWidth: TextMeasurer = (text, fontSize) => text.length * fontSize * 0.56;

export function labelFont(fontSize: number): string {
  return `${LABEL_FONT_WEIGHT} ${fontSize}px ${LABEL_FONT_FAMILY}`;
}

export interface TextLabelLayout {
  box: { x: number; y: number; width: number; height: number };
  padding: number;
  radius: number;
  lineHeight: number;
  lines: { text: string; x: number; y: number }[]; // Baseline-middle anchor, left-aligned within the box
}

/**
 * Lays out a text label: a rounded background box sized to the text, positioned by align.
 * Shared by the SVG preview and the canvas exporter so both draw the same box.
 */
export function layoutTextLabel(geometry: TextGeometry, measure: TextMeasurer = estimateTextWidth): TextLabelLayout {
  const fontSize = Math.max(1, geometry.fontSize);
  const padding = Math.round(fontSize * LABEL_PADDING_RATIO);
  const lineHeight = Math.round(fontSize * LABEL_LINE_HEIGHT);
  const rawLines = geometry.text.split('\n');
  const textWidth = Math.max(...rawLines.map((line) => measure(line, fontSize)), fontSize * 0.5);
  const width = Math.ceil(textWidth + padding * 2);
  const height = lineHeight * rawLines.length + padding * 2;

  const align = geometry.align ?? 'left';
  const x = align === 'center' ? geometry.x - width / 2 : align === 'right' ? geometry.x - width : geometry.x;
  const y = geometry.y;

  return {
    box: { x, y, width, height },
    padding,
    radius: Math.round(fontSize * LABEL_RADIUS_RATIO),
    lineHeight,
    lines: rawLines.map((text, i) => ({
      text,
      x: x + padding,
      y: y + padding + lineHeight * i + lineHeight / 2,
    })),
  };
}
