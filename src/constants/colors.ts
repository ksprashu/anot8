import { AnnotationColor, ColorDefinition, PresetColor } from '../types';

export const PRESET_COLORS: Record<PresetColor, ColorDefinition> = {
  red: {
    id: 'red',
    name: 'Red',
    hex: '#EF4444',
    stroke: '#EF4444',
    fill: 'rgba(239, 68, 68, 0.18)',
    badgeBg: '#EF4444',
    badgeText: '#FFFFFF',
  },
  amber: {
    id: 'amber',
    name: 'Amber Gold',
    hex: '#F59E0B',
    stroke: '#F59E0B',
    fill: 'rgba(245, 158, 11, 0.18)',
    badgeBg: '#F59E0B',
    badgeText: '#1E293B',
  },
  green: {
    id: 'green',
    name: 'Emerald Green',
    hex: '#10B981',
    stroke: '#10B981',
    fill: 'rgba(16, 185, 129, 0.18)',
    badgeBg: '#10B981',
    badgeText: '#FFFFFF',
  },
  cyan: {
    id: 'cyan',
    name: 'Electric Cyan',
    hex: '#06B6D4',
    stroke: '#06B6D4',
    fill: 'rgba(6, 182, 212, 0.18)',
    badgeBg: '#06B6D4',
    badgeText: '#FFFFFF',
  },
  purple: {
    id: 'purple',
    name: 'Vibrant Purple',
    hex: '#8B5CF6',
    stroke: '#8B5CF6',
    fill: 'rgba(139, 92, 246, 0.18)',
    badgeBg: '#8B5CF6',
    badgeText: '#FFFFFF',
  },
};

export const COLOR_KEYS: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const DARK_BADGE_TEXT = '#1E293B';
const LIGHT_BADGE_TEXT = '#FFFFFF';

export function isPresetColor(color: unknown): color is PresetColor {
  return typeof color === 'string' && Object.prototype.hasOwnProperty.call(PRESET_COLORS, color);
}

export function isHexColor(color: unknown): color is `#${string}` {
  return typeof color === 'string' && HEX_COLOR_PATTERN.test(color);
}

function expandHex(hex: string): string {
  const clean = hex.slice(1);
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return `#${full.toUpperCase()}`;
}

function relativeLuminance(hex: string): number {
  const channel = (offset: number) => {
    const v = parseInt(hex.substring(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/**
 * Picks whichever badge text color (dark slate or white) has the higher WCAG contrast against the background.
 */
export function pickBadgeTextColor(hex: string): string {
  const bg = relativeLuminance(expandHex(hex));
  const dark = relativeLuminance(DARK_BADGE_TEXT);
  const contrastWithWhite = 1.05 / (bg + 0.05);
  const contrastWithDark = (bg + 0.05) / (dark + 0.05);
  return contrastWithDark > contrastWithWhite ? DARK_BADGE_TEXT : LIGHT_BADGE_TEXT;
}

/**
 * Resolves a preset key or hex color into a full color definition.
 * Unknown values fall back to amber so rendering never fails on bad input.
 */
export function resolveColor(color: AnnotationColor | string | undefined | null): ColorDefinition {
  if (isPresetColor(color)) return PRESET_COLORS[color];
  if (isHexColor(color)) {
    const hex = expandHex(color);
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    return {
      id: color,
      name: hex,
      hex,
      stroke: hex,
      fill: `rgba(${r}, ${g}, ${b}, 0.18)`,
      badgeBg: hex,
      badgeText: pickBadgeTextColor(hex),
    };
  }
  return PRESET_COLORS.amber;
}
