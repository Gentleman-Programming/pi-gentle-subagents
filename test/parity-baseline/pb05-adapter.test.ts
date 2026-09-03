import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The parity harness adapter is loaded directly by Vitest.
import { adaptPB05 } from '../../scripts/parity-baseline/adapters/PB-05.mjs';

const root = path.resolve(import.meta.dirname, '../../evidence/parity-baseline/fixtures');
const fixture = () => JSON.parse(fs.readFileSync(path.join(root, 'PB-05.json'), 'utf8'));
const families = ['initialization', 'migration', 'crudResults', 'boundedData', 'configuredPath', 'lockingBehavior', 'runtimeVariant', 'permissionFailure'];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const deepFrozen = (value: any): boolean => value === null || typeof value !== 'object'
  || Object.isFrozen(value) && Object.values(value).every(deepFrozen);
function envelope(descriptor: any) {
  const seed = descriptor.seed, pathValue = 'history/subagents-history.sqlite';
  const output: Record<string, any[]> = Object.fromEntries(families.map((name) => [name, []]));
  output.runtimeVariant.push({ runtime: descriptor.runtime, module: descriptor.runtime === 'node-sqlite' ? 'node:sqlite' : 'bun:sqlite' });
  if (descriptor.caseId === 'permission-denied') output.permissionFailure.push({ operation: 'open-configured-path', code: 'EACCES' });
  else {
    output.initialization.push({ databasePath: pathValue, opened: true });
    for (const table of ['subagent_tasks', 'subagent_task_attempts', 'subagent_events']) output.migration.push({ table, applied: true });
    output.configuredPath.push({ configuredPath: pathValue, databasePath: pathValue });
    output.lockingBehavior.push(descriptor.caseId === 'locked-database'
      ? { operation: 'write-under-exclusive-lock', result: 'SQLITE_BUSY' }
      : { operation: 'write-under-unlocked-db', result: 'accepted' });
    if (descriptor.caseId !== 'locked-database') {
      for (const [operation, entity, value, id, status] of [
        ['insert', 'task', seed.task, seed.task.id, seed.task.status],
        ['insert', 'attempt', seed.attempt, seed.attempt.task_id, seed.attempt.status],
        ['insert', 'event', seed.event, seed.event.task_id, seed.event.status],
        ['read', 'task', seed.task, seed.task.id, seed.task.status],
        ['read', 'attempt', seed.attempt, seed.attempt.task_id, seed.attempt.status],
        ['read', 'event', seed.event, seed.event.task_id, seed.event.status],
        ['read', 'snapshot', seed.snapshot, seed.task.id, seed.task.status],
      ] as any[]) output.crudResults.push({ operation, entity, id, status });
      for (const [entity, value] of [['task', seed.task], ['attempt', seed.attempt], ['event', seed.event], ['snapshot', seed.snapshot]]) {
        output.boundedData.push({ entity, count: 1, values: [clone(value)] });
      }
    }
  }
  return {
    identity: 'PB-05', targetId: descriptor.targetId, fixtureId: descriptor.fixtureId,
    fixtureDigest: descriptor.fixtureDigest, caseId: descriptor.caseId,
    seedId: descriptor.seedId, seedDigest: descriptor.seedDigest, families: output,
  };
}
function invoke(caseId = 'node-sqlite-crud', change?: (value: any) => void) {
  let calls = 0, receiver: any, descriptor: any;
  const target = { observe(value: any) { calls += 1; receiver = this; descriptor = value; const result = envelope(value); change?.(result); return result; } };
  const result = adaptPB05({ fixtureRoot: root, fixture: fixture(), caseId, targetId: 'fork', target });
  return { result, calls, receiver, descriptor, target };
}
function reject(caseId: string, change: (value: any) => void) {
  let calls = 0, returned = false;
  const target = { observe(value: any) {
    calls += 1; const result = envelope(value); change(result); returned = true; return result;
  } };
  expect(() => adaptPB05({
    fixtureRoot: root, fixture: fixture(), caseId, targetId: 'fork', target,
  })).toThrow('invalid PB-05');
  expect([calls, returned]).toEqual([1, true]);
}

