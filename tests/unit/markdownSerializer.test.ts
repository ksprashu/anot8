import { describe, it, expect } from 'vitest';
import {
  serializeAnnotationsToMarkdown,
  serializeToNumberedList,
  serializeToMarkdownTable,
  serializeToTaskChecklist,
  serializeToFullReport,
  generateExportFilename,
  sanitizeFileName,
  formatShapeTypeName,
} from '../../src/export/markdownSerializer';
import { Annotation, BaseImage } from '../../src/types';

describe('Markdown Serializer Unit Tests', () => {
  const mockBox: Annotation = {
    id: 'ann-1',
    index: 1,
    geometry: { type: 'box', x: 100, y: 100, width: 200, height: 150 },
    style: { color: 'red', strokeWidth: 4, fillOpacity: 0.18 },
    note: 'Fix the header alignment and padding.',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };

  const mockEllipse: Annotation = {
    id: 'ann-2',
    index: 2,
    geometry: { type: 'ellipse', cx: 300, cy: 300, rx: 50, ry: 50 },
    style: { color: 'amber', strokeWidth: 4, fillOpacity: 0.18 },
    note: 'Highlight avatar badge icon.',
    createdAt: 1700000001000,
    updatedAt: 1700000001000,
  };

  const mockArrow: Annotation = {
    id: 'ann-3',
    index: 3,
    geometry: { type: 'arrow', startX: 100, startY: 200, endX: 400, endY: 500 },
    style: { color: 'green', strokeWidth: 4, fillOpacity: 0.18 },
    note: 'Point from submit button to error text.',
    createdAt: 1700000002000,
    updatedAt: 1700000002000,
  };

  const mockPin: Annotation = {
    id: 'ann-4',
    index: 4,
    geometry: { type: 'pin', x: 600, y: 400 },
    style: { color: 'purple', strokeWidth: 4, fillOpacity: 0.18 },
    note: 'Missing tooltip anchor here.',
    createdAt: 1700000003000,
    updatedAt: 1700000003000,
  };

  // =========================================================================
  // 1. Numbered List Formatting
  // =========================================================================
  describe('Numbered List Serialization (format: list)', () => {
    it('serializes single box annotation with correct index, type, and color hex', () => {
      const md = serializeAnnotationsToMarkdown([mockBox]);
      expect(md).toContain('1. **[Box]** (`#EF4444`):');
      expect(md).toContain('Fix the header alignment and padding.');
    });

    it('serializes mixed shape types maintaining sequential numbers', () => {
      const md = serializeAnnotationsToMarkdown([mockBox, mockEllipse, mockArrow, mockPin]);
      expect(md).toContain('1. **[Box]**');
      expect(md).toContain('2. **[Ellipse]**');
      expect(md).toContain('3. **[Arrow]**');
      expect(md).toContain('4. **[Pin]**');
    });

    it('sorts unsorted annotations by index in ascending order', () => {
      const unsorted = [mockPin, mockBox, mockArrow, mockEllipse];
      const md = serializeAnnotationsToMarkdown(unsorted);
      const boxIdx = md.indexOf('1. **[Box]**');
      const ellipseIdx = md.indexOf('2. **[Ellipse]**');
      const arrowIdx = md.indexOf('3. **[Arrow]**');
      const pinIdx = md.indexOf('4. **[Pin]**');

      expect(boxIdx).toBeLessThan(ellipseIdx);
      expect(ellipseIdx).toBeLessThan(arrowIdx);
      expect(arrowIdx).toBeLessThan(pinIdx);
    });

    it('preserves multi-line note formatting with 3-space paragraph indentation', () => {
      const multiLine: Annotation = {
        ...mockBox,
        note: 'First line of critique.\nSecond line with details.\n- Bullet point A\n- Bullet point B',
      };
      const md = serializeAnnotationsToMarkdown([multiLine]);
      expect(md).toContain('1. **[Box]** (`#EF4444`):\n   First line of critique.\n   Second line with details.\n   - Bullet point A\n   - Bullet point B');
    });

    it('handles empty notes with default placeholder', () => {
      const emptyNote: Annotation = { ...mockBox, note: '' };
      const md = serializeAnnotationsToMarkdown([emptyNote]);
      expect(md).toContain('_No description provided._');
    });

    it('handles empty annotations array with standard placeholder', () => {
      const md = serializeAnnotationsToMarkdown([]);
      expect(md).toBe('_No annotations recorded._');
    });

    it('respects optional custom flags: omit header, omit color codes, custom title', () => {
      const md = serializeToNumberedList([mockBox], {
        includeHeader: false,
        includeColorCodes: false,
        includeTypeTags: false,
      });
      expect(md).not.toContain('### Visual Annotations');
      expect(md).not.toContain('#EF4444');
      expect(md).not.toContain('[Box]');
      expect(md).toContain('1. :\n   Fix the header alignment and padding.');
    });
  });

  // =========================================================================
  // 2. GFM Markdown Table Formatting
  // =========================================================================
  describe('GFM Markdown Table Serialization (format: table)', () => {
    it('formats valid markdown table with headers and dividers', () => {
      const table = serializeToMarkdownTable([mockBox, mockEllipse]);
      expect(table).toContain('| # | Type | Color | Note |');
      expect(table).toContain('|---|---|---|---|');
      expect(table).toContain('| 1 | Box | Red (#EF4444) | Fix the header alignment and padding. |');
      expect(table).toContain('| 2 | Ellipse | Amber Gold (#F59E0B) | Highlight avatar badge icon. |');
    });

    it('escapes pipe (|) delimiters in note strings to prevent broken tables', () => {
      const pipeNote: Annotation = {
        ...mockBox,
        note: 'Check if A | B comparison works | properly',
      };
      const table = serializeAnnotationsToMarkdown([pipeNote], 'table');
      expect(table).toContain('Check if A \\| B comparison works \\| properly');
    });

    it('converts newlines into <br> tags in table rows', () => {
      const multiLine: Annotation = {
        ...mockBox,
        note: 'Line 1\nLine 2\nLine 3',
      };
      const table = serializeAnnotationsToMarkdown([multiLine], 'table');
      expect(table).toContain('Line 1<br>Line 2<br>Line 3');
    });
  });

  // =========================================================================
  // 3. Task Checklist Formatting
  // =========================================================================
  describe('Task Checklist Serialization (format: checklist)', () => {
    it('formats annotations as GitHub task items (- [ ] #1 ...)', () => {
      const checklist = serializeToTaskChecklist([mockBox, mockArrow]);
      expect(checklist).toContain('- [ ] **#1 [Box]** (`#EF4444`): Fix the header alignment and padding.');
      expect(checklist).toContain('- [ ] **#3 [Arrow]** (`#10B981`): Point from submit button to error text.');
    });
  });

  // =========================================================================
  // 4. Full Summary Report Formatting
  // =========================================================================
  describe('Full Summary Report Serialization (serializeToFullReport)', () => {
    it('generates full report with screenshot details and total annotations', () => {
      const baseImg: BaseImage = {
        id: 'img-1',
        src: 'data:...',
        fileName: 'checkout-page.png',
        naturalWidth: 2560,
        naturalHeight: 1440,
        fileSize: 1024 * 350,
      };

      const report = serializeToFullReport([mockBox, mockPin], baseImg);
      expect(report).toContain('# Annotation Report: checkout-page.png');
      expect(report).toContain('| **Filename** | `checkout-page.png` |');
      expect(report).toContain('| **Native Resolution** | 2560 × 1440 px |');
      expect(report).toContain('| **File Size** | 350.0 KB |');
      expect(report).toContain('| **Total Annotations** | 2 |');
      expect(report).toContain('1. **[Box]**');
      expect(report).toContain('4. **[Pin]**');
    });
  });

  // =========================================================================
  // 5. Filename Sanitization & Generation
  // =========================================================================
  describe('Filename Sanitization & Generation', () => {
    it('sanitizes malicious path traversal and control characters', () => {
      const malicious = '../../../etc/passwd\x00.png';
      const clean = sanitizeFileName(malicious, 'export', 'png');
      expect(clean).not.toContain('..');
      expect(clean).not.toContain('\x00');
      expect(clean).toMatch(/^[a-zA-Z0-9_-]+\.png$/);
    });

    it('generates standard export filename from base image metadata', () => {
      const img: BaseImage = {
        id: 'img-1',
        src: '',
        naturalWidth: 800,
        naturalHeight: 600,
        fileName: 'user_profile_screen.png',
        fileSize: 1000,
      };

      const pngName = generateExportFilename(img, 'png', 'annotated');
      expect(pngName).toBe('user_profile_screen-annotated.png');

      const mdName = generateExportFilename(img, 'md', 'notes');
      expect(mdName).toBe('user_profile_screen-notes.md');
    });

    it('generates timestamped fallback name when base image is null or empty', () => {
      const fallbackPng = generateExportFilename(null, 'png');
      expect(fallbackPng).toMatch(/^anot8-export-\d+\.png$/);
    });

    it('formatShapeTypeName capitalizes types safely', () => {
      expect(formatShapeTypeName('box')).toBe('Box');
      expect(formatShapeTypeName('ellipse')).toBe('Ellipse');
      expect(formatShapeTypeName('arrow')).toBe('Arrow');
      expect(formatShapeTypeName('pin')).toBe('Pin');
      expect(formatShapeTypeName('')).toBe('Shape');
    });
  });
});
