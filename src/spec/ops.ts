/**
 * Edit operations on an Annot8 spec. Ops edit the spec itself (not compiled pixels),
 * so anchors such as "@login.right" stay live: moving "login" moves everything anchored to it.
 */
import { z } from 'zod';
import { assignIds, compileSpec, ImageDimensions } from './compile';
import {
  AnnotationSpec,
  AnnotationSpecSchema,
  DocumentSpec,
  FrameSpecSchema,
  SpecError,
  formatIssuePath,
  parseSpec,
} from './schema';

export const OpSchema = z.discriminatedUnion('op', [
  z
    .strictObject({
      op: z.literal('add'),
      annotation: AnnotationSpecSchema,
      index: z.number().int().nonnegative().optional().describe('Insert position (default: append)'),
    })
    .describe('Add an annotation'),
  z
    .strictObject({
      op: z.literal('update'),
      id: z.string(),
      set: z
        .record(z.string(), z.unknown())
        .describe('Fields to merge into the annotation; null removes a field. Changing "type" requires its fields.'),
    })
    .describe('Update fields of an annotation'),
  z.strictObject({ op: z.literal('delete'), id: z.string() }).describe('Delete an annotation'),
  z
    .strictObject({
      op: z.literal('reorder'),
      id: z.string(),
      index: z.number().int().nonnegative().describe('New position in the annotations list (0-based)'),
    })
    .describe('Move an annotation; numbered badges follow list order'),
  z.strictObject({ op: z.literal('clear') }).describe('Remove all annotations'),
  z
    .strictObject({ op: z.literal('setFrame'), frame: FrameSpecSchema.nullable() })
    .describe('Set or remove crop/padding/background'),
]);

export const OpsSchema = z.array(OpSchema);

export type SpecOp = z.infer<typeof OpSchema>;

export interface ApplyOpsResult {
  spec: DocumentSpec;
  addedIds: string[];
}

/**
 * Applies ops in order and validates the result by compiling it.
 * Annotations without ids get stable ids first so ops and anchors can target them.
 * Throws SpecError (with paths like "ops[2].id") if an op or the resulting spec is invalid.
 */
export function applyOps(specInput: unknown, opsInput: unknown, dims?: ImageDimensions): ApplyOpsResult {
  const spec = parseSpec(specInput);
  const parsedOps = OpsSchema.safeParse(opsInput);
  if (!parsedOps.success) {
    throw new SpecError(
      parsedOps.error.issues.map((i) => ({ path: formatIssuePath(['ops', ...i.path]), message: i.message }))
    );
  }

  const withIds = (list: AnnotationSpec[]) => {
    const ids = assignIds(list);
    return list.map((a, i) => (a.id ? a : { ...a, id: ids[i] }));
  };

  let annotations = withIds(spec.annotations);
  let frame = spec.frame;
  const addedIds: string[] = [];

  const findIndex = (id: string, path: string) => {
    const i = annotations.findIndex((a) => a.id === id);
    if (i < 0) throw new SpecError([{ path, message: `No annotation with id "${id}"` }]);
    return i;
  };

  parsedOps.data.forEach((op, n) => {
    const path = `ops[${n}]`;
    switch (op.op) {
      case 'add': {
        const next = [...annotations];
        const at = Math.min(op.index ?? next.length, next.length);
        next.splice(at, 0, op.annotation);
        annotations = withIds(next);
        addedIds.push(annotations[at].id!);
        break;
      }
      case 'update': {
        const i = findIndex(op.id, `${path}.id`);
        const merged: Record<string, unknown> = { ...annotations[i] };
        for (const [key, value] of Object.entries(op.set)) {
          if (value === null) delete merged[key];
          else merged[key] = value;
        }
        const result = AnnotationSpecSchema.safeParse(merged);
        if (!result.success) {
          throw new SpecError(
            result.error.issues.map((issue) => ({
              path: formatIssuePath([...`${path}.set`.split('.'), ...issue.path]),
              message: issue.message,
            }))
          );
        }
        annotations = annotations.map((a, j) => (j === i ? result.data : a));
        break;
      }
      case 'delete': {
        const i = findIndex(op.id, `${path}.id`);
        annotations = annotations.filter((_, j) => j !== i);
        break;
      }
      case 'reorder': {
        const i = findIndex(op.id, `${path}.id`);
        const next = [...annotations];
        const [moved] = next.splice(i, 1);
        next.splice(Math.min(op.index, next.length), 0, moved);
        annotations = next;
        break;
      }
      case 'clear':
        annotations = [];
        break;
      case 'setFrame':
        frame = op.frame ?? undefined;
        break;
    }
  });

  const { frame: _previousFrame, ...rest } = spec;
  const nextSpec: DocumentSpec = { ...rest, ...(frame ? { frame } : {}), annotations };
  compileSpec(nextSpec, dims);
  return { spec: nextSpec, addedIds };
}
