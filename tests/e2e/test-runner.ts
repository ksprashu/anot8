/**
 * Anot8 E2E Test Runner Harness
 * 
 * Standalone, zero-dependency, headless-compatible test engine & mock harness for Anot8.
 * Supports running via `npx tsx tests/e2e/test-runner.ts` or within standard Vitest/Jest environments.
 */

export interface TestResult {
  name: string;
  suite: string;
  passed: boolean;
  error?: Error | string;
  durationMs: number;
}

export interface SuiteSummary {
  name: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestResult[];
}

type HookFn = () => void | Promise<void>;
type TestFn = () => void | Promise<void>;

interface TestDefinition {
  name: string;
  fn: TestFn;
}

interface SuiteDefinition {
  name: string;
  tests: TestDefinition[];
  beforeEach: HookFn[];
  afterEach: HookFn[];
  beforeAll: HookFn[];
  afterAll: HookFn[];
}

class TestRegistry {
  private suites: SuiteDefinition[] = [];
  private currentSuite: SuiteDefinition | null = null;

  describe(name: string, fn: () => void) {
    const prevSuite = this.currentSuite;
    const suite: SuiteDefinition = {
      name: prevSuite ? `${prevSuite.name} > ${name}` : name,
      tests: [],
      beforeEach: prevSuite ? [...prevSuite.beforeEach] : [],
      afterEach: prevSuite ? [...prevSuite.afterEach] : [],
      beforeAll: [],
      afterAll: []
    };
    this.suites.push(suite);
    this.currentSuite = suite;
    fn();
    this.currentSuite = prevSuite;
  }

  test(name: string, fn: TestFn) {
    if (!this.currentSuite) {
      this.describe('Default Suite', () => {
        this.currentSuite!.tests.push({ name, fn });
      });
      return;
    }
    this.currentSuite.tests.push({ name, fn });
  }

  beforeEach(fn: HookFn) {
    if (this.currentSuite) {
      this.currentSuite.beforeEach.push(fn);
    }
  }

  afterEach(fn: HookFn) {
    if (this.currentSuite) {
      this.currentSuite.afterEach.push(fn);
    }
  }

  beforeAll(fn: HookFn) {
    if (this.currentSuite) {
      this.currentSuite.beforeAll.push(fn);
    }
  }

  afterAll(fn: HookFn) {
    if (this.currentSuite) {
      this.currentSuite.afterAll.push(fn);
    }
  }

  async runAll(): Promise<{ summaries: SuiteSummary[]; totalPassed: number; totalFailed: number; totalTests: number }> {
    const summaries: SuiteSummary[] = [];
    let totalPassed = 0;
    let totalFailed = 0;
    let totalTests = 0;

    for (const suite of this.suites) {
      if (suite.tests.length === 0) continue;

      const suiteStart = Date.now();
      const results: TestResult[] = [];
      let suitePassed = 0;
      let suiteFailed = 0;

      // Run beforeAll
      for (const hook of suite.beforeAll) {
        try {
          await hook();
        } catch (err: any) {
          console.error(`[beforeAll Error in ${suite.name}]:`, err);
        }
      }

      for (const test of suite.tests) {
        // Run beforeEach
        for (const hook of suite.beforeEach) {
          try {
            await hook();
          } catch (err: any) {
            console.error(`[beforeEach Error]:`, err);
          }
        }

        const testStart = Date.now();
        let passed = false;
        let testError: any = undefined;

        try {
          const res = test.fn();
          if (res && typeof (res as any).then === 'function') {
            await res;
          }
          passed = true;
          suitePassed++;
          totalPassed++;
        } catch (err: any) {
          passed = false;
          testError = err;
          suiteFailed++;
          totalFailed++;
        } finally {
          const testDuration = Date.now() - testStart;
          results.push({
            name: test.name,
            suite: suite.name,
            passed,
            error: testError ? (testError.stack || testError.message || String(testError)) : undefined,
            durationMs: testDuration
          });
          totalTests++;
        }

        // Run afterEach
        for (const hook of suite.afterEach) {
          try {
            await hook();
          } catch (err: any) {
            console.error(`[afterEach Error]:`, err);
          }
        }
      }

      // Run afterAll
      for (const hook of suite.afterAll) {
        try {
          await hook();
        } catch (err: any) {
          console.error(`[afterAll Error in ${suite.name}]:`, err);
        }
      }

      summaries.push({
        name: suite.name,
        total: suite.tests.length,
        passed: suitePassed,
        failed: suiteFailed,
        durationMs: Date.now() - suiteStart,
        results
      });
    }

    return { summaries, totalPassed, totalFailed, totalTests };
  }

  clear() {
    this.suites = [];
    this.currentSuite = null;
  }
}

export const registry = new TestRegistry();