describe('PB-05 injected semantic adapter core', () => {
  it.each([
    ['node-sqlite-crud', [1, 3, 7, 4, 1, 1, 1, 0]], ['bun-sqlite-crud', [1, 3, 7, 4, 1, 1, 1, 0]],
    ['locked-database', [1, 3, 0, 0, 1, 1, 1, 0]], ['permission-denied', [0, 0, 0, 0, 0, 0, 1, 1]],
  ])('observes one exact frozen descriptor for %s', (caseId, counts) => {
    const { result, calls, receiver, descriptor, target } = invoke(caseId);
    expect([calls, receiver, Object.getPrototypeOf(descriptor)]).toEqual([1, target, null]);
    expect(Object.keys(descriptor)).toEqual([
      'identity', 'caseId', 'fixtureId', 'fixtureDigest', 'seedId',
      'seedDigest', 'targetId', 'runtime', 'seed',
    ]);
    expect(Object.keys(result)).toEqual([
      'identity', 'targetId', 'fixtureId', 'fixtureDigest', 'caseId',
      'seedId', 'seedDigest', 'families',
    ]);
    expect(Object.keys(result.families)).toEqual(families);
    expect(families.map((name) => result.families[name].length)).toEqual(counts);
    expect(deepFrozen(descriptor) && deepFrozen(result)).toBe(true);
  });
  it('returns fresh isolated descriptor and envelope copies', () => {
    const source = fixture(), { result, descriptor, returned } = adaptOnce(source);
    const taskId = result.families.crudResults[0].id;
    source.cases[0].id = 'changed';
    returned.families.crudResults[0].id = 'changed-return';
    returned.families.boundedData[0].values[0].id = 'changed-return-nested';
    expect([descriptor.caseId, result.families.crudResults[0].id, result.families.boundedData[0].values[0].id, taskId]).toEqual([
      'node-sqlite-crud', 'pb05-task-1', 'pb05-task-1', 'pb05-task-1',
    ]);
    expect(result).not.toBe(returned);
  });
  it.each([
    ['aggregate', (value: any) => [value]], ['multi-case', (value: any) => { value.caseId = 'bun-sqlite-crud'; return value; }],
    ['promise', () => Promise.resolve({})], ['thenable', () => ({ then() {} })],
    ['hidden then value', (value: any) => { Object.defineProperty(value, 'then', { value() {} }); return value; }],
    ['inherited thenable', () => Object.create({ then() {} })], ['null-prototype thenable', () => Object.assign(Object.create(null), { then() {} })],
  ])('rejects %s after exactly one target call', (_label, result) => {
    let calls = 0;
    const target = { observe(value: any) {
      calls += 1;
      return typeof result === 'function' ? result(envelope(value)) : result;
    } };
    expect(() => adaptPB05({
      fixtureRoot: root, fixture: fixture(), caseId: 'node-sqlite-crud', targetId: 'fork', target,
    })).toThrow('invalid PB-05');
    expect(calls).toBe(1);
  });
  const mutations: [label: string, change: (value: any) => void][] = [
    ['envelope extra key', (value: any) => value.extra = true],
    ['envelope omission', (value: any) => delete value.fixtureId],
    ['envelope order', (value: any) => { const item = value.identity; delete value.identity; value.identity = item; }],
    ['family key', (value: any) => delete value.families.migration],
    ['record schema', (value: any) => value.families.initialization[0].opened = 1],
    ['family order', (value: any) => { const item = value.families.initialization; delete value.families.initialization; value.families.initialization = item; }],
    ['cardinality', (value: any) => value.families.migration.pop()], ['path', (value: any) => value.families.initialization[0].databasePath = '/tmp/history.sqlite'],
    ['crud', (value: any) => value.families.crudResults[0].status = 'failed'], ['bounded', (value: any) => value.families.boundedData[0].values = []],
    ['duplicate migration', (value: any) => value.families.migration[2] = { ...value.families.migration[0] }],
    ...['task', 'attempt', 'event'].map<[label: string, change: (value: any) => void]>((entity, index) => [`${entity} ID/status swap`, (value: any) => {
      const record = value.families.crudResults[index];
      record.id = `${entity}-swapped`; record.status = `${entity}-swapped`;
    }]),
    ['configured/database path mismatch', (value: any) => value.families.configuredPath[0].databasePath = 'history/alias.sqlite'],
    ['runtime value mismatch', (value: any) => value.families.runtimeVariant[0].runtime = 'bun-sqlite'],
    ['runtime module mismatch', (value: any) => value.families.runtimeVariant[0].module = 'bun:sqlite'],
    ['lock', (value: any) => value.families.lockingBehavior[0].result = 'accepted'],
    ['permission', (value: any) => value.families.permissionFailure[0].code = 'EPERM'],
    ['permission message', (value: any) => value.families.permissionFailure[0].message = 'denied'],
    ['identifier', (value: any) => value.families.crudResults[3].id = 'other'],
  ];
  it.each(mutations)('rejects direct semantic contradiction: %s', (_label, change) => {
    const caseId = _label.startsWith('permission') ? 'permission-denied' : _label === 'lock' ? 'locked-database' : 'node-sqlite-crud';
    reject(caseId, change);
  });
  it('rejects synchronous throws without retrying the target', () => {
    let calls = 0;
    const target = { observe() { calls += 1; throw Error('target'); } };
    expect(() => adaptPB05({
      fixtureRoot: root, fixture: fixture(), caseId: 'node-sqlite-crud', targetId: 'fork', target,
    })).toThrow('invalid PB-05');
    expect(calls).toBe(1);
  });
  it('uses the captured observer when its own call property is hostile', () => {
    let observed = 0, hostileCalls = 0, receiver: { observe: (value: any) => unknown } | undefined;
    const observe = function (this: { observe: (value: any) => unknown }, value: any) {
      observed += 1; receiver = this; return envelope(value);
    };
    Object.defineProperty(observe, 'call', {
      value() { hostileCalls += 1; return {}; },
    });
    const target = { observe };
    const result = adaptPB05({
      fixtureRoot: root, fixture: fixture(), caseId: 'node-sqlite-crud', targetId: 'fork', target,
    });
    expect([observed, hostileCalls, receiver, result.caseId]).toEqual([1, 0, target, 'node-sqlite-crud']);
  });
  it('rejects a hidden then getter without invoking it', () => {
    let calls = 0, getterReads = 0;
    const target = { observe(value: any) {
      calls += 1;
      const result = envelope(value);
      Object.defineProperty(result, 'then', { get() { getterReads += 1; return undefined; } });
      return result;
    } };
    expect(() => adaptPB05({
      fixtureRoot: root, fixture: fixture(), caseId: 'node-sqlite-crud', targetId: 'fork', target,
    })).toThrow('invalid PB-05');
    expect([calls, getterReads]).toEqual([1, 0]);
  });
});
describe('PB-05 hostile adapter boundary', () => {
  const freeze = (value: any): any => { if (value && typeof value === 'object') Object.values(value).forEach(freeze); return Object.freeze(value); };
  const inputFor = (target: any, source = fixture()) => ({ fixtureRoot: root, fixture: source, caseId: 'node-sqlite-crud', targetId: 'fork', target });
  it('rejects an invalid result despite an inherited numeric array setter', () => {
    const prior = Object.getOwnPropertyDescriptor(Array.prototype, '0'); let calls = 0, error: unknown;
    const target = { observe(value: any) { calls += 1; const result = envelope(value); result.families.initialization[0].opened = false;
      Object.defineProperty(Array.prototype, '0', { configurable: true, set(record) {
        if (record && typeof record === 'object' && 'opened' in record) record.opened = false;
        Object.defineProperty(this, '0', { configurable: true, enumerable: true, value: record, writable: true });
      } }); return result;
    } };
    try { adaptPB05(inputFor(target)); } catch (caught) { error = caught; } finally {
      if (prior) Object.defineProperty(Array.prototype, '0', prior); else Reflect.deleteProperty(Array.prototype, '0'); }
    expect(error).toMatchObject({ message: 'invalid PB-05' }); expect(calls).toBe(1); });
  const set = (value: any, opened: any) => { value.families.initialization[0].opened = opened; }; const outputNegatives: [string, (value: any, onGet: () => void) => void][] = [
    ['cycle', (value) => { value.families.initialization[0].self = value; }],
    ['cross-family shared reference', (value) => { value.families.migration = value.families.initialization; }],
    ['own symbol', (value) => Object.defineProperty(value, Symbol('own'), { value: true })],
    ['function', (value) => set(value, () => true)], ['undefined', (value) => set(value, undefined)], ['bigint', (value) => set(value, 1n)],
    ['Infinity', (value) => set(value, Infinity)], ['NaN', (value) => set(value, NaN)], ['negative zero', (value) => set(value, -0)],
    ['generic accessor', (value, onGet) => Object.defineProperty(value.families.initialization[0], 'opened', { configurable: true, get() { onGet(); return true; } })],
    ['sealed descriptor lie', (value) => Object.seal(value.families.initialization[0])],
    ['frozen sparse array', (value) => { value.families.migration.length += 1; freeze(value); }],
    ['mixed empty frozen array', (value) => Object.freeze(value.families.permissionFailure)],
  ];
  it.each(outputNegatives)('rejects snapshot-invalid result: %s', (_label, mutate) => {
    let getterReads = 0; reject('node-sqlite-crud', (value) => mutate(value, () => { getterReads += 1; }));
    expect(getterReads).toBe(0); });
  it('accepts an independent fully deep-frozen request and result', () => {
    let calls = 0, returned: any; const target = freeze({ observe(value: any) { calls += 1; returned = freeze(envelope(value)); return returned; } });
    const input = freeze({ fixtureRoot: root, fixture: fixture(), caseId: 'node-sqlite-crud', targetId: 'fork', target });
    const result = adaptPB05(input); expect([calls, deepFrozen(result), Object.isFrozen(result.families.permissionFailure)]).toEqual([1, true, true]);
    expect(result).not.toBe(returned); });
  it('captures target receiver before a fixture trap replaces it', () => {
    let calls = 0, replacement = 0, receiver: any;
    const target = { observe(this: any, value: any) { calls += 1; receiver = this; return envelope(value); } };
    const input = inputFor(target), source = input.fixture;
    input.fixture = new Proxy(source, { ownKeys(value) {
      input.target = { observe() { replacement += 1; } }; target.observe = input.target.observe; return Reflect.ownKeys(value);
    } });
    expect(adaptPB05(input).caseId).toBe('node-sqlite-crud'); expect([calls, replacement, receiver]).toEqual([1, 0, target]);
  });
  it('preserves a nested snapshot before a later descriptor trap mutates it', () => {
    const target = { observe(value: any) { const result = envelope(value), families = result.families, source = families.initialization;
      result.families = new Proxy(families, { ownKeys: Reflect.ownKeys, getOwnPropertyDescriptor(object, key) {
        if (key === 'migration') source[0].opened = false; return Object.getOwnPropertyDescriptor(object, key);
      } }) as Record<string, any[]>; return result; } };
    expect(adaptPB05(inputFor(target)).families.initialization[0].opened).toBe(true);
  });
  it.each([
    ['profile lie', (value: any) => Object.preventExtensions(value.families.initialization[0])],
    ['frozen sparse', (value: any) => { value.families.migration.length += 1; freeze(value); }],
    ['empty mixed profile', (value: any) => Object.freeze(value.families.permissionFailure)],
    ['nonenumerable __proto__', (value: any) => { Object.defineProperty(value, '__proto__', {
      value: { polluted: true }, enumerable: false }); expect(({} as any).polluted).toBeUndefined(); }],
    ['family alias', (value: any) => { value.families.permissionFailure = value.families.initialization; }],
  ])('rejects %s after one target call', (_label, mutate) => reject('node-sqlite-crud', mutate));
  it('rejects inherited getter/custom prototype without invocation', () => {
    let reads = 0, calls = 0; const target = { observe(value: any) {
      calls += 1; const result = envelope(value); Object.setPrototypeOf(result, { get families() { reads += 1; return {}; } }); return result;
    } };
    expect(() => adaptPB05(inputFor(target))).toThrow('invalid PB-05'); expect([calls, reads]).toEqual([1, 0]);
  });
  it('accepts one ownKeys capture even when a second would throw', () => {
    let calls = 0, keys = 0; const target = { observe(value: any) {
      calls += 1; const result = envelope(value); return new Proxy(result, { ownKeys(object) {
        keys += 1; if (keys > 1) throw Error('second'); return Reflect.ownKeys(object);
      }, getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor }); } };
    expect(adaptPB05(inputFor(target)).caseId).toBe('node-sqlite-crud'); expect([calls, keys]).toEqual([1, 1]);
  });
  it('does not read Object.prototype descriptor getters after observation', () => {
    const adapter = JSON.stringify(new URL('../../scripts/parity-baseline/adapters/PB-05.mjs', import.meta.url).href);
    const source = [
      `import { adaptPB05 } from ${adapter};let reads=0;const seed=${JSON.stringify(fixture())};`,
      `const families=${JSON.stringify(families)};const clone=v=>JSON.parse(JSON.stringify(v));`,
      `const envelope=${envelope};const result=adaptPB05({fixtureRoot:${JSON.stringify(root)},`,
      "fixture:seed,caseId:'node-sqlite-crud',targetId:'fork',target:{observe(value){",
      "const result=envelope(value);for(const key of ['value','get','set']){",
      'const descriptor=Object.create(null);descriptor.get=()=>{reads+=1};',
      'descriptor.configurable=true;Object.defineProperty(Object.prototype,key,descriptor)}',
      "return result}}});process.exit(result.caseId==='node-sqlite-crud'&&reads===0?0:1)",
    ].join('');
    expect(spawnSync(process.execPath, ['--input-type=module', '--eval', source]).status).toBe(0);
  });
  it('rejects invalid output despite post-observe global replacement', () => {
    let calls = 0;
    const array = Array.isArray, entries = Array.prototype.entries;
    const iterator = Array.prototype[Symbol.iterator], prototype = Object.getPrototypeOf;
    const extensible = Object.isExtensible, ownKeys = Reflect.ownKeys;
    const target = { observe(value: any) {
      calls += 1; const result = envelope(value); result.families.initialization[0].opened = false;
      (Array as any).isArray = () => true; (Array.prototype as any).entries = function* () {};
      (Array.prototype as any)[Symbol.iterator] = function* () {}; (Object as any).getPrototypeOf = () => null;
      (Object as any).isExtensible = () => true; (Reflect as any).ownKeys = () => [];
      return result;
    } };
    try { expect(() => adaptPB05(inputFor(target))).toThrow('invalid PB-05'); } finally {
      Array.isArray = array; Array.prototype.entries = entries; Array.prototype[Symbol.iterator] = iterator;
      Object.getPrototypeOf = prototype; Object.isExtensible = extensible; Reflect.ownKeys = ownKeys;
    }
    expect(calls).toBe(1);
  });
});
function adaptOnce(source: any) {
  let descriptor: any, returned: any;
  const target = { observe(value: any) {
    descriptor = value; returned = clone(envelope(value)); return returned;
  } };
  const result = adaptPB05({
    fixtureRoot: root, fixture: clone(source), caseId: 'node-sqlite-crud', targetId: 'fork', target,
  });
  return { result, descriptor, returned };
}
