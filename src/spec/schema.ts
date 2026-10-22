/**
 * Annot8 document spec (v1): a declarative JSON description of an annotated screenshot.
 * Agents write or edit a spec; the compiler turns it into Annotation[] in natural image pixels.
 */
import { z } from 'zod';

export const SPEC_VERSION = 1;

export const ANCHOR_POSITIONS = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

export type AnchorPosition = (typeof ANCHOR_POSITIONS)[number];

export const ANCHOR_PATTERN = new RegExp(`^@([A-Za-z0-9_-]+)(?:\\.(${ANCHOR_POSITIONS.join('|')}))?$`);
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PERCENT_PATTERN = /^-?\d+(\.\d+)?%$/;

const Coord = z
  .union([z.number(), z.string().regex(PERCENT_PATTERN, 'Use a number of pixels or a percentage string like "25%"')])
  .describe('Pixels in the original image, or a percentage of image width (x, width) / height (y, height), e.g. "25%"');

const Length = z
  .union([
    z.number().nonnegative(),
    z.string().regex(PERCENT_PATTERN, 'Use a number of pixels or a percentage string like "25%"'),
  ])
  .describe('Non-negative pixels, or a percentage of image width/height, e.g. "50%"');

const AnchorRef = z
  .string()
  .regex(ANCHOR_PATTERN, `Anchor must look like "@id" or "@id.<${ANCHOR_POSITIONS.join('|')}>"`)
  .describe('Reference to another annotation\'s bounding box, e.g. "@login" (center) or "@login.right"');

export const PointSchema = z
  .union([
    z.tuple([Coord, Coord]).describe('[x, y]'),
    AnchorRef,
    z
      .strictObject({
        anchor: AnchorRef,
        dx: z.number().optional().describe('Horizontal offset in pixels from the anchor point'),
        dy: z.number().optional().describe('Vertical offset in pixels from the anchor point'),
      })
      .describe('Anchor with a pixel offset'),
  ])
  .describe('A point: [x, y], "@id.position", or { anchor, dx, dy }');

export const ColorSchema = z
  .union([
    z.enum(['red', 'amber', 'green', 'cyan', 'purple']),
    z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a preset name or a hex color like "#FF3366"'),
  ])
  .describe('Preset (red, amber, green, cyan, purple) or hex "#RRGGBB"');

const common = {
  id: z
    .string()
    .regex(ID_PATTERN, 'Ids may contain letters, digits, "_" and "-"')
    .optional()
    .describe('Stable id; lets other annotations anchor to this one and ops target it'),
  color: ColorSchema.optional(),
  strokeWidth: z.number().positive().max(200).optional().describe('Stroke width in pixels'),
  fillOpacity: z.number().min(0).max(1).optional().describe('Fill opacity for box/ellipse (0..1)'),
  note: z.string().optional().describe('Markdown note shown in the sidebar and markdown export'),
  badge: z.boolean().optional().describe('Show the numbered badge (default true)'),
};

const rect = {
  x: Coord,
  y: Coord,
  width: Length,
  height: Length,
};

export const BoxSpec = z
  .strictObject({ type: z.literal('box'), ...common, ...rect, radius: z.number().nonnegative().optional() })
  .describe('Numbered rectangle callout');

export const EllipseSpec = z
  .strictObject({ type: z.literal('ellipse'), ...common, ...rect })
  .describe('Numbered ellipse callout, given by its bounding box');

export const HighlightSpec = z
  .strictObject({ type: z.literal('highlight'), ...common, ...rect, radius: z.number().nonnegative().optional() })
  .describe('Unnumbered spotlight: dims everything outside the highlighted regions');

export const BlurSpec = z
  .strictObject({ type: z.literal('blur'), ...common, ...rect, radius: z.number().nonnegative().optional() })
  .describe('Unnumbered blur for redacting sensitive regions');

export const ArrowSpec = z
  .strictObject({ type: z.literal('arrow'), ...common, from: PointSchema, to: PointSchema })
  .describe('Numbered arrow; the badge sits at "from", the head at "to"');

export const PinSpec = z
  .strictObject({ type: z.literal('pin'), ...common, at: PointSchema })
  .describe('Numbered map pin whose tip touches "at"');

export const TextSpec = z
  .strictObject({
    type: z.literal('text'),
    ...common,
    at: PointSchema.describe('Top edge of the label; x is the left, center, or right edge depending on align'),
    text: z.string().min(1).describe('Label text; use "\\n" for line breaks'),
    fontSize: z.number().positive().max(500).optional().describe('Font size in pixels (default scales with image size)'),
    align: z.enum(['left', 'center', 'right']).optional(),
  })
  .describe('Unnumbered text label on a solid background');

export const AnnotationSpecSchema = z.discriminatedUnion('type', [
  BoxSpec,
  EllipseSpec,
  HighlightSpec,
  BlurSpec,
  ArrowSpec,
  PinSpec,
  TextSpec,
]);

export const FrameSpecSchema = z
  .strictObject({
    crop: z.strictObject(rect).optional().describe('Region of the image to keep'),
    padding: z.number().nonnegative().max(2000).optional().describe('Pixels added on every side'),
    background: z.string().optional().describe('CSS color for the padding, e.g. "#0F172A"'),
  })
  .describe('Output framing: crop, then pad');

export const DocumentSpecSchema = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(SPEC_VERSION),
    image: z.strictObject({
      source: z.string().min(1).describe('File path (relative to the spec file), http(s) URL, or data URL'),
      width: z.number().int().positive().optional().describe('Natural width; filled in when known'),
      height: z.number().int().positive().optional().describe('Natural height; filled in when known'),
    }),
    frame: FrameSpecSchema.optional(),
    defaults: z
      .strictObject({
        color: ColorSchema.optional(),
        strokeWidth: z.number().positive().max(200).optional(),
        fillOpacity: z.number().min(0).max(1).optional(),
        fontSize: z.number().positive().max(500).optional(),
      })
      .optional()
      .describe('Style applied to annotations that do not set their own'),
    annotations: z.array(AnnotationSpecSchema).describe('Drawn in order; numbered callouts get badges 1..N in this order'),
  })
  .describe('Annot8 document: one screenshot plus its annotations');

export type DocumentSpec = z.infer<typeof DocumentSpecSchema>;
export type AnnotationSpec = z.infer<typeof AnnotationSpecSchema>;
export type PointSpec = z.infer<typeof PointSchema>;
export type FrameSpec = z.infer<typeof FrameSpecSchema>;

export interface SpecIssue {
  path: string;
  message: string;
}

export class SpecError extends Error {
  readonly issues: SpecIssue[];

  constructor(issues: SpecIssue[]) {
    super(`Invalid Annot8 spec:\n${issues.map((i) => `  ${i.path || '(root)'}: ${i.message}`).join('\n')}`);
    this.name = 'SpecError';
    this.issues = issues;
  }
}

export function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, key) => {
    if (typeof key === 'number') return `${acc}[${key}]`;
    return acc ? `${acc}.${String(key)}` : String(key);
  }, '');
}

/**
 * Parses unknown JSON into a DocumentSpec, throwing SpecError with path-addressed issues.
 */
export function parseSpec(input: unknown): DocumentSpec {
  const result = DocumentSpecSchema.safeParse(input);
  if (!result.success) {
    throw new SpecError(result.error.issues.map((i) => ({ path: formatIssuePath(i.path), message: i.message })));
  }
  return result.data;
}

export function getSpecJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(DocumentSpecSchema) as Record<string, unknown>;
}