export const describe = (name: string, fn: () => void) => registry.describe(name, fn);
export const test = (name: string, fn: TestFn) => registry.test(name, fn);
export const it = test;
export const beforeEach = (fn: HookFn) => registry.beforeEach(fn);
export const afterEach = (fn: HookFn) => registry.afterEach(fn);
export const beforeAll = (fn: HookFn) => registry.beforeAll(fn);
export const afterAll = (fn: HookFn) => registry.afterAll(fn);

// -------------------------------------------------------------
// Assertions Engine
// -------------------------------------------------------------

function isDeepEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || typeof a !== 'object' || b === null || typeof b !== 'object') return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp) return a.toString() === b.toString();
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!isDeepEqual(a[key], b[key])) return false;
  }
  return true;
}

function matchPartial(actual: any, expected: any): boolean {
  if (expected === null || typeof expected !== 'object') {
    return Object.is(actual, expected);
  }
  if (actual === null || typeof actual !== 'object') return false;

  for (const key of Object.keys(expected)) {
    if (!(key in actual)) return false;
    if (typeof expected[key] === 'object' && expected[key] !== null) {
      if (!matchPartial(actual[key], expected[key])) return false;
    } else if (!Object.is(actual[key], expected[key])) {
      return false;
    }
  }
  return true;
}

export interface Matchers<T> {
  toBe(expected: any): void;
  toEqual(expected: any): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toBeNull(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeGreaterThan(n: number): void;
  toBeGreaterThanOrEqual(n: number): void;
  toBeLessThan(n: number): void;
  toBeLessThanOrEqual(n: number): void;
  toBeCloseTo(expected: number, precision?: number): void;
  toContain(item: any): void;
  toHaveLength(length: number): void;
  toMatch(pattern: RegExp | string): void;
  toMatchObject(partial: any): void;
  toThrow(expected?: string | RegExp): void;
  not: Matchers<T>;
}

export function expect<T = any>(actual: T): Matchers<T> {
  const createMatchers = (isNot: boolean): Matchers<T> => ({
    toBe(expected: any) {
      const pass = Object.is(actual, expected);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to be' : 'to be'} ${JSON.stringify(expected)}`);
      }
    },
    toEqual(expected: any) {
      const pass = isDeepEqual(actual, expected);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to deeply equal' : 'to deeply equal'} ${JSON.stringify(expected)}`);
      }
    },
    toBeDefined() {
      const pass = actual !== undefined;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected value ${isNot ? 'to be undefined' : 'to be defined'}, received ${actual}`);
      }
    },
    toBeUndefined() {
      const pass = actual === undefined;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected value ${isNot ? 'not to be undefined' : 'to be undefined'}, received ${actual}`);
      }
    },
    toBeNull() {
      const pass = actual === null;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected value ${isNot ? 'not to be null' : 'to be null'}, received ${actual}`);
      }
    },
    toBeTruthy() {
      const pass = Boolean(actual);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to be truthy' : 'to be truthy'}`);
      }
    },
    toBeFalsy() {
      const pass = !actual;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to be falsy' : 'to be falsy'}`);
      }
    },
    toBeGreaterThan(n: number) {
      const pass = (actual as any) > n;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? 'not to be >' : 'to be >'} ${n}`);
      }
    },
    toBeGreaterThanOrEqual(n: number) {
      const pass = (actual as any) >= n;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? 'not to be >=' : 'to be >='} ${n}`);
      }
    },
    toBeLessThan(n: number) {
      const pass = (actual as any) < n;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? 'not to be <' : 'to be <'} ${n}`);
      }
    },
    toBeLessThanOrEqual(n: number) {
      const pass = (actual as any) <= n;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? 'not to be <=' : 'to be <='} ${n}`);
      }
    },
    toBeCloseTo(expected: number, precision: number = 2) {
      const diff = Math.abs((actual as any) - expected);
      const tolerance = Math.pow(10, -precision) / 2;
      const pass = diff < tolerance;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? 'not to be close to' : 'to be close to'} ${expected} (within ${tolerance})`);
      }
    },
    toContain(item: any) {
      let pass = false;
      if (typeof (actual as any)?.includes === 'function') {
        pass = (actual as any).includes(item);
      } else if (actual instanceof Set || actual instanceof Map) {
        pass = actual.has(item);
      } else if (Array.isArray(actual)) {
        pass = actual.some(x => isDeepEqual(x, item));
      }
      if (isNot ? pass : !pass) {
        throw new Error(`Expected collection ${isNot ? 'not to contain' : 'to contain'} ${JSON.stringify(item)}`);
      }
    },
    toHaveLength(len: number) {
      const actualLen = (actual as any)?.length;
      const pass = actualLen === len;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected length ${isNot ? 'not to be' : 'to be'} ${len}, received ${actualLen}`);
      }
    },
    toMatch(pattern: RegExp | string) {
      const str = String(actual);
      const pass = typeof pattern === 'string' ? str.includes(pattern) : pattern.test(str);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected string "${str}" ${isNot ? 'not to match' : 'to match'} ${pattern}`);
      }
    },
    toMatchObject(partial: any) {
      const pass = matchPartial(actual, partial);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected object ${JSON.stringify(actual)} ${isNot ? 'not to match partial' : 'to match partial'} ${JSON.stringify(partial)}`);
      }
    },
    toThrow(expected?: string | RegExp) {
      let thrown = false;
      let thrownError: any = null;
      if (typeof actual !== 'function') {
        throw new Error(`expect(actual).toThrow() requires actual to be a function, received ${typeof actual}`);
      }
      try {
        (actual as any)();
      } catch (err: any) {
        thrown = true;
        thrownError = err;
      }
      if (!isNot && !thrown) {
        throw new Error(`Expected function to throw an error, but it did not throw.`);
      }
      if (isNot && thrown) {
        throw new Error(`Expected function not to throw, but it threw: ${thrownError?.message || thrownError}`);
      }
      if (thrown && expected) {
        const msg = thrownError?.message || String(thrownError);
        const match = typeof expected === 'string' ? msg.includes(expected) : expected.test(msg);
        if (isNot ? match : !match) {
          throw new Error(`Expected error message "${msg}" ${isNot ? 'not to match' : 'to match'} ${expected}`);
        }
      }
    },
    get not() {
      return createMatchers(!isNot);
    }
  });

  return createMatchers(false);
}

