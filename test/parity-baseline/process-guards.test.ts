import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript harness has no declaration file.
import { createProcessGuard } from '../../scripts/parity-baseline/lib/process.mjs';

const freezeEnvironment = (values: Record<string, string> = { HOME: '/tmp/home', PATH: '/tmp/tool/bin' }) =>
  Object.freeze(Object.assign(Object.create(null), values));
const canonicalize = (value: string) => value.replace('/alias', '/real');
function policy(overrides: Record<string, unknown> = {}) {
  const calls: unknown[] = [];
  const value = {
    target: { id: 'fork' }, repositoryRoot: '/repo', toolRoot: '/tmp/tool', sourceRoot: '/tmp/source', executionRoot: '/tmp/run',
    executable: '/tmp/tool/bin/node', script: '/tmp/source/run.mjs', arguments: ['/tmp/source/run.mjs', 'fixture'], environment: freezeEnvironment(), canonicalize,
    spawn: (input: unknown) => { calls.push(input); return { pid: 1, status: 0, signal: null, stdout: 'ok', stderr: '' }; }, ...overrides,
  };
  return { calls, value };
}
function request(overrides: Record<string, unknown> = {}) {
  return { executable: '/tmp/tool/bin/node', arguments: ['/tmp/source/run.mjs', 'fixture'], cwd: '/tmp/run', environment: freezeEnvironment(), ...overrides };
}
function failure(run: () => unknown, message: string) {
  expect(() => run()).toThrowError(new TypeError(message));
}
function invalidOwn(value: object, key: string, replacement: unknown) {
  Object.defineProperty(value, key, { value: replacement, enumerable: false, configurable: true, writable: true });
  return value;
}

