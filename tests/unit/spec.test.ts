import { describe, it, expect } from 'vitest';
import { compileSpec, validateSpec, toSpec, applyOps, getSpecJsonSchema, SpecError, DocumentSpec } from '../../src/spec';
import { resolveColor, pickBadgeTextColor } from '../../src/constants/colors';
import { ArrowGeometry, BoxGeometry, EllipseGeometry, PinGeometry, TextGeometry } from '../../src/types';

const dims = { width: 1000, height: 500 };

const baseSpec = (annotations: unknown[], extra: Record<string, unknown> = {}) => ({
  version: 1,
  image: { source: 'shot.png' },
  annotations,
  ...extra,
});

function issuesOf(fn: () => unknown) {
  try {
    fn();
  } catch (err) {
    if (err instanceof SpecError) return err.issues;
    throw err;
  }
  throw new Error('expected SpecError');
}

describe('compileSpec', () => {
  it('resolves pixel and percentage coordinates, including high-precision decimals', () => {
    const doc = compileSpec(baseSpec([{ type: 'box', x: '10%', y: '20%', width: '33.333333%', height: 100 }]), dims);
    expect(doc.annotations[0].geometry).toMatchObject({ type: 'box', x: 100, y: 100, height: 100 });
    expect((doc.annotations[0].geometry as BoxGeometry).width).toBeCloseTo(333.33333, 4);
  });

  it('converts ellipse bounding boxes to center/radius', () => {
    const doc = compileSpec(baseSpec([{ type: 'ellipse', x: 100, y: 100, width: 200, height: 100 }]), dims);
    expect(doc.annotations[0].geometry as EllipseGeometry).toEqual({ type: 'ellipse', cx: 200, cy: 150, rx: 100, ry: 50 });
  });

  it('numbers callouts 1..N and leaves highlight, blur, and text unnumbered', () => {
    const doc = compileSpec(
      baseSpec([
        { type: 'highlight', x: 0, y: 0, width: 10, height: 10 },
        { type: 'box', x: 0, y: 0, width: 10, height: 10 },
        { type: 'text', at: [5, 5], text: 'hi' },
        { type: 'pin', at: [5, 5] },
        { type: 'blur', x: 0, y: 0, width: 10, height: 10 },
        { type: 'arrow', from: [0, 0], to: [10, 10] },
      ]),
      dims
    );
    expect(doc.annotations.map((a) => a.index)).toEqual([0, 1, 0, 2, 0, 3]);
  });

  it('assigns stable ids without colliding with explicit ones', () => {
    const doc = compileSpec(
      baseSpec([
        { type: 'pin', at: [1, 1] },
        { type: 'pin', id: 'a1', at: [2, 2] },
        { type: 'pin', at: [3, 3] },
      ]),
      dims
    );
    expect(doc.annotations.map((a) => a.id)).toEqual(['a2', 'a1', 'a3']);
  });

  it('applies defaults, then per-annotation style, and the badge flag', () => {
    const doc = compileSpec(
      baseSpec(
        [
          { type: 'box', x: 0, y: 0, width: 1, height: 1 },
          { type: 'box', x: 0, y: 0, width: 1, height: 1, color: '#ff3366', strokeWidth: 9, badge: false },
        ],
        { defaults: { color: 'red', strokeWidth: 5, fillOpacity: 0.3 } }
      ),
      dims
    );
    expect(doc.annotations[0].style).toEqual({ color: 'red', strokeWidth: 5, fillOpacity: 0.3 });
    expect(doc.annotations[1].style).toEqual({ color: '#ff3366', strokeWidth: 9, fillOpacity: 0.3, showBadge: false });
  });

  it('resolves anchors, including forward references and offsets', () => {
    const doc = compileSpec(
      baseSpec([
        { type: 'arrow', from: { anchor: '@login.right', dx: 200 }, to: '@login.right' },
        { type: 'pin', at: '@login.top' },
        { type: 'box', id: 'login', x: 100, y: 100, width: 200, height: 50 },
        { type: 'text', at: '@login.bottom-left', text: 'Sign in' },
      ]),
      dims
    );
    expect(doc.annotations[0].geometry as ArrowGeometry).toMatchObject({ startX: 500, startY: 125, endX: 300, endY: 125 });
    expect(doc.annotations[1].geometry as PinGeometry).toMatchObject({ x: 200, y: 100 });
    expect(doc.annotations[3].geometry as TextGeometry).toMatchObject({ x: 100, y: 150 });
  });

  it('defaults anchor position to center', () => {
    const doc = compileSpec(
      baseSpec([
        { type: 'box', id: 'b', x: 0, y: 0, width: 100, height: 40 },
        { type: 'pin', at: '@b' },
      ]),
      dims
    );
    expect(doc.annotations[1].geometry).toMatchObject({ x: 50, y: 20 });
  });

  it('reports unknown anchors, self anchors, duplicate ids, and cycles with paths', () => {
    expect(issuesOf(() => compileSpec(baseSpec([{ type: 'pin', at: '@nope' }]), dims))).toEqual([
      { path: 'annotations[0].at', message: 'Unknown anchor target "@nope"' },
    ]);
    expect(issuesOf(() => compileSpec(baseSpec([{ type: 'pin', id: 'p', at: '@p' }]), dims))[0].message).toMatch(/itself/);
    expect(
      issuesOf(() =>
        compileSpec(
          baseSpec([
            { type: 'pin', id: 'x', at: [0, 0] },
            { type: 'pin', id: 'x', at: [0, 0] },
          ]),
          dims
        )
      )[0]
    ).toEqual({ path: 'annotations[1].id', message: 'Duplicate id "x"' });
    expect(
      issuesOf(() =>
        compileSpec(
          baseSpec([
            { type: 'pin', id: 'p', at: '@q' },
            { type: 'pin', id: 'q', at: '@p' },
          ]),
          dims
        )
      )[0].message
    ).toMatch(/cycle/);
  });

  it('accepts percentages below 10000% and rejects larger ones', () => {
    expect(validateSpec(baseSpec([{ type: 'box', x: '-150%', y: '9999.5%', width: '50%', height: 10 }]), dims)).toEqual([]);
    expect(validateSpec(baseSpec([{ type: 'box', x: '10000%', y: 0, width: 10, height: 10 }]), dims)[0].path).toBe(
      'annotations[0].x'
    );
  });

  it('rejects unknown fields and bad values with addressable paths', () => {
    const issues = validateSpec(baseSpec([{ type: 'box', x: 0, y: 0, w: 10, height: 10 }]), dims);
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(['annotations[0]', 'annotations[0].width']));
    expect(validateSpec(baseSpec([{ type: 'box', x: 0, y: 0, width: 1, height: 1, color: 'pink' }]), dims)[0].path).toBe(
      'annotations[0].color'
    );
  });

  it('uses image.width/height when no dimensions are passed, and errors when neither is known', () => {
    const doc = compileSpec({ ...baseSpec([]), image: { source: 'x.png', width: 10, height: 20 } });
    expect(doc.image).toEqual({ source: 'x.png', width: 10, height: 20 });
    expect(issuesOf(() => compileSpec(baseSpec([])))[0].path).toBe('image');
  });

  it('compiles frame crop percentages', () => {
    const doc = compileSpec(baseSpec([], { frame: { crop: { x: '10%', y: 0, width: '50%', height: '50%' }, padding: 8 } }), dims);
    expect(doc.frame).toEqual({ crop: { x: 100, y: 0, width: 500, height: 250 }, padding: 8 });
  });

  it('scales the default text size with image size', () => {
    const small = compileSpec(baseSpec([{ type: 'text', at: [0, 0], text: 'a' }]), dims);
    const large = compileSpec(baseSpec([{ type: 'text', at: [0, 0], text: 'a' }]), { width: 2880, height: 1800 });
    expect((small.annotations[0].geometry as TextGeometry).fontSize).toBe(18);
    expect((large.annotations[0].geometry as TextGeometry).fontSize).toBe(36);
  });
});

