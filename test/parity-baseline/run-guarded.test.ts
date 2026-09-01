import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript harness has no declaration file.
import { GuardedRunError, runGuarded } from '../../scripts/parity-baseline/lib/run-guarded.mjs';

type Report = { clean: boolean; differences: unknown[] };
const freeze = <T>(value: T): T => Object.freeze(value);
const guard = (options: { before?: unknown; after?: unknown; report?: Report; captureError?: 'before' | 'after'; compareError?: boolean; calls?: string[] } = {}) => {
  const calls = options.calls ?? []; let captures = 0;
  const capture = freeze(() => { calls.push(captures++ === 0 ? 'before' : 'after'); if ((captures === 1 && options.captureError === 'before') || (captures === 2 && options.captureError === 'after')) throw new Error(`capture-${captures}`); return captures === 1 ? (options.before ?? { id: 'before' }) : (options.after ?? { id: 'after' }); });
  const compare = freeze((before: unknown, after: unknown) => { calls.push('compare'); if (options.compareError) throw new Error('compare'); expect(before).toBe(options.before ?? before); expect(after).toBe(options.after ?? after); return options.report ?? freeze({ clean: true, differences: freeze([]) }); });
  return { guard: freeze({ capture, compare }), calls };
};
const config = (guardValue: unknown, execute: () => unknown) => ({ guard: guardValue, execute });
const expectFailure = (call: () => unknown, primary: unknown, contamination: unknown) => {
  try { call(); throw new Error('expected GuardedRunError'); } catch (error) {
    expect(error).toBeInstanceOf(GuardedRunError); expect(error).toMatchObject({ name: 'GuardedRunError', code: 'GUARDED_RUN_FAILED', primary, contamination });
    return error as { primary: unknown; contamination: unknown };
  }
};

