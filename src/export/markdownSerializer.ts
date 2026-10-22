/**
 * Anot8 Markdown Serializer
 * Pure functional serializer transforming ordered annotations into clean, structured Markdown.
 * Supports Numbered Lists, GFM Tables, Task Checklists, and Full Summary Reports.
 */

import { Annotation, AnnotationColor, BaseImage } from '../types';
import { resolveColor } from '../constants/colors';
import { isAnnotatableGeometry } from '../state/appReducer';

export type MarkdownExportFormat = 'list' | 'table' | 'checklist' | 'report';

export interface MarkdownSerializeOptions {
  format?: MarkdownExportFormat;
  includeHeader?: boolean;
  title?: string;
  includeColorCodes?: boolean;
  includeTypeTags?: boolean;
  emptyNotesPlaceholder?: string;
  emptyListPlaceholder?: string;
  imageFileName?: string;
}

export interface MarkdownReportOptions extends MarkdownSerializeOptions {
  imageTitle?: string;
  includeImageMetadata?: boolean;
  includeSummaryStats?: boolean;
}

/**
 * Capitalizes shape type identifiers (e.g. 'box' -> 'Box', 'ellipse' -> 'Ellipse', 'pin' -> 'Pin').
 */
export function formatShapeTypeName(type: string): string {
  if (!type) return 'Shape';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Retrieves the display color definition for an annotation preset or hex color.
 */
export function getColorDefinition(color: AnnotationColor) {
  return resolveColor(color);
}

/**
 * Filters out unnumbered annotations (highlight, blur, text) that are not numbered notes.
 */
export function filterAnnotatableAnnotations(annotations: Annotation[]): Annotation[] {
  if (!annotations) return [];
  return annotations.filter((ann) => isAnnotatableGeometry(ann.geometry));
}

/**
 * Serializes annotations into a standard numbered markdown list.
 * Multi-line notes are indented with 3 spaces so markdown parsers keep them nested under the list item.
 */
export function serializeToNumberedList(
  annotations: Annotation[],
  options?: MarkdownSerializeOptions
): string {
  const emptyListText = options?.emptyListPlaceholder ?? '_No annotations recorded._';
  const annotatable = filterAnnotatableAnnotations(annotations);
  if (annotatable.length === 0) {
    return emptyListText;
  }

  const sorted = [...annotatable].sort((a, b) => a.index - b.index);
  const includeColors = options?.includeColorCodes !== false;
  const includeTypes = options?.includeTypeTags !== false;
  const emptyNoteText = options?.emptyNotesPlaceholder ?? '_No description provided._';

  const items = sorted.map((ann) => {
    const typeLabel = includeTypes ? `**[${formatShapeTypeName(ann.geometry.type)}]** ` : '';
    const colorDef = getColorDefinition(ann.style.color);
    const colorLabel = includeColors ? `(\`${colorDef.hex}\`):` : ':';

    let noteBody = emptyNoteText;
    if (ann.note && ann.note.trim().length > 0) {
      // Indent subsequent lines by 3 spaces to preserve list continuation in markdown renderers
      noteBody = ann.note.replace(/\r?\n/g, '\n   ');
    }

    return `${ann.index}. ${typeLabel}${colorLabel}\n   ${noteBody}`;
  });

  const header =
    options?.includeHeader !== false
      ? `### ${options?.title || 'Visual Annotations & Notes'}\n\n`
      : '';

  return `${header}${items.join('\n\n')}`;
}

/**
 * Serializes annotations into a GitHub-Flavored Markdown table.
 * Escapes table delimiter pipes (| -> \|) and transforms newlines to <br>.
 */
export function serializeToMarkdownTable(
  annotations: Annotation[],
  options?: MarkdownSerializeOptions
): string {
  const emptyListText = options?.emptyListPlaceholder ?? '_No annotations recorded._';
  const annotatable = filterAnnotatableAnnotations(annotations);
  if (annotatable.length === 0) {
    return emptyListText;
  }

  const sorted = [...annotatable].sort((a, b) => a.index - b.index);
  const headerRow = '| # | Type | Color | Note |';
  const dividerRow = '|---|---|---|---|';

  const rows = sorted.map((ann) => {
    const typeStr = formatShapeTypeName(ann.geometry.type);
    const colorDef = getColorDefinition(ann.style.color);
    const colorStr = `${colorDef.name} (${colorDef.hex})`;

    let cleanNote = '_No description_';
    if (ann.note && ann.note.trim().length > 0) {
      cleanNote = ann.note
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, '<br>');
    }

    return `| ${ann.index} | ${typeStr} | ${colorStr} | ${cleanNote} |`;
  });

  const header =
    options?.includeHeader !== false
      ? `### ${options?.title || 'Visual Annotations & Notes'}\n\n`
      : '';

  return `${header}${headerRow}\n${dividerRow}\n${rows.join('\n')}`;
}

/**
 * Serializes annotations into an interactive task checklist (- [ ] #1 [Box] ...).
 */
export function serializeToTaskChecklist(
  annotations: Annotation[],
  options?: MarkdownSerializeOptions
): string {
  const emptyListText = options?.emptyListPlaceholder ?? '_No annotations recorded._';
  const annotatable = filterAnnotatableAnnotations(annotations);
  if (annotatable.length === 0) {
    return emptyListText;
  }

  const sorted = [...annotatable].sort((a, b) => a.index - b.index);
  const items = sorted.map((ann) => {
    const typeStr = formatShapeTypeName(ann.geometry.type);
    const colorDef = getColorDefinition(ann.style.color);
    const noteContent =
      ann.note && ann.note.trim().length > 0
        ? ann.note.replace(/\r?\n/g, '\n  ')
        : '_No description provided._';
    return `- [ ] **#${ann.index} [${typeStr}]** (\`${colorDef.hex}\`): ${noteContent}`;
  });

  const header =
    options?.includeHeader !== false
      ? `### ${options?.title || 'Annotation Action Items'}\n\n`
      : '';

  return `${header}${items.join('\n')}`;
}