describe('PR3b2 strict pre-spawn qualification', () => {
  it('RED: rejects root aliases, boundaries, malformed policy shapes, and unsafe executable/script bindings', () => {
    for (const [overrides, message] of [
      [{ repositoryRoot: '/' }, 'invalid roots'], [{ toolRoot: '/repo/tool' }, 'invalid roots'], [{ sourceRoot: '/tmp/tool/source' }, 'invalid roots'], [{ executionRoot: '/tmp/source/run' }, 'invalid roots'],
      [{ executable: '/tmp/tool/bin/bash' }, 'invalid executable policy'], [{ executable: '/tmp/toolkit/bin/node' }, 'invalid executable policy'], [{ executable: '/alias/tool/bin/node' }, 'invalid executable policy'],
      [{ script: '/tmp/source/run.js' }, 'invalid script policy'], [{ script: '/tmp/sourcekit/run.mjs' }, 'invalid script policy'], [{ script: '/alias/source/run.mjs' }, 'invalid script policy'], [{ target: { id: '../fork' } }, 'invalid process policy'],
    ] as const) failure(() => createProcessGuard(policy(overrides).value), message);
    const extra = policy().value as Record<string, unknown>; extra.extra = true;
    failure(() => createProcessGuard(extra), 'invalid process policy');
    const inherited = Object.create(policy().value); failure(() => createProcessGuard(inherited), 'invalid process policy');
    const accessor = policy().value; Object.defineProperty(accessor, 'spawn', { enumerable: true, configurable: true, get: () => () => ({}) });
    failure(() => createProcessGuard(accessor), 'invalid process policy');
  });

  it('RED: accepts only script-first inert operand atoms and exact frozen null-prototype environment policy', () => {
    for (const argumentsValue of [[], ['fixture', '/tmp/source/run.mjs'], ['/tmp/source/run.mjs', '-e'], ['/tmp/source/run.mjs', '--inspect'], ['/tmp/source/run.mjs', '@response'], ['/tmp/source/run.mjs', 'a b'], ['/tmp/source/run.mjs', 'a;b'], ['/tmp/source/run.mjs', 'a\u0001'], ['/tmp/source/run.mjs', '/bin/sh'], ['/tmp/source/run.mjs', '/tmp/source/run.mjs']]) {
      failure(() => createProcessGuard(policy({ arguments: argumentsValue }).value), 'invalid argument policy');
    }
    const sparse = ['/tmp/source/run.mjs', 'ok']; delete sparse[1];
    failure(() => createProcessGuard(policy({ arguments: sparse }).value), 'invalid argument policy');
    for (const environment of [{ HOME: '/tmp/home' }, Object.freeze({ HOME: '/tmp/home' }), freezeEnvironment({ HOME: '/tmp\u0001' })]) {
      failure(() => createProcessGuard(policy({ environment }).value), 'invalid environment policy');
    }
    const guard = createProcessGuard(policy().value);
    expect(Object.isFrozen(guard)).toBe(true);
  });

  it('RED: rejects every untrusted request before spawn with exact errors and validates cwd physically', () => {
    const rows: Record<string, unknown>[] = [
      { executable: '/tmp/tool/bin/node2' }, { executable: '/alias/tool/bin/node' }, { cwd: '/tmp' }, { cwd: '/alias/run' },
      { arguments: ['/tmp/source/run.mjs'] }, { arguments: ['fixture', '/tmp/source/run.mjs'] }, { arguments: ['/tmp/source/run.mjs', 'fixture', 'extra'] },
      { environment: freezeEnvironment({ HOME: '/tmp/home', PATH: '/tmp/tool/bin', EXTRA: 'x' }) }, { environment: freezeEnvironment({ HOME: '/tmp/changed', PATH: '/tmp/tool/bin' }) },
    ];
    for (const row of rows) { const input = policy(); failure(() => createProcessGuard(input.value).run(request(row)), 'invalid process request'); expect(input.calls).toHaveLength(0); }
    const malformed = request(); invalidOwn(malformed, 'cwd', '/tmp/run');
    const input = policy(); failure(() => createProcessGuard(input.value).run(malformed), 'invalid process request'); expect(input.calls).toHaveLength(0);
  });

  it('RED: freezes exact spawn input and rejects malformed results without recording', () => {
    const input = policy(); const guard = createProcessGuard(input.value); const record = guard.run(request());
    const spawnInput = input.calls[0] as Record<string, unknown>;
    expect(Object.keys(spawnInput)).toEqual(['executable', 'arguments', 'cwd', 'environment', 'options']);
    expect(spawnInput.options).toEqual({ shell: false, detached: false, stdio: 'pipe', windowsHide: true });
    expect(Object.isFrozen(spawnInput)).toBe(true); expect(Object.isFrozen(spawnInput.arguments)).toBe(true); expect(Object.isFrozen(spawnInput.environment)).toBe(true); expect(Object.isFrozen(spawnInput.options)).toBe(true);
    expect(Object.isFrozen(record)).toBe(true); expect(Object.isFrozen(record.result)).toBe(true); expect(Object.isFrozen(guard.records())).toBe(true);
    for (const result of [{ pid: 0, status: 0, signal: null, stdout: '', stderr: '' }, { pid: 1, status: null, signal: 'sigterm', stdout: '', stderr: '' }, { pid: 1, status: 0, signal: null, stdout: '\u007f', stderr: '' }, { pid: 1, status: 0, signal: null, stdout: '', stderr: '', extra: true }]) {
      const bad = policy({ spawn: () => result }); const clean = createProcessGuard(bad.value); failure(() => clean.run(request()), 'invalid spawn result'); expect(clean.records()).toEqual([]);
    }
  });

  it('RED: snapshots all inputs, records independently, and keeps rereads immutable', () => {
    const args = ['/tmp/source/run.mjs', 'fixture']; const environment = freezeEnvironment(); const input = policy({ arguments: args, environment }); const guard = createProcessGuard(input.value);
    args[1] = 'changed'; const first = guard.run(request({ environment }));
    const results = guard.records(); expect(results).toHaveLength(1); expect(guard.records()).not.toBe(results);
    expect(first).toMatchObject({ target: 'fork', arguments: ['/tmp/source/run.mjs', 'fixture'], environment: { HOME: '/tmp/home' } });
    const secondInput = policy({ target: { id: 'upstream' } }); const second = createProcessGuard(secondInput.value); second.run(request());
    expect(second.records()).toHaveLength(1); expect(guard.records()).toHaveLength(1);
  });

  it('rejects physical root collisions, malformed canonical values, and relative executable or script policy values', () => {
    failure(() => createProcessGuard(policy({ canonicalize: (value: string) => value === '/repo' ? '/tmp/tool' : value }).value), 'invalid roots');
    for (const canonicalize of [() => 'relative', () => { throw new Error('no'); }]) failure(() => createProcessGuard(policy({ canonicalize }).value), 'invalid roots');
    failure(() => createProcessGuard(policy({ executable: 'node' }).value), 'invalid executable policy');
    failure(() => createProcessGuard(policy({ script: 'run.mjs' }).value), 'invalid script policy');
  });

  it('rejects an array whose own length descriptor is not the exact writable data descriptor', () => {
    const readonly = (value: string[]) => Object.defineProperty(value, 'length', { value: value.length, enumerable: false, configurable: false, writable: false });
    const policyArguments = ['/tmp/source/run.mjs', 'fixture']; readonly(policyArguments);
    failure(() => createProcessGuard(policy({ arguments: policyArguments }).value), 'invalid argument policy');
    const requestArguments = ['/tmp/source/run.mjs', 'fixture']; readonly(requestArguments);
    const input = policy(); failure(() => createProcessGuard(input.value).run(request({ arguments: requestArguments })), 'invalid process request'); expect(input.calls).toHaveLength(0);
    const accessor = Object.create(Array.prototype); Object.defineProperty(accessor, 'length', { get: () => 2 });
    failure(() => createProcessGuard(policy({ arguments: accessor }).value), 'invalid argument policy');
  });

  it('triangulates argument own-descriptor grammar and request exact shapes before spawn', () => {
    for (const argumentsValue of [
      null,
      Object.assign(['/tmp/source/run.mjs', 'fixture'], { [Symbol('x')]: 'x' }),
      Object.defineProperty(['/tmp/source/run.mjs', 'fixture'], '1', { value: 'fixture', enumerable: true, configurable: true, writable: false }),
      (() => { const value = ['/tmp/source/run.mjs', 'fixture']; Object.defineProperty(value, '1', { enumerable: true, configurable: true, get: () => 'fixture' }); return value; })(),
      (() => { const value = ['/tmp/source/run.mjs', 'fixture']; delete value[1]; return value; })(),
      ['/tmp/source/run.mjs', '-r'], ['/tmp/source/run.mjs', '--require'], ['/tmp/source/run.mjs', '--import'], ['/tmp/source/run.mjs', '--inspect=0'], ['/tmp/source/run.mjs', 'a\u007f'], ['/tmp/source/run.mjs', 'a\u0085'],
    ]) failure(() => createProcessGuard(policy({ arguments: argumentsValue }).value), 'invalid argument policy');
    for (const mutate of [
      (value: Record<string, unknown>) => { value.arguments = null; },
      (value: Record<string, unknown>) => { value.extra = true; },
      (value: Record<string, unknown>) => Object.setPrototypeOf(value, { executable: '/tmp/tool/bin/node' }),
      (value: Record<string, unknown>) => Object.defineProperty(value, 'cwd', { enumerable: true, configurable: true, get: () => '/tmp/run' }),
      (value: Record<string, unknown>) => Object.defineProperty(value, Symbol('x'), { value: 'x' }),
      (value: Record<string, unknown>) => { const args = value.arguments as string[]; Object.defineProperty(args, '1', { value: 'fixture', enumerable: false, configurable: true, writable: true }); },
      (value: Record<string, unknown>) => { const env = Object.create(null); Object.defineProperty(env, 'HOME', { value: '/tmp/home', enumerable: false, configurable: false, writable: false }); Object.defineProperty(env, 'PATH', { value: '/tmp/tool/bin', enumerable: true, configurable: false, writable: false }); value.environment = Object.freeze(env); },
    ]) {
      const input = policy(); const value = request() as Record<string, unknown>; mutate(value);
      failure(() => createProcessGuard(input.value).run(value), 'invalid process request'); expect(input.calls).toHaveLength(0);
    }
  });

  it('rejects every malformed exact result shape without retaining a record', () => {
    const valid = { pid: 1, status: 0, signal: null, stdout: 'ok', stderr: '' };
    const rows = [
      { ...valid, status: -1 }, { ...valid, status: 0, signal: 'SIGTERM' }, { ...valid, status: null, signal: null },
      { ...valid, pid: '1' }, { ...valid, status: 0.5 }, { ...valid, signal: 'sigterm' }, { ...valid, stdout: 1 }, { ...valid, stderr: '\u0085' },
      Object.assign(Object.create({}), valid), Object.assign({ ...valid }, { [Symbol('x')]: true }),
      Object.defineProperty({ ...valid }, 'stdout', { value: 'ok', enumerable: false, configurable: true, writable: true }),
      Object.defineProperty({ ...valid }, 'stderr', { enumerable: true, configurable: true, get: () => '' }),
    ];
    for (const spawned of rows) { const input = policy({ spawn: () => spawned }); const guard = createProcessGuard(input.value); failure(() => guard.run(request()), 'invalid spawn result'); expect(guard.records()).toEqual([]); }
  });

  it('captures validated callable seams and returns deep immutable independent snapshots', () => {
    let requestPhase = false; let canonicalCalls = 0; const calls: unknown[] = [];
    const mutableResult = { pid: 1, status: 0, signal: null, stdout: 'ok', stderr: '' };
    const input = policy({ canonicalize: (value: string) => { canonicalCalls += 1; return requestPhase && value === '/tmp/run' ? '/tmp/other' : value; }, spawn: (value: unknown) => { calls.push(value); return mutableResult; } });
    const guard = createProcessGuard(input.value); requestPhase = true;
    failure(() => guard.run(request()), 'invalid process request'); expect(calls).toHaveLength(0);
    requestPhase = false; const capturedCanonical = canonicalCalls; const capturedSpawn = input.value.spawn;
    input.value.canonicalize = () => '/tmp/other'; input.value.spawn = () => { throw new Error('mutable seam read'); };
    const record = guard.run(request()); mutableResult.stdout = 'changed';
    expect(canonicalCalls).toBeGreaterThan(capturedCanonical); expect(calls).toHaveLength(1); expect(capturedSpawn).not.toBe(input.value.spawn);
    expect(record.result.stdout).toBe('ok'); expect(Object.keys(record)).toEqual(['target', 'executable', 'arguments', 'cwd', 'environment', 'options', 'result']);
    for (const value of [record, record.arguments, record.environment, record.options, record.result, guard.records()]) expect(Object.isFrozen(value)).toBe(true);
    expect(guard.records()).not.toBe(guard.records()); const other = createProcessGuard(policy({ target: { id: 'upstream' } }).value); other.run(request()); expect(other.records()).toHaveLength(1); expect(guard.records()).toHaveLength(1);
  });

  it('RED: binds the request script to its sealed physical identity before spawn', () => {
    let requestPhase = false; const input = policy({ canonicalize: (value: string) => requestPhase && value === '/tmp/source/run.mjs' ? '/tmp/elsewhere/run.mjs' : value });
    const guard = createProcessGuard(input.value); requestPhase = true;
    failure(() => guard.run(request()), 'invalid process request'); expect(input.calls).toHaveLength(0);
  });

  it('RED: rejects wrapper-equivalent argument atoms including path-qualified dispatchers', () => {
    for (const atom of ['sh', '/bin/bash', 'cmd.exe', 'powershell', '/usr/bin/env', 'dash', '/bin/dash', 'node', 'node.exe', '/tmp/tool/bin/node', '/tmp/tool/bin/node.exe']) {
      failure(() => createProcessGuard(policy({ arguments: ['/tmp/source/run.mjs', atom] }).value), 'invalid argument policy');
    }
  });

  it('records a valid signalled result as a deeply frozen deterministic snapshot', () => {
    const input = policy({ spawn: () => ({ pid: 2, status: null, signal: 'SIGTERM', stdout: '', stderr: '' }) }); const guard = createProcessGuard(input.value);
    const record = guard.run(request());
    expect(record).toEqual({ target: 'fork', executable: '/tmp/tool/bin/node', arguments: ['/tmp/source/run.mjs', 'fixture'], cwd: '/tmp/run', environment: freezeEnvironment(), options: { shell: false, detached: false, stdio: 'pipe', windowsHide: true }, result: { pid: 2, status: null, signal: 'SIGTERM', stdout: '', stderr: '' } });
    for (const value of [record, record.arguments, record.environment, record.options, record.result, guard.records()]) expect(Object.isFrozen(value)).toBe(true);
    expect(guard.records()).toEqual([record]); expect(guard.records()).not.toBe(guard.records());
  });

  it('snapshots mutable request-owned properties before spawn and preserves frozen rereads', () => {
    const calls: Record<string, unknown>[] = []; const input = policy({ spawn: (value: Record<string, unknown>) => { calls.push(value); return { pid: 1, status: 0, signal: null, stdout: 'ok', stderr: '' }; } }); const guard = createProcessGuard(input.value);
    const mutable = request(); const args = mutable.arguments as string[]; const record = guard.run(mutable);
    mutable.executable = '/tmp/tool/bin/other'; mutable.cwd = '/tmp/other'; mutable.environment = freezeEnvironment({ HOME: '/tmp/other', PATH: '/tmp/tool/bin' }); args[1] = 'changed'; mutable.arguments = ['changed'];
    expect(calls[0]).toEqual({ executable: '/tmp/tool/bin/node', arguments: ['/tmp/source/run.mjs', 'fixture'], cwd: '/tmp/run', environment: freezeEnvironment(), options: { shell: false, detached: false, stdio: 'pipe', windowsHide: true } });
    expect(record).toEqual(guard.records()[0]); expect(record.arguments).toEqual(['/tmp/source/run.mjs', 'fixture']); expect(record.environment).toEqual(freezeEnvironment());
    for (const value of [calls[0], record, record.arguments, record.environment, record.options, record.result, guard.records()]) expect(Object.isFrozen(value)).toBe(true);
  });
});