describe('toSpec', () => {
  it('round-trips through compileSpec', () => {
    const original = compileSpec(
      baseSpec(
        [
          { type: 'box', id: 'b', x: 10, y: 20, width: 30, height: 40, color: '#123456', note: 'hello', radius: 6 },
          { type: 'ellipse', id: 'e', x: 100, y: 100, width: 50, height: 20 },
          { type: 'arrow', id: 'a', from: [1, 2], to: '@b.center', badge: false },
          { type: 'pin', id: 'p', at: [5, 6] },
          { type: 'highlight', id: 'h', x: 0, y: 0, width: 10, height: 10 },
          { type: 'blur', id: 'bl', x: 0, y: 0, width: 10, height: 10 },
          { type: 'text', id: 't', at: [9, 9], text: 'two\nlines', align: 'center', fontSize: 22 },
        ],
        { frame: { padding: 12, background: '#000' } }
      ),
      dims
    );
    const spec = toSpec({
      image: { src: 'shot.png', naturalWidth: 1000, naturalHeight: 500 },
      annotations: original.annotations,
      frame: original.frame,
    });
    const again = compileSpec(spec);
    expect(again.annotations).toEqual(original.annotations);
    expect(again.frame).toEqual(original.frame);
    expect(spec.image).toEqual({ source: 'shot.png', width: 1000, height: 500 });
  });

  it('can override the image source (e.g. to embed a data URL)', () => {
    const spec = toSpec(
      { image: { src: 'blob:x', naturalWidth: 1, naturalHeight: 1 }, annotations: [] },
      { source: 'data:image/png;base64,AAAA' }
    );
    expect(spec.image.source).toBe('data:image/png;base64,AAAA');
  });
});