describe('runGuarded', () => {
  it('RED: returns fresh deep-frozen clean settlements for primitive and nested returned values', () => {
    const first = guard(); const result = runGuarded(config(first.guard, () => ({ kind: 'returned', value: { list: [true, 'ok', null] } })));
    expect(result).toEqual({ value: { list: [true, 'ok', null] }, report: { clean: true, differences: [] } }); expect(first.calls).toEqual(['before', 'after', 'compare']);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.value.list)).toBe(true); expect(Object.isFrozen(result.report.differences)).toBe(true);
    expect(() => { (result.value.list as unknown[]).push(false); }).toThrow();
    const second = guard(); expect(runGuarded(config(second.guard, () => ({ kind: 'returned', value: 7 })))).toEqual({ value: 7, report: { clean: true, differences: [] } });
  });

  it('settles direct throws and modeled crash/timeout outcomes without losing their primary', () => {
    for (const [outcome, primary] of [
      [() => { throw new Error('boom'); }, { kind: 'threw', name: 'Error', message: 'boom' }],
      [() => ({ kind: 'crashed', error: { name: 'AbortError', message: 'gone' } }), { kind: 'crashed', name: 'AbortError', message: 'gone' }],
      [() => ({ kind: 'timed-out', timeoutMs: 5 }), { kind: 'timed-out', timeoutMs: 5 }],
    ] as const) { const item = guard(); expectFailure(() => runGuarded(config(item.guard, outcome)), primary, null); expect(item.calls).toEqual(['before', 'after', 'compare']); }
  });

  it('preserves contamination alone and with every primary branch', () => {
    const dirty = freeze({ clean: false, differences: freeze([{ area: 'git' }]) });
    for (const [outcome, primary] of [
      [() => ({ kind: 'returned', value: 'ok' }), null],
      [() => { throw new Error('boom'); }, { kind: 'threw', name: 'Error', message: 'boom' }],
      [() => ({ kind: 'crashed', error: { name: 'Crash', message: 'bad' } }), { kind: 'crashed', name: 'Crash', message: 'bad' }],
      [() => ({ kind: 'timed-out', timeoutMs: 9 }), { kind: 'timed-out', timeoutMs: 9 }],
    ] as const) { const item = guard({ report: dirty }); const error = expectFailure(() => runGuarded(config(item.guard, outcome)), primary, dirty); expect(Object.isFrozen(error.contamination)).toBe(true); expect(item.calls).toEqual(['before', 'after', 'compare']); }
  });

  it('fails closed for malformed returned envelopes, values, and non-Error throws while still settling', () => {
    const circular: { self?: unknown } = {}; circular.self = circular;
    for (const execute of [
      () => ({ kind: 'unknown' }), () => ({ kind: 'returned', value: [undefined] }), () => ({ kind: 'returned', value: circular }), () => ({ kind: 'returned', value: Infinity }),
    ]) { const item = guard(); const error = expectFailure(() => runGuarded(config(item.guard, execute)), expect.objectContaining({ kind: 'malformed' }), null); expect(Object.isFrozen(error.primary)).toBe(true); expect(item.calls).toEqual(['before', 'after', 'compare']); }
    const nonError = guard(); expectFailure(() => runGuarded(config(nonError.guard, () => { throw 'bad'; })), { kind: 'threw', name: 'Error', message: 'invalid thrown error' }, null); expect(nonError.calls).toEqual(['before', 'after', 'compare']);
  });

  it('fails before execute when before capture fails, and retains after/compare settlement failures beside primaries', () => {
    const before = guard({ captureError: 'before' }); let calls = 0;
    expectFailure(() => runGuarded(config(before.guard, () => { calls += 1; return { kind: 'returned', value: 1 }; })), expect.objectContaining({ kind: 'before-capture' }), null); expect(calls).toBe(0); expect(before.calls).toEqual(['before']);
    for (const options of [{ captureError: 'after' as const }, { compareError: true }]) {
      for (const [execute, primary] of [[() => ({ kind: 'returned', value: 1 }), null], [() => { throw new Error('x'); }, { kind: 'threw', name: 'Error', message: 'x' }], [() => ({ kind: 'crashed', error: { name: 'C', message: 'x' } }), { kind: 'crashed', name: 'C', message: 'x' }], [() => ({ kind: 'timed-out', timeoutMs: 1 }), { kind: 'timed-out', timeoutMs: 1 }]] as const) {
        const item = guard(options); const error = expectFailure(() => runGuarded(config(item.guard, execute)), primary, expect.objectContaining({ kind: 'settlement', stage: options.captureError ? 'after-capture' : 'compare' })); expect(item.calls).toEqual(options.captureError ? ['before', 'after'] : ['before', 'after', 'compare']); expect(Object.isFrozen(error.contamination)).toBe(true);
      }
    }
  });

  it('snapshots exact config and guard seams and rejects hostile descriptors', () => {
    const item = guard(); const execute = () => ({ kind: 'returned', value: 'first' }); const input = config(item.guard, execute); expect(runGuarded(input)).toEqual({ value: 'first', report: { clean: true, differences: [] } });
    for (const invalid of [{ guard: item.guard }, { guard: item.guard, execute, extra: true }, Object.create(null), { guard: { capture: item.guard.capture, compare: item.guard.compare }, execute }]) expect(() => runGuarded(invalid)).toThrow(TypeError);
    expect(() => { (item.guard as { capture: unknown }).capture = () => null; }).toThrow();
  });

  it('uses snapshotted execute and exposes independent immutable error copies', () => {
    const calls: string[] = []; let input: { guard: unknown; execute: () => unknown };
    const changingGuard = freeze({ capture: freeze(() => { calls.push(calls.length ? 'after' : 'before'); if (calls.length === 1) input.execute = () => ({ kind: 'returned', value: 'second' }); return {}; }), compare: freeze(() => { calls.push('compare'); return freeze({ clean: true, differences: freeze([]) }); }) });
    input = config(changingGuard, () => ({ kind: 'returned', value: 'first' })); expect(runGuarded(input)).toEqual({ value: 'first', report: { clean: true, differences: [] } }); expect(calls).toEqual(['before', 'after', 'compare']);
    const dirty = guard({ report: freeze({ clean: false, differences: freeze([{ nested: { value: 1 } }]) }) }); const error = expectFailure(() => runGuarded(config(dirty.guard, () => { throw new Error('immutable'); })), expect.objectContaining({ kind: 'threw' }), expect.objectContaining({ clean: false }));
    expect(Object.isFrozen(error.primary)).toBe(true); expect(Object.isFrozen((error.contamination as { differences: unknown[] }).differences)).toBe(true); expect(() => { ((error.contamination as { differences: unknown[] }).differences as unknown[]).push({}); }).toThrow();
  });

  it('RED: settles hostile errors, descriptor seams, structural values, and contradictory reports deterministically', () => {
    const hostile = new Proxy(new Error('leak'), { get() { throw new Error('trap'); }, getPrototypeOf() { throw new Error('trap'); } }); const safe = new Error('safe');
    for (const thrown of [hostile, { name: 'plain', message: 'value' }, safe]) {
      const item = guard(); const error = expectFailure(() => runGuarded(config(item.guard, () => { throw thrown; })), expect.objectContaining({ kind: 'threw' }), null) as { primary: { name: string; message: string } };
      expect(error.primary).toEqual(thrown === safe ? { kind: 'threw', name: 'Error', message: 'safe' } : { kind: 'threw', name: 'Error', message: 'invalid thrown error' }); expect(item.calls).toEqual(['before', 'after', 'compare']);
    }
    const item = guard(); const alternate = freeze(() => ({ kind: 'returned', value: 'alternate' }));
    const proxiedConfig = new Proxy(config(item.guard, () => ({ kind: 'returned', value: 'original' })), { get(target, key) { return key === 'execute' ? alternate : Reflect.get(target, key); } });
    expect(runGuarded(proxiedConfig)).toEqual({ value: 'original', report: { clean: true, differences: [] } });
    const protoData = Object.defineProperty({}, '__proto__', { value: 'data', enumerable: true, configurable: true, writable: true });
    const protoResult = runGuarded(config(guard().guard, () => ({ kind: 'returned', value: protoData }))); expect(Object.getPrototypeOf(protoResult.value)).toBe(Object.prototype); expect(Object.getOwnPropertyDescriptor(protoResult.value, '__proto__')?.value).toBe('data');
    for (const value of [new Date(), new Map(), { bad: BigInt(1) }, { bad: -0 }, { bad: NaN }, { bad: Infinity }]) {
      const current = guard(); expectFailure(() => runGuarded(config(current.guard, () => ({ kind: 'returned', value }))), { kind: 'malformed', reason: 'invalid outcome' }, null); expect(current.calls).toEqual(['before', 'after', 'compare']);
    }
    const shared = {}; const current = guard(); expectFailure(() => runGuarded(config(current.guard, () => ({ kind: 'returned', value: { one: shared, two: shared } }))), { kind: 'malformed', reason: 'invalid outcome' }, null);
    for (const report of [freeze({ clean: true, differences: freeze([{}]) }), freeze({ clean: false, differences: freeze([]) })]) {
      const dirty = guard({ report }); const error = expectFailure(() => runGuarded(config(dirty.guard, () => ({ kind: 'returned', value: 'ok' }))), null, expect.objectContaining({ kind: 'settlement', stage: 'compare' })); expect(dirty.calls).toEqual(['before', 'after', 'compare']); expect(Object.isFrozen(error.contamination)).toBe(true);
    }
    for (const options of [{ captureError: 'after' as const }, { compareError: true }]) {
      const broken = guard(options); const error = expectFailure(() => runGuarded(config(broken.guard, () => { throw hostile; })), { kind: 'threw', name: 'Error', message: 'invalid thrown error' }, expect.objectContaining({ kind: 'settlement' })); expect(broken.calls).toEqual(options.captureError ? ['before', 'after'] : ['before', 'after', 'compare']); expect(Object.isFrozen(error.primary)).toBe(true);
    }
    for (const stage of ['after-capture', 'compare'] as const) for (const [outcome, primary] of [[() => ({ kind: 'returned', value: 'ok' }), null], [() => ({ kind: 'crashed', error: { name: 'Crash', message: 'bad' } }), { kind: 'crashed', name: 'Crash', message: 'bad' }], [() => ({ kind: 'timed-out', timeoutMs: 1 }), { kind: 'timed-out', timeoutMs: 1 }]] as const) {
      let captured = 0; const hostileSettlement = new Proxy(new Error('leak'), { get() { throw new Error('trap'); }, getPrototypeOf() { throw new Error('trap'); } });
      const seam = freeze({ capture: freeze(() => { captured += 1; if (stage === 'after-capture' && captured === 2) throw hostileSettlement; return {}; }), compare: freeze(() => { if (stage === 'compare') throw hostileSettlement; return freeze({ clean: true, differences: freeze([]) }); }) });
      const error = expectFailure(() => runGuarded(config(seam, outcome)), primary, { kind: 'settlement', stage, name: 'Error', message: 'invalid settlement failure' }); if (error.primary) expect(Object.isFrozen(error.primary)).toBe(true);
    }
  });


  it('retains malformed primaries across dirty, after-capture, and compare settlement branches', () => {
    const malformed = () => ({ kind: 'unknown' }); const dirty = freeze({ clean: false, differences: freeze([{ area: 'git', key: 'status' }]) });
    const vectors = [
      ['dirty', freeze(() => ({})), freeze(() => dirty), dirty, ['before', 'after', 'compare']],
      ['after-capture', (() => { let captures = 0; return freeze(() => { captures += 1; if (captures === 2) throw new Error('after'); return {}; }); })(), freeze(() => freeze({ clean: true, differences: freeze([]) })), { kind: 'settlement', stage: 'after-capture', name: 'Error', message: 'after' }, ['before', 'after']],
      ['compare', freeze(() => ({})), freeze(() => { throw new Error('compare'); }), { kind: 'settlement', stage: 'compare', name: 'Error', message: 'compare' }, ['before', 'after', 'compare']],
    ] as const;
    for (const [, capture, compare, contamination, order] of vectors) {
      const calls: string[] = []; let captures = 0;
      const tracedCapture = freeze(() => { calls.push(captures++ === 0 ? 'before' : 'after'); return capture(); });
      const error = expectFailure(() => runGuarded(config(freeze({ capture: tracedCapture, compare: freeze(() => { calls.push('compare'); return compare(); }) }), malformed)), { kind: 'malformed', reason: 'invalid outcome' }, contamination);
      expect(calls).toEqual(order); expect(Object.isFrozen((error as { primary: object }).primary)).toBe(true); expect(Object.isFrozen((error as { contamination: object }).contamination)).toBe(true);
    }
  });

  it('normalizes primitive and plain-object after/compare throws without losing an existing primary', () => {
    for (const [stage, thrown] of [['after-capture', 'after primitive'], ['after-capture', { source: 'after object' }], ['compare', 'compare primitive'], ['compare', { source: 'compare object' }]] as const) {
      const calls: string[] = []; let captures = 0;
      const capture = freeze(() => { calls.push(captures++ === 0 ? 'before' : 'after'); if (stage === 'after-capture' && captures === 2) throw thrown; return {}; });
      const compare = freeze(() => { calls.push('compare'); if (stage === 'compare') throw thrown; return freeze({ clean: true, differences: freeze([]) }); });
      const error = expectFailure(() => runGuarded(config(freeze({ capture, compare }), () => { throw new Error('primary'); })), { kind: 'threw', name: 'Error', message: 'primary' }, { kind: 'settlement', stage, name: 'Error', message: 'invalid settlement failure' });
      expect(calls).toEqual(stage === 'after-capture' ? ['before', 'after'] : ['before', 'after', 'compare']); expect(Object.isFrozen((error as { primary: object }).primary)).toBe(true); expect(Object.isFrozen((error as { contamination: object }).contamination)).toBe(true);
    }
  });

  it('snapshots hostile Error name and message getters once for direct and settlement failures', () => {
      const statefulError = (name: string, message: string) => { let nameReads = 0; let messageReads = 0; const error = new Error(); Object.defineProperties(error, { name: { get: () => (++nameReads === 1 ? name : {}), configurable: true }, message: { get: () => (++messageReads === 1 ? message : {}), configurable: true } }); return { error, reads: () => [nameReads, messageReads] as const }; };
      const direct = statefulError('DirectError', 'direct safe'); const directGuard = guard(); const directResult = expectFailure(() => runGuarded(config(directGuard.guard, () => { throw direct.error; })), { kind: 'threw', name: 'DirectError', message: 'direct safe' }, null);
      expect(direct.reads()).toEqual([1, 1]); expect(directResult).toMatchObject({ primary: { name: 'DirectError', message: 'direct safe' } }); expect(directGuard.calls).toEqual(['before', 'after', 'compare']);
    });

    it('captures array length descriptors once and rejects invalid descriptor vectors without truncation', () => {
      const values = ['first', 'second']; let liveLengthReads = 0; const stateful = new Proxy(values, { get(target, key, receiver) { if (key === 'length') return ++liveLengthReads === 1 ? 1 : 0; return Reflect.get(target, key, receiver); } });
      expect(runGuarded(config(guard().guard, () => ({ kind: 'returned', value: stateful })))).toMatchObject({ value: ['first', 'second'] }); expect(liveLengthReads).toBe(0);
      const vectors: [string, (target: string[]) => PropertyDescriptor | undefined][] = [
        ['negative value', target => ({ ...Reflect.getOwnPropertyDescriptor(target, 'length')!, value: -1 })], ['fractional value', target => ({ ...Reflect.getOwnPropertyDescriptor(target, 'length')!, value: 1.5 })], ['non-safe value', target => ({ ...Reflect.getOwnPropertyDescriptor(target, 'length')!, value: Number.MAX_SAFE_INTEGER + 1 })],
        ['enumerable attribute', target => ({ ...Reflect.getOwnPropertyDescriptor(target, 'length')!, enumerable: true })], ['configurable attribute', target => ({ ...Reflect.getOwnPropertyDescriptor(target, 'length')!, configurable: true })], ['non-boolean writable representation', target => ({ ...Reflect.getOwnPropertyDescriptor(target, 'length')!, writable: 0 as unknown as boolean })], ['incompatible writable', target => ({ ...Reflect.getOwnPropertyDescriptor(target, 'length')!, writable: false })],
      ];
      for (const [, descriptor] of vectors) { const value = new Proxy(['first', 'second'], { getOwnPropertyDescriptor(target, key) { return key === 'length' ? descriptor(target) : Reflect.getOwnPropertyDescriptor(target, key); } }); const item = guard(); expectFailure(() => runGuarded(config(item.guard, () => ({ kind: 'returned', value }))), { kind: 'malformed', reason: 'invalid outcome' }, null); expect(item.calls).toEqual(['before', 'after', 'compare']); }
      expect(runGuarded(config(guard().guard, () => ({ kind: 'returned', value: Object.freeze(['frozen']) })))).toMatchObject({ value: ['frozen'] });
    });

    it('executes exactly once across returned, direct throw, crashed, timed-out, and malformed families', () => {
      for (const [execute, primary] of [[() => ({ kind: 'returned', value: 'ok' }), null], [() => { throw new Error('boom'); }, { kind: 'threw', name: 'Error', message: 'boom' }], [() => ({ kind: 'crashed', error: { name: 'Crash', message: 'bad' } }), { kind: 'crashed', name: 'Crash', message: 'bad' }], [() => ({ kind: 'timed-out', timeoutMs: 1 }), { kind: 'timed-out', timeoutMs: 1 }], [() => ({ kind: 'unknown' }), { kind: 'malformed', reason: 'invalid outcome' }]] as const) {
        const order: string[] = []; let captures = 0; let executes = 0; const seam = freeze({ capture: freeze(() => { order.push(captures++ === 0 ? 'before' : 'after'); return {}; }), compare: freeze(() => { order.push('compare'); return freeze({ clean: true, differences: freeze([]) }); }) }); const wrapped = () => { executes += 1; order.push('execute'); return execute(); };
        if (primary) expectFailure(() => runGuarded(config(seam, wrapped)), primary, null); else expect(runGuarded(config(seam, wrapped))).toMatchObject({ value: 'ok' }); expect(order).toEqual(['before', 'execute', 'after', 'compare']); expect(executes).toBe(1);
      }
    });

    it('normalizes name and message accessor throws for direct and settlement errors without losing a primary', () => {
      const hostile = (kind: 'name' | 'message', accesses: string[]) => { const error = new Error('hidden'); Object.defineProperties(error, { name: { get() { accesses.push('name'); if (kind === 'name') throw new Error('name getter'); return 'SafeName'; } }, message: { get() { accesses.push('message'); throw new Error('message getter'); } } }); return error; };
      for (const kind of ['name', 'message'] as const) { const accesses: string[] = []; const item = guard(); expectFailure(() => runGuarded(config(item.guard, () => { throw hostile(kind, accesses); })), { kind: 'threw', name: 'Error', message: 'invalid thrown error' }, null); expect(accesses).toEqual(kind === 'name' ? ['name'] : ['name', 'message']); expect(item.calls).toEqual(['before', 'after', 'compare']); }
      for (const stage of ['after-capture', 'compare'] as const) for (const kind of ['name', 'message'] as const) { const accesses: string[] = []; const order: string[] = []; let captures = 0; const error = hostile(kind, accesses); const seam = freeze({ capture: freeze(() => { order.push(captures++ === 0 ? 'before' : 'after'); if (stage === 'after-capture' && captures === 2) throw error; return {}; }), compare: freeze(() => { order.push('compare'); if (stage === 'compare') throw error; return freeze({ clean: true, differences: freeze([]) }); }) }); const result = expectFailure(() => runGuarded(config(seam, () => { order.push('execute'); throw new Error('primary'); })), { kind: 'threw', name: 'Error', message: 'primary' }, { kind: 'settlement', stage, name: 'Error', message: 'invalid settlement failure' }); expect(accesses).toEqual(kind === 'name' ? ['name'] : ['name', 'message']); expect(order).toEqual(stage === 'after-capture' ? ['before', 'execute', 'after'] : ['before', 'execute', 'after', 'compare']); expect(Object.isFrozen(result)).toBe(true); }
    });

    it('normalizes hostile report lengths from copied descriptors and snapshots settlement accessors once', () => {
      for (const [clean, capturedLength, liveLength] of [[false, 0, 1], [true, 1, 0]] as const) {
        let liveLengthReads = 0; const differences = new Proxy(capturedLength ? [{ nested: { value: 1 } }] : [], { get(target, key, receiver) { if (key === 'length') { liveLengthReads += 1; return liveLength; } return Reflect.get(target, key, receiver); } });
        const report = Object.freeze({ clean, differences }); const item = guard({ report }); const primary = { kind: 'threw', name: 'Error', message: 'primary' };
        const error = expectFailure(() => runGuarded(config(item.guard, () => { throw new Error('primary'); })), primary, expect.objectContaining({ kind: 'settlement', stage: 'compare' })) as { contamination: unknown };
        expect(liveLengthReads).toBe(0); expect(item.calls).toEqual(['before', 'after', 'compare']); expect(Object.isFrozen(error.contamination)).toBe(true);
      }
      const stateful = (name: string, message: string) => { let nameReads = 0; let messageReads = 0; const payload = { mutable: true }; const error = new Error(); Object.defineProperties(error, { name: { get: () => (++nameReads === 1 ? name : payload), configurable: true }, message: { get: () => (++messageReads === 1 ? message : payload), configurable: true } }); return { error, payload, reads: () => [nameReads, messageReads] as const }; };
      for (const stage of ['after-capture', 'compare'] as const) {
        const payload = { nested: { value: 1 } }; const settlement = stateful('SettlementError', `${stage} safe`); const calls: string[] = []; let captures = 0;
        const seam = freeze({ capture: freeze(() => { calls.push(captures++ === 0 ? 'before' : 'after'); if (stage === 'after-capture' && captures === 2) throw settlement.error; return payload; }), compare: freeze(() => { calls.push('compare'); if (stage === 'compare') throw settlement.error; return freeze({ clean: true, differences: freeze([]) }); }) });
        const error = expectFailure(() => runGuarded(config(seam, () => { throw new Error('primary'); })), { kind: 'threw', name: 'Error', message: 'primary' }, { kind: 'settlement', stage, name: 'SettlementError', message: `${stage} safe` }) as { primary: { name: string }; contamination: { message: string } };
        payload.nested.value = 2; settlement.payload.mutable = false; expect(settlement.reads()).toEqual([1, 1]); expect(calls).toEqual(stage === 'after-capture' ? ['before', 'after'] : ['before', 'after', 'compare']); expect(error.primary).toEqual({ kind: 'threw', name: 'Error', message: 'primary' }); expect(error.contamination).toEqual({ kind: 'settlement', stage, name: 'SettlementError', message: `${stage} safe` }); expect(Object.isFrozen(error)).toBe(true); expect(Object.isFrozen(error.contamination)).toBe(true);
      }
    });

    it('exposes the exact frozen GuardedRunError public contract', () => {
      const item = guard({ report: freeze({ clean: false, differences: freeze([{ area: 'git' }]) }) }); const error = expectFailure(() => runGuarded(config(item.guard, () => { throw new Error('primary'); })), { kind: 'threw', name: 'Error', message: 'primary' }, { clean: false, differences: [{ area: 'git' }] }) as unknown as Error & Record<string, unknown>;
      expect(error.message).toBe('guarded run failed'); expect(Object.keys(error).sort()).toEqual(['code', 'contamination', 'name', 'primary']); expect(Object.getOwnPropertyDescriptor(error, 'message')?.enumerable).toBe(false); expect(Object.getOwnPropertyDescriptor(error, 'code')?.enumerable).toBe(true); expect(error.code).toBe('GUARDED_RUN_FAILED'); expect(error.primary).toEqual({ kind: 'threw', name: 'Error', message: 'primary' }); expect(error.contamination).toEqual({ clean: false, differences: [{ area: 'git' }] }); expect(Object.isFrozen(error)).toBe(true); expect(error.stack).toContain('GuardedRunError'); expect(Object.hasOwn(error, 'cause')).toBe(false);
    });

});