/**
 * Serializes annotations and image metadata into a comprehensive markdown review report.
 */
export function serializeToFullReport(
  annotations: Annotation[],
  baseImage?: BaseImage | null,
  options?: MarkdownReportOptions
): string {
  const title =
    options?.imageTitle ||
    (baseImage?.fileName
      ? `Annotation Report: ${baseImage.fileName}`
      : 'Screenshot Annotation Report');
  let report = `# ${title}\n\n`;

  if (options?.includeImageMetadata !== false && baseImage) {
    report += `### Screenshot Details\n\n`;
    report += `| Property | Value |\n`;
    report += `|---|---|\n`;
    report += `| **Filename** | \`${baseImage.fileName || 'Unnamed'}\` |\n`;
    report += `| **Native Resolution** | ${baseImage.naturalWidth} × ${baseImage.naturalHeight} px |\n`;
    if (baseImage.fileSize) {
      const kb = (baseImage.fileSize / 1024).toFixed(1);
      report += `| **File Size** | ${kb} KB |\n`;
    }
    report += `| **Total Annotations** | ${annotations.length} |\n`;
    report += `| **Generated At** | ${new Date().toISOString()} |\n\n`;
  }

  if (options?.format === 'table') {
    report += serializeToMarkdownTable(annotations, { ...options, includeHeader: true });
  } else if (options?.format === 'checklist') {
    report += serializeToTaskChecklist(annotations, { ...options, includeHeader: true });
  } else {
    report += serializeToNumberedList(annotations, { ...options, includeHeader: true });
  }

  return report;
}

/**
 * Primary markdown serialization dispatcher supporting polymorphic format argument.
 */
export function serializeAnnotationsToMarkdown(
  annotations: Annotation[],
  formatOrOptions?: MarkdownExportFormat | MarkdownSerializeOptions,
  options?: MarkdownSerializeOptions
): string {
  let format: MarkdownExportFormat = 'list';
  let mergedOptions: MarkdownSerializeOptions | undefined = options;

  if (typeof formatOrOptions === 'string') {
    format = formatOrOptions;
  } else if (typeof formatOrOptions === 'object' && formatOrOptions !== null) {
    format = formatOrOptions.format || 'list';
    mergedOptions = { ...formatOrOptions, ...options };
  }

  if (format === 'table') {
    return serializeToMarkdownTable(annotations, mergedOptions);
  }
  if (format === 'checklist') {
    return serializeToTaskChecklist(annotations, mergedOptions);
  }
  if (format === 'report') {
    return serializeToFullReport(annotations, null, mergedOptions);
  }
  return serializeToNumberedList(annotations, mergedOptions);
}

/**
 * Sanitizes arbitrary filenames against path traversal, control chars, and illegal filesystem characters.
 */
export function sanitizeFileName(
  fileName: string,
  defaultBase = 'anot8-export',
  extension = 'png'
): string {
  if (!fileName || typeof fileName !== 'string' || fileName.trim().length === 0) {
    return `${defaultBase}-${Date.now()}.${extension}`;
  }

  // 1. Remove null bytes and control characters (0x00-0x1F, 0x7F)
  // eslint-disable-next-line no-control-regex
  let cleaned = fileName.replace(/[\x00-\x1F\x7F]/g, '');

  // 2. Remove path traversal sequences (../, ..\, etc.)
  cleaned = cleaned.replace(/\.\.+/g, '');

  // 3. Replace OS-illegal characters (/ \ ? % * : | " < >) with hyphen
  cleaned = cleaned.replace(/[/\\?%*:|"<>]+/g, '-');

  // 4. Strip leading and trailing hyphens, dots, and whitespace
  cleaned = cleaned.replace(/^[-.\s]+|[-.\s]+$/g, '').trim();

  if (cleaned.length === 0) {
    return `${defaultBase}-${Date.now()}.${extension}`;
  }

  // 5. Ensure file extension is appended without duplication
  const extRegex = new RegExp(`\\.${extension}$`, 'i');
  if (!extRegex.test(cleaned)) {
    cleaned = `${cleaned}.${extension}`;
  }

  return cleaned;
}

/**
 * Derives a clean, sanitized export filename from base image metadata.
 */
export function generateExportFilename(
  baseImage: BaseImage | null,
  extension: 'png' | 'md' | 'json' | string,
  suffix = 'annotated'
): string {
  const timestamp = Date.now();
  if (!baseImage || !baseImage.fileName || !baseImage.fileName.trim()) {
    return `anot8-export-${timestamp}.${extension}`;
  }

  // Strip existing extension
  const rawBase = baseImage.fileName.replace(/\.[^/.]+$/, '');

  // Sanitize name
  const withoutCtrl = rawBase.replace(/[\x00-\x1F\x7F]/g, ''); // eslint-disable-line no-control-regex
  let sanitized = withoutCtrl.replace(/[/\\?%*:|"<>]+/g, '-').trim();
  sanitized = sanitized.replace(/^[-.\s]+|[-.\s]+$/g, '');

  const baseName = sanitized.length > 0 ? sanitized : 'screenshot';
  return `${baseName}-${suffix}.${extension}`;
}