// -------------------------------------------------------------
// Mock Headless Environment Harness
// -------------------------------------------------------------

export class MockCanvasRenderingContext2D {
  public operations: Array<{ method: string; args: any[] }> = [];
  public fillStyle: string = '#000000';
  public strokeStyle: string = '#000000';
  public lineWidth: number = 1;
  public globalAlpha: number = 1.0;
  public shadowColor: string = 'transparent';
  public shadowBlur: number = 0;
  public shadowOffsetX: number = 0;
  public shadowOffsetY: number = 0;
  public font: string = '10px sans-serif';
  public textAlign: string = 'start';
  public textBaseline: string = 'alphabetic';

  beginPath() { this.operations.push({ method: 'beginPath', args: [] }); }
  closePath() { this.operations.push({ method: 'closePath', args: [] }); }
  moveTo(x: number, y: number) { this.operations.push({ method: 'moveTo', args: [x, y] }); }
  lineTo(x: number, y: number) { this.operations.push({ method: 'lineTo', args: [x, y] }); }
  rect(x: number, y: number, w: number, h: number) { this.operations.push({ method: 'rect', args: [x, y, w, h] }); }
  arc(x: number, y: number, r: number, sa: number, ea: number) { this.operations.push({ method: 'arc', args: [x, y, r, sa, ea] }); }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, sa: number, ea: number) {
    this.operations.push({ method: 'ellipse', args: [x, y, rx, ry, rot, sa, ea] });
  }
  fill() { this.operations.push({ method: 'fill', args: [this.fillStyle, this.globalAlpha] }); }
  stroke() { this.operations.push({ method: 'stroke', args: [this.strokeStyle, this.lineWidth] }); }
  drawImage(image: any, ...args: number[]) { this.operations.push({ method: 'drawImage', args: [image?.src || image, ...args] }); }
  fillText(text: string, x: number, y: number, maxWidth?: number) { this.operations.push({ method: 'fillText', args: [text, x, y, maxWidth] }); }
  save() { this.operations.push({ method: 'save', args: [] }); }
  restore() { this.operations.push({ method: 'restore', args: [] }); }
  scale(x: number, y: number) { this.operations.push({ method: 'scale', args: [x, y] }); }
  translate(x: number, y: number) { this.operations.push({ method: 'translate', args: [x, y] }); }
  rotate(angle: number) { this.operations.push({ method: 'rotate', args: [angle] }); }
  clearRect(x: number, y: number, w: number, h: number) { this.operations.push({ method: 'clearRect', args: [x, y, w, h] }); }
  measureText(text: string) { return { width: text.length * 8, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }; }
}

export class MockCanvas {
  public width: number = 800;
  public height: number = 600;
  public context: MockCanvasRenderingContext2D = new MockCanvasRenderingContext2D();

  getContext(type: string) {
    if (type === '2d') return this.context;
    return null;
  }

  toDataURL(type: string = 'image/png') {
    return `data:${type};base64,mockCanvasBase64Data_${this.width}x${this.height}`;
  }

  async convertToBlob(options?: { type?: string; quality?: number }): Promise<Blob> {
    const type = options?.type || 'image/png';
    const content = `MockBlobData_${this.width}x${this.height}_${type}`;
    return new Blob([content], { type });
  }