describe('applyOps', () => {
  const spec = baseSpec([
    { type: 'box', id: 'login', x: 100, y: 100, width: 200, height: 50 },
    { type: 'arrow', id: 'arrow', from: { anchor: '@login.right', dx: 150 }, to: '@login.right' },
  ]);

  it('keeps anchors live when the target moves', () => {
    const { spec: next } = applyOps(spec, [{ op: 'update', id: 'login', set: { x: 400 } }], dims);
    const doc = compileSpec(next, dims);
    expect(doc.annotations[1].geometry as ArrowGeometry).toMatchObject({ endX: 600, startX: 750 });
  });

  it('adds with generated ids, inserts at an index, and renumbers', () => {
    const { spec: next, addedIds } = applyOps(
      spec,
      [
        { op: 'add', annotation: { type: 'pin', at: '@login.top' } },
        { op: 'add', annotation: { type: 'pin', id: 'first', at: [0, 0] }, index: 0 },
      ],
      dims
    );
    expect(addedIds).toEqual(['a1', 'first']);
    const doc = compileSpec(next, dims);
    expect(doc.annotations.map((a) => [a.id, a.index])).toEqual([
      ['first', 1],
      ['login', 2],
      ['arrow', 3],
      ['a1', 4],
    ]);
  });

  it('reorders, deletes, clears, and sets the frame', () => {
    const reordered = applyOps(spec, [{ op: 'reorder', id: 'arrow', index: 0 }], dims).spec;
    expect(reordered.annotations.map((a) => a.id)).toEqual(['arrow', 'login']);

    const framed = applyOps(spec, [{ op: 'setFrame', frame: { padding: 20 } }], dims).spec;
    expect(framed.frame).toEqual({ padding: 20 });
    expect(applyOps(framed, [{ op: 'setFrame', frame: null }], dims).spec.frame).toBeUndefined();

    expect(applyOps(spec, [{ op: 'clear' }], dims).spec.annotations).toEqual([]);
  });

  it('removes fields set to null', () => {
    const withNote = applyOps(spec, [{ op: 'update', id: 'login', set: { note: 'x' } }], dims).spec;
    const cleared = applyOps(withNote, [{ op: 'update', id: 'login', set: { note: null } }], dims).spec;
    expect((cleared.annotations[0] as { note?: string }).note).toBeUndefined();
  });

  it('rejects edits that would leave dangling anchors', () => {
    expect(issuesOf(() => applyOps(spec, [{ op: 'delete', id: 'login' }], dims))[0].message).toMatch(/Unknown anchor/);
  });

  it('reports bad ops with op paths', () => {
    expect(issuesOf(() => applyOps(spec, [{ op: 'delete', id: 'missing' }], dims))).toEqual([
      { path: 'ops[0].id', message: 'No annotation with id "missing"' },
    ]);
    expect(issuesOf(() => applyOps(spec, [{ op: 'update', id: 'login', set: { width: -5 } }], dims))[0].path).toBe(
      'ops[0].set.width'
    );
    expect(issuesOf(() => applyOps(spec, [{ op: 'explode' }], dims))[0].path).toMatch(/^ops\[0\]/);
  });

  it('does not mutate the input spec', () => {
    const input = JSON.parse(JSON.stringify(spec)) as DocumentSpec;
    applyOps(input, [{ op: 'update', id: 'login', set: { x: 1 } }], dims);
    expect(input).toEqual(spec);
  });

  it('rejects prototype-polluting keys and id removal in update.set', () => {
    const badSet = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    expect(issuesOf(() => applyOps(spec, [{ op: 'update', id: 'login', set: badSet }], dims))[0]).toEqual({
      path: 'ops[0].set.__proto__',
      message: 'Forbidden property key "__proto__"',
    });
    expect(issuesOf(() => applyOps(spec, [{ op: 'update', id: 'login', set: { id: null } }], dims))[0]).toEqual({
      path: 'ops[0].set.id',
      message: 'Cannot remove annotation id',
    });
  });
});

describe('getSpecJsonSchema', () => {
  it('produces a JSON Schema describing every annotation type', () => {
    const json = JSON.stringify(getSpecJsonSchema());
    for (const type of ['box', 'ellipse', 'highlight', 'blur', 'arrow', 'pin', 'text']) {
      expect(json).toContain(`"const":"${type}"`);
    }
  });
});

describe('resolveColor', () => {
  it('returns presets unchanged and derives definitions from hex', () => {
    expect(resolveColor('red').hex).toBe('#EF4444');
    const custom = resolveColor('#0af');
    expect(custom).toMatchObject({ hex: '#00AAFF', stroke: '#00AAFF', badgeBg: '#00AAFF', fill: 'rgba(0, 170, 255, 0.18)' });
  });

  it('picks the higher-contrast badge text', () => {
    expect(pickBadgeTextColor('#FFFF00')).toBe('#1E293B');
    expect(pickBadgeTextColor('#1D4ED8')).toBe('#FFFFFF');
  });

  it('falls back to amber for unknown values', () => {
    expect(resolveColor('nope' as never).id).toBe('amber');
    expect(resolveColor(undefined).id).toBe('amber');
  });

  it('keeps box geometry types intact for presets used by the UI', () => {
    const doc = compileSpec(baseSpec([{ type: 'box', x: 0, y: 0, width: 1, height: 1, color: 'cyan' }]), dims);
    expect((doc.annotations[0].geometry as BoxGeometry).type).toBe('box');
  });
});