  toBlob(callback: (blob: Blob | null) => void, type: string = 'image/png') {
    this.convertToBlob({ type }).then(callback).catch(() => callback(null));
  }
}

export class MockClipboard {
  public items: any[] = [];
  public textContent: string = '';

  async write(data: any[]): Promise<void> {
    this.items = data;
  }

  async writeText(text: string): Promise<void> {
    this.textContent = text;
  }

  async read(): Promise<any[]> {
    return this.items;
  }

  async readText(): Promise<string> {
    return this.textContent;
  }
}

// Global setup helper
export function setupMockEnvironment() {
  if (typeof globalThis.navigator === 'undefined') {
    (globalThis as any).navigator = {};
  }
  if (!globalThis.navigator.clipboard) {
    (globalThis.navigator as any).clipboard = new MockClipboard();
  }

  if (typeof globalThis.OffscreenCanvas === 'undefined') {
    (globalThis as any).OffscreenCanvas = function (w: number, h: number) {
      const c = new MockCanvas();
      c.width = w;
      c.height = h;
      return c;
    };
  }

  if (typeof globalThis.ClipboardItem === 'undefined') {
    (globalThis as any).ClipboardItem = class ClipboardItem {
      public data: Record<string, Blob>;
      public types: string[];
      constructor(data: Record<string, Blob>) {
        this.data = data;
        this.types = Object.keys(data);
      }
      async getType(type: string): Promise<Blob> {
        if (!this.data[type]) throw new Error(`Type ${type} not found in ClipboardItem`);
        return this.data[type];
      }
    };
  }
}

// -------------------------------------------------------------
// Test Execution & CLI Reporter
// -------------------------------------------------------------

export async function runCli(): Promise<boolean> {
  setupMockEnvironment();

  console.log('\n=============================================================');
  console.log('  ANOT8 4-TIER E2E TEST SUITE RUNNER');
  console.log('=============================================================\n');

  const startTime = Date.now();
  const { summaries, totalPassed, totalFailed, totalTests } = await registry.runAll();
  const totalDuration = Date.now() - startTime;

  console.log('-------------------------------------------------------------');
  console.log('  TEST EXECUTION RESULTS BY SUITE');
  console.log('-------------------------------------------------------------');

  for (const summary of summaries) {
    const statusSymbol = summary.failed === 0 ? '✓ PASS' : '✗ FAIL';
    console.log(`\n${statusSymbol} [${summary.durationMs}ms] ${summary.name} (${summary.passed}/${summary.total})`);

    for (const res of summary.results) {
      if (!res.passed) {
        console.log(`    ✗ ${res.name} (${res.durationMs}ms)`);
        console.log(`      Error: ${res.error}`);
      } else {
        console.log(`    ✓ ${res.name} (${res.durationMs}ms)`);
      }
    }
  }

  console.log('\n=============================================================');
  console.log('  TEST SUMMARY REPORT');
  console.log('=============================================================');
  console.log(`  Total Suites:    ${summaries.length}`);
  console.log(`  Total Tests:     ${totalTests}`);
  console.log(`  Passed Tests:    ${totalPassed}`);
  console.log(`  Failed Tests:    ${totalFailed}`);
  console.log(`  Total Duration:  ${totalDuration}ms`);
  console.log(`  Overall Status:  ${totalFailed === 0 ? '✓ ALL TESTS PASSED' : '✗ FAILURES DETECTED'}`);
  console.log('=============================================================\n');

  if (totalFailed > 0) {
    process.exitCode = 1;
    return false;
  }
  process.exitCode = 0;
  return true;
}

// Auto-run if executed directly via tsx
const isDirectExecution = import.meta.url.endsWith(process.argv[1]?.replace(/^file:\/\//, '') || '');
if (isDirectExecution || process.argv[1]?.endsWith('test-runner.ts')) {
  // Dynamically import all test files (baseline regression + R1-R5 enhancements)
  Promise.all([
    import('./tier1-features.test.js').catch(() => import('./tier1-features.test')),
    import('./tier2-boundaries.test.js').catch(() => import('./tier2-boundaries.test')),
    import('./tier3-combinations.test.js').catch(() => import('./tier3-combinations.test')),
    import('./tier4-workloads.test.js').catch(() => import('./tier4-workloads.test')),
    import('./r1-r5-tier1-features.test.js').catch(() => import('./r1-r5-tier1-features.test')),
    import('./r1-r5-tier2-boundaries.test.js').catch(() => import('./r1-r5-tier2-boundaries.test')),
    import('./r1-r5-tier3-combinations.test.js').catch(() => import('./r1-r5-tier3-combinations.test')),
    import('./r1-r5-tier4-workloads.test.js').catch(() => import('./r1-r5-tier4-workloads.test')),
  ]).then(() => {
    return runCli();
  }).catch((err) => {
    console.error('Failed to load test suites:', err);
    process.exit(1);
  });
}
