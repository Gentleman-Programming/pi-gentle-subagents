import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error PB-04 adapter is exercised directly by Vitest.
import { adaptPB04 } from '../../scripts/parity-baseline/adapters/PB-04.mjs';

const root = path.resolve(import.meta.dirname, '../../evidence/parity-baseline/fixtures');
const fixture = () => JSON.parse(fs.readFileSync(path.join(root, 'PB-04.json'), 'utf8'));
const keys = [
  'queued', 'running', 'terminal', 'ownership', 'dispatchOrder',
  'concurrency', 'completionOrder', 'result', 'backgroundHandoff',
];
const family = (event: any) => ({
  'task.queued': 'queued',
  'task.running': 'running',
  'task.terminal': 'terminal',
  'ownership.recorded': 'ownership',
  'dispatch.recorded': 'dispatchOrder',
  'concurrency.sampled': 'concurrency',
  'completion.recorded': 'completionOrder',
  'result.recorded': 'result',
  'background.handoff': 'backgroundHandoff',
} as Record<string, string>)[event.kind];

function envelope(descriptor: any, explicitEvents?: any[]) {
  const item = fixture().cases.find((entry: any) => entry.id === descriptor.caseId);
  const events = explicitEvents ?? JSON.parse(fs.readFileSync(path.join(root, item.eventSeedPath), 'utf8')).events;
  const tasks = new Map<string, any>(descriptor.tasks.map((task: any) => [task.attemptId, task] as const));
  const records: Record<string, any[]> = Object.fromEntries(keys.map((key) => [key, []]));
  for (const event of events) {
    const task = tasks.get(event.attemptId);
    const value = event.kind === 'task.queued'
      ? { eventId: event.eventId, tick: event.tick, taskId: event.taskId, attemptId: event.attemptId, mode: task.mode }
      : event.kind === 'task.running'
        ? { eventId: event.eventId, tick: event.tick, taskId: event.taskId, attemptId: event.attemptId, runnerId: 'pb-04-controlled-runner', mode: task.mode }
        : event.kind === 'task.terminal'
          ? { eventId: event.eventId, tick: event.tick, taskId: event.taskId, attemptId: event.attemptId, state: 'completed', resultId: event.resultId }
          : event.kind === 'ownership.recorded'
            ? { eventId: event.eventId, tick: event.tick, taskId: event.taskId, attemptId: event.attemptId, owner: task.owner, mode: task.mode }
            : event.kind === 'dispatch.recorded'
              ? { position: records.dispatchOrder.length + 1, eventId: event.eventId, tick: event.tick, taskId: event.taskId, attemptId: event.attemptId }
              : event.kind === 'concurrency.sampled'
                ? { eventId: event.eventId, tick: event.tick, activeAttemptIds: event.activeAttemptIds, limit: event.limit }
                : event.kind === 'completion.recorded'
                  ? {
                    position: records.completionOrder.length + 1,
                    eventId: event.eventId,
                    tick: event.tick,
                    taskId: event.taskId,
                    attemptId: event.attemptId,
                    resultId: event.resultId,
                  }
                  : event.kind === 'result.recorded'
                    ? { eventId: event.eventId, resultId: event.resultId, taskId: event.taskId, attemptId: event.attemptId, state: 'completed', value: event.value }
                    : { eventId: event.eventId, tick: event.tick, taskId: event.taskId, attemptId: event.attemptId, owner: task.owner, handoff: 'accepted' };
    records[family(event)].push(value);
  }
  return {
    identity: 'PB-04', targetId: descriptor.targetId, fixtureId: descriptor.fixtureId,
    fixtureDigest: descriptor.fixtureDigest, caseId: descriptor.caseId,
    eventSeedId: descriptor.eventSeedId, eventSeedDigest: descriptor.eventSeedDigest,
    families: records,
  };
}
function observe(caseId: string, change?: (value: any) => void) {
  let calls = 0;
  let seen: any;
  const result = adaptPB04({
    fixtureRoot: root, fixture: fixture(), caseId, targetId: 'fork',
    target: { observe(descriptor: any) {
      calls += 1;
      seen = descriptor;
      const value = envelope(descriptor);
      change?.(value);
      return value;
    } },
  });
  return { result, calls, seen };
}
function validOutput(caseId = 'bounded-concurrency') {
  let value: any;
  adaptPB04({
    fixtureRoot: root, fixture: fixture(), caseId, targetId: 'fork',
    target: { observe(descriptor: any) { value = envelope(descriptor); return value; } },
  });
  return value;
}
function invoke(output: any, caseId = 'bounded-concurrency') {
  return adaptPB04({
    fixtureRoot: root, fixture: fixture(), caseId, targetId: 'fork',
    target: { observe: () => output },
  });
}
const reversePositions = (items: any[]) => items.reverse().forEach((item, index) => { item.position = index + 1; });

describe('PB-04 injected semantic adapter core', () => {
  it('uses the rebased PB-04 full-manifest anchor', () => {
    expect(createHash('sha256').update(fs.readFileSync(path.join(root, 'manifest.json'))).digest('hex'))
      .toBe('b07223fa7763b471049f557a11221cdadb24e508f45bebf5ebba165a4e1c26f9');
    expect(observe('single-foreground').calls).toBe(1);
  });

  it.each(['single-foreground', 'serial-foreground', 'bounded-concurrency', 'mixed-background'])(
    'observes one frozen descriptor and direct envelope for %s',
    (caseId) => {
      const { result, calls, seen } = observe(caseId);
      expect(calls).toBe(1);
      expect(Object.getPrototypeOf(seen)).toBe(null);
      expect(Object.keys(seen)).toEqual([
        'identity', 'caseId', 'fixtureId', 'fixtureDigest', 'eventSeedId',
        'eventSeedDigest', 'targetId', 'clock', 'runner', 'tasks',
      ]);
      expect(Object.keys(result.families)).toEqual(keys);
    },
  );

  it.each([
    ['top-level omission', (value: any) => delete value.fixtureId],
    ['top-level extra key', (value: any) => value.extra = true],
    ['top-level reordered key', (value: any) => { const identity = value.identity; delete value.identity; value.identity = identity; }],
    ['omitted family', (value: any) => delete value.families.result],
    ['extra family', (value: any) => value.families.extra = []],
    ['reordered family', (value: any) => { const queued = value.families.queued; delete value.families.queued; value.families.queued = queued; }],
    ['event tick seed guard before transition relation', (value: any) => { value.families.running[0].tick = 1; }],
    ['same-kind task identity guard before cross-family relation', (value: any) => { value.families.terminal[0].attemptId = 'wrong'; }],
    ['dispatch position', (value: any) => value.families.dispatchOrder.reverse()],
    ['declared limit seed guard before concurrency relation', (value: any) => { value.families.concurrency[0].limit = 8; }],
    ['result', (value: any) => value.families.result[0].value = 'wrong'],
    ['owner', (value: any) => value.families.ownership[0].owner = 'background-supervisor'],
    ['handoff', (value: any) => value.families.backgroundHandoff = []],
    ['cross-family event reuse rejected by seed-kind guard', (value: any) => { value.families.running[0].eventId = value.families.queued[0].eventId; }],
    ['duplicate concurrency sample', (value: any) => { value.families.concurrency[1].eventId = value.families.concurrency[0].eventId; }],
  ])('rejects %s after target invocation', (label, change) => {
    const caseId = label === 'handoff' ? 'mixed-background' : 'bounded-concurrency';
    expect(() => observe(caseId, change)).toThrow('invalid PB-04');
  });
  it.each([
    ['a direct aggregate return', (descriptor: any) => [envelope(descriptor)]],
    ['a multi-case envelope', (descriptor: any) => {
      const value = envelope(descriptor);
      value.caseId = 'serial-foreground';
      return value;
    }],
  ])('rejects %s after one target call', (_label, output) => {
    let calls = 0;
    expect(() => adaptPB04({
      fixtureRoot: root, fixture: fixture(), caseId: 'single-foreground', targetId: 'fork',
      target: { observe(descriptor: any) { calls += 1; return output(descriptor); } },
    })).toThrow('invalid PB-04');
    expect(calls).toBe(1);
  });
  it.each([Promise.resolve({}), { then() {} }])('rejects asynchronous target results', (result) => {
    let calls = 0;
    expect(() => adaptPB04({
      fixtureRoot: root, fixture: fixture(), caseId: 'single-foreground', targetId: 'fork',
      target: { observe() { calls += 1; return result; } },
    })).toThrow('invalid PB-04');
    expect(calls).toBe(1);
  });
  it.each([
    ['captured manifest bytes', 'manifest.json'],
    ['captured event bytes', fixture().cases[0].eventSeedPath],
  ])('rejects forged %s before target invocation', (_label, forgedPath) => {
    let calls = 0;
    const read = fs.readFileSync.bind(fs);
    const item = fixture().cases[0];
    const forged = (file: fs.PathOrFileDescriptor, ...args: any[]) => {
      const bytes = read(file, ...args);
      return file === path.join(root, forgedPath)
        ? Buffer.concat([Buffer.from(bytes), Buffer.from(' ')])
        : bytes;
    };
    expect(() => adaptPB04({
      fixtureRoot: root, fixture: fixture(), caseId: item.id, targetId: 'fork',
      target: { observe() { calls += 1; return {}; } },
    }, forged)).toThrow('invalid PB-04');
    expect(calls).toBe(0);
  });
  it('rejects an overridden seed Buffer toString before observer invocation', () => {
    let calls = 0;
    const item = fixture().cases[0], read = fs.readFileSync.bind(fs);
    const seedPath = path.join(root, item.eventSeedPath);
    const forged = JSON.parse(read(seedPath, 'utf8'));
    forged.events.find((event: any) => event.kind === 'result.recorded').value = 'forged';
    const hostile = Buffer.from(read(seedPath));
    Object.defineProperty(hostile, 'toString', { value: () => JSON.stringify(forged) });
    expect(() => adaptPB04({
      fixtureRoot: root, fixture: fixture(), caseId: item.id, targetId: 'fork',
      target: { observe(descriptor: any) { calls += 1; return envelope(descriptor, forged.events); } },
    }, (file: fs.PathOrFileDescriptor, ...args: any[]) => file === seedPath ? hostile : read(file, ...args))).toThrow('invalid PB-04');
    expect(calls).toBe(0);
  });
  it('copies and recursively freezes descriptor and result without freezing source values', () => {
    const source = fixture();
    let descriptor: any, returned: any;
    const result = adaptPB04({
      fixtureRoot: root, fixture: source, caseId: 'mixed-background', targetId: 'fork',
      target: { observe(value: any) { descriptor = value; returned = envelope(value); return returned; } },
    });
    const taskId = descriptor.tasks[0].taskId, resultValue = result.families.queued[0].mode;
    source.cases[3].tasks[0].taskId = 'mutated-source';
    returned.families.queued[0].mode = 'mutated-return';
    const frozen = (value: any): boolean => value === null || typeof value !== 'object'
      || Object.isFrozen(value) && Object.values(value).every(frozen);
    expect([descriptor.tasks[0].taskId, result.families.queued[0].mode]).toEqual([taskId, resultValue]);
    expect(frozen(descriptor) && frozen(result)).toBe(true);
    expect(Object.isFrozen(source) || Object.isFrozen(returned)).toBe(false);
  });

  it('captures target authority before fixture reads can replace it', () => {
    let original = 0, replacement = 0;
    const target: { observe: (descriptor: any) => any } = { observe(descriptor) { original += 1; return envelope(descriptor); } };
    const read = fs.readFileSync.bind(fs);
    const fixtureTrap = (file: fs.PathOrFileDescriptor, ...args: any[]) => {
      target.observe = () => { replacement += 1; return {}; };
      return read(file, ...args);
    };
    expect(adaptPB04({ fixtureRoot: root, fixture: fixture(), caseId: 'single-foreground', targetId: 'fork', target }, fixtureTrap).families).toBeTruthy();
    expect([original, replacement]).toEqual([1, 0]);
  });

  it('accepts recursively frozen input and calls through its private target snapshot', () => {
    const freezeDeep = (value: any): any => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freezeDeep); Object.freeze(value);
      }
      return value;
    };
    let receiver: any, returned: any;
    function observe(this: any, descriptor: any) {
      receiver = this;
      returned = freezeDeep(envelope(descriptor));
      return returned;
    }
    const target = freezeDeep({ observe });
    const request = freezeDeep({
      fixtureRoot: root, fixture: fixture(), caseId: 'single-foreground', targetId: 'fork', target,
    });
    const result = adaptPB04(request);
    expect(Object.isFrozen(result)).toBe(true);
    expect([receiver.observe, receiver === target, result === returned]).toEqual([observe, false, false]);
  });

  it('captures a stable request proxy once without ordinary reads', () => {
    const descriptor = { fixtureRoot: root, fixture: fixture(), caseId: 'single-foreground', targetId: 'fork', target: { observe: envelope } };
    let ownKeys = 0, descriptors = 0, extensible = 0, gets = 0;
    const request = new Proxy(descriptor, {
      isExtensible(value) { extensible += 1; return Reflect.isExtensible(value); },
    ownKeys(value) { ownKeys += 1; return Reflect.ownKeys(value); },
      getOwnPropertyDescriptor(value, key) { descriptors += 1; return Reflect.getOwnPropertyDescriptor(value, key); },
      get() { gets += 1; throw Error('live get'); },
    });
    expect(adaptPB04(request).families).toBeTruthy();
    expect([ownKeys, descriptors, extensible, gets]).toEqual([
    1, Reflect.ownKeys(descriptor).length, 1, 0,
  ]);
  });

  it('rejects exact-schema mutations from independent valid output precursors', () => {
    const rejectValid = (change: (value: any) => void, label: string, caseId = 'bounded-concurrency') => {
      const value = validOutput(caseId); change(value); let calls = 0;
      expect(() => adaptPB04({
        fixtureRoot: root, fixture: fixture(), caseId, targetId: 'fork',
        target: { observe: () => { calls += 1; return value; } },
      }), label).toThrow('invalid PB-04');
      expect(calls, label).toBe(1);
    };
    const schemaMutations = [
      ['extra', (value: any) => { value.extra = true; }],
      ['symbol', (value: any) => { value[Symbol('bad')] = true; }],
      ['nonenumerable', (value: any) => Object.defineProperty(value, 'hidden', { value: true })],
      ['reordered', (value: any) => Array.isArray(value) ? value.reverse() : (() => {
        const [key] = Object.keys(value), item = value[key]; delete value[key]; value[key] = item;
      })()],
    ] as const;
    const rejectSchemaMutations = (name: string, locate: (value: any) => any) => {
      for (const [label, change] of schemaMutations) {
        rejectValid((value) => change(locate(value)), `${name}: ${label}`);
      }
    };
    for (const [name, locate] of [
      ['envelope', (value: any) => value], ['families', (value: any) => value.families],
      ['family-array', (value: any) => value.families.queued],
      ['record', (value: any) => value.families.queued[0]],
    ] as const) rejectSchemaMutations(name, locate);
    for (const key of Object.keys(validOutput())) {
      rejectValid((value) => delete value[key], `envelope.${key}: omission`);
      rejectValid((value) => { value[key] = {}; }, `envelope.${key}: wrong ordinary type`);
    }
    for (const key of keys) {
      rejectValid((value) => delete value.families[key], `families.${key}: omission`);
      rejectValid((value) => { value.families[key] = {}; }, `families.${key}: wrong type`);
    }
    for (const name of keys) {
      const caseId = name === 'backgroundHandoff' ? 'mixed-background' : 'bounded-concurrency';
      for (const key of Object.keys(validOutput(caseId).families[name][0] ?? {})) {
        rejectValid((value) => delete value.families[name][0][key], `${name}.${key}: omission`, caseId);
        rejectValid((value) => { value.families[name][0][key] = {}; }, `${name}.${key}: wrong type`, caseId);
      }
      const recordMutations = [
        ['extra', (record: any) => { record.extra = true; }],
        ['reordered', (record: any) => {
          const key = Object.keys(record)[0], item = record[key];
          delete record[key]; record[key] = item;
        }],
      ] as const;
      for (const [label, change] of recordMutations) {
        if (validOutput(caseId).families[name].length) {
          rejectValid((value) => change(value.families[name][0]), `${name} record: ${label}`, caseId);
        }
      }
    }
  });

  it('rejects recursive and descriptor-hostile output data without getter reads', () => {
    const locations = [
      ['root', (value: any) => value, 'families'], ['families', (value: any) => value.families, 'queued'],
      ['array', (value: any) => value.families.queued, '0'], ['record', (value: any) => value.families.queued[0], 'eventId'],
    ] as const;
    for (const [label, locate, key] of locations) {
      for (const [shape, change] of [
        ['cycle', (target: any) => { target.loop = target; }], ['function', (target: any) => { target.loop = () => {}; }],
        ['custom prototype', (target: any) => Object.setPrototypeOf(target, { hostile: true })],
      ] as const) {
        const value = validOutput(); change(locate(value));
        expect(() => invoke(value), `${label}: ${shape}`).toThrow('invalid PB-04');
      }
      const value = validOutput(), target = locate(value); let gets = 0;
      Object.defineProperty(target, key, {
        enumerable: true, configurable: true, get: () => { gets += 1; throw Error('get'); },
      });
      expect(() => invoke(value), `${label}: accessor`).toThrow('invalid PB-04');
      expect(gets, label).toBe(0);
    }
    for (const [label, change] of [
      ['sparse', (value: any) => delete value.families.queued[0]], ['shared', (value: any) => { value.families.running[0] = value.families.queued[0]; }],
      ['NaN', (value: any) => { value.families.result[0].value = NaN; }],
      ['Infinity', (value: any) => { value.families.result[0].value = Infinity; }],
      ['-Infinity', (value: any) => { value.families.result[0].value = -Infinity; }],
      ['-0', (value: any) => { value.families.result[0].value = -0; }],
      ['sealed record', (value: any) => Object.seal(value.families.queued[0])],
      ['mixed record profile', (value: any) => Object.defineProperty(value.families.queued[0], 'mode', { writable: false, configurable: false })],
      ['array length profile', (value: any) => Object.defineProperty(value.families.queued, 'length', { writable: false })],
    ] as const) {
      const value = validOutput(); change(value);
      expect(() => invoke(value), label).toThrow('invalid PB-04');
    }
  });

  it('captures transparent proxies once and rejects observable manifest deviations', () => {
    for (const [label, place, locate] of [
      ['output', (_: any, proxy: any) => proxy, (value: any) => value],
      ['nested record', (value: any, proxy: any) => ({
        ...value, families: { ...value.families, queued: [proxy, ...value.families.queued.slice(1)] },
      }), (value: any) => value.families.queued[0]],
      ['array including length', (value: any, proxy: any) => ({ ...value, families: { ...value.families, queued: proxy } }), (value: any) => value.families.queued],
    ] as const) {
      const source = validOutput(), target = locate(source);
      let keys = 0, descriptors = 0, extensible = 0, gets = 0;
      const proxy = new Proxy(target, {
        isExtensible(value) { extensible += 1; return Reflect.isExtensible(value); },
        ownKeys(value) { keys += 1; return Reflect.ownKeys(value); },
        getOwnPropertyDescriptor(value, key) { descriptors += 1; return Reflect.getOwnPropertyDescriptor(value, key); },
        get() { gets += 1; throw Error('live get'); },
      });
      const result = invoke(place(source, proxy));
      expect([keys, descriptors, extensible, gets], label).toEqual([
        1, Reflect.ownKeys(target).length, 1, 0,
      ]);
      expect(result).not.toBe(source); expect(Object.isFrozen(result)).toBe(true);
    }
    for (const [label, handler] of [
      ['reordered', { ownKeys: (value: any) => Reflect.ownKeys(value).reverse() }],
      ['incomplete', { ownKeys: (value: any) => Reflect.ownKeys(value).slice(1) }],
      ['accessor descriptor', {
        getOwnPropertyDescriptor: (value: any, key: PropertyKey) => key === 'identity'
          ? { enumerable: true, configurable: true, get() {} }
          : Reflect.getOwnPropertyDescriptor(value, key),
      }],
      ['throwing descriptor', { getOwnPropertyDescriptor() { throw Error('descriptor'); } }],
    ] as const) {
      const source = validOutput();
      expect(() => invoke(new Proxy(source, handler))).toThrow('invalid PB-04');
    }
  });
  it('captures target callables once and isolates returned data after capture', () => {
    const source = validOutput('single-foreground'); let calls = 0, reads = 0, descriptors = 0;
    const target = new Proxy({ observe: () => { calls += 1; return source; } }, {
      ownKeys(value) { reads += 1; return Reflect.ownKeys(value); },
      getOwnPropertyDescriptor(value, key) { descriptors += 1; return Reflect.getOwnPropertyDescriptor(value, key); },
      get() { throw Error('live get'); },
    });
    const result = adaptPB04({
      fixtureRoot: root, fixture: fixture(), caseId: 'single-foreground', targetId: 'fork', target,
    });
    source.families.queued[0].mode = 'changed';
    expect([calls, reads, descriptors, result.families.queued[0].mode]).toEqual([1, 1, 1, 'foreground']);
    let invalidCalls = 0;
    expect(() => adaptPB04({
      fixtureRoot: root, fixture: fixture(), caseId: 'single-foreground', targetId: 'fork',
      target: Object.defineProperty({}, 'observe', {
        enumerable: true, get() { invalidCalls += 1; return () => {}; },
      }),
    })).toThrow('invalid PB-04');
    expect(invalidCalls).toBe(0);
  });

  it('rejects request and target descriptor branches before observer invocation', () => {
    const request = (): any => ({
      fixtureRoot: root, fixture: fixture(), caseId: 'single-foreground', targetId: 'fork',
      target: { observe: (input: any) => envelope(input) },
    });
    const reject = (change: (value: any) => void, label: string) => {
      const value = request(); let calls = 0;
      value.target.observe = () => { calls += 1; return {}; };
      change(value);
      expect(() => adaptPB04(value), label).toThrow('invalid PB-04');
      expect(calls, label).toBe(0);
    };
    for (const key of ['fixtureRoot', 'fixture', 'caseId', 'targetId', 'target']) {
      reject((value) => delete value[key], `request.${key}: omission`);
      reject((value) => { value[key] = key === 'fixture' ? [] : 1; }, `request.${key}: wrong type`);
    }
    for (const [label, change] of [
      ['extra own', (value: any) => { value.extra = true; }], ['symbol', (value: any) => { value[Symbol('bad')] = true; }],
      ['nonenumerable', (value: any) => Object.defineProperty(value, 'hidden', { value: true })],
      ['reordered', (value: any) => { const item = value.fixtureRoot; delete value.fixtureRoot; value.fixtureRoot = item; }],
      ['target extra', (value: any) => { value.target.extra = true; }], ['target symbol', (value: any) => { value.target[Symbol('bad')] = true; }],
      ['target nonenumerable', (value: any) => Object.defineProperty(value.target, 'hidden', { value: true })],
      ['target wrong callable', (value: any) => { value.target.observe = 1; }],
    ] as const) reject(change, label);
  });

  it('rejects incoherent source profiles before observer invocation', () => {
    const request = (): any => ({
      fixtureRoot: root, fixture: fixture(), caseId: 'single-foreground', targetId: 'fork',
      target: { observe: (input: any) => envelope(input) },
    });
    for (const [label, change] of [
      ['mutable preventExtensions target', (value: any) => Object.preventExtensions(value.target)],
      ['mutable preventExtensions fixture', (value: any) => Object.preventExtensions(value.fixture)],
      ['extensible frozen fixture field', (value: any) => Object.defineProperty(value.fixture, 'fixtureId', {
        writable: false, configurable: false,
      })],
      ['noncanonical fixture array length', (value: any) => Object.defineProperty(value.fixture.cases, 'length', {
        writable: false,
      })],
    ] as const) {
      const value = request(); let calls = 0;
      value.target.observe = () => { calls += 1; return {}; };
      change(value);
      expect(() => adaptPB04(value), label).toThrow('invalid PB-04');
      expect(calls, label).toBe(0);
    }
  });

  it('rejects independently seeded semantic and Proxy descriptor substitutions', () => {
    for (const [label, change] of [
      ['queued task/mode binding', (value: any) => { value.families.queued[0].mode = 'background'; }],
      ['running runner identity', (value: any) => { value.families.running[0].runnerId = 'runner'; }],
      ['terminal state', (value: any) => { value.families.terminal[0].state = 'failed'; }],
      ['result state', (value: any) => { value.families.result[0].state = 'failed'; }],
      ['concurrency seed active-order', (value: any) => value.families.concurrency.find((item: any) => item.activeAttemptIds.length === 2).activeAttemptIds.reverse()],
      ['dispatch exact seed order', (value: any) => reversePositions(value.families.dispatchOrder)],
      ['completion exact seed order', (value: any) => reversePositions(value.families.completionOrder)],
    ] as const) {
      const output = validOutput(); change(output);
      expect(() => invoke(output), label).toThrow('invalid PB-04');
    }
    for (const [label, handler] of [
      ['extra manifest', { ownKeys: (value: any) => [...Reflect.ownKeys(value), 'extra'] }],
      ['duplicate manifest', { ownKeys: (value: any) => [...Reflect.ownKeys(value), 'identity'] }],
      ['substituted descriptor', {
        getOwnPropertyDescriptor: (value: any, key: PropertyKey) => key === 'caseId'
          ? { value: 'serial-foreground', enumerable: true, configurable: true, writable: true }
          : Reflect.getOwnPropertyDescriptor(value, key),
      }],
      ['descriptor-value TOCTOU', {
        getOwnPropertyDescriptor(value: any, key: PropertyKey) {
          if (key === 'identity') {
            const queued = value.families.queued, invalid = [...queued]; invalid[0] = {};
            value.families = new Proxy(value.families, { getOwnPropertyDescriptor(source, name) {
              if (name === 'queued') return { ...Reflect.getOwnPropertyDescriptor(source, name)!, value: invalid };
              if (name === 'running') invalid[0] = queued[0]; return Reflect.getOwnPropertyDescriptor(source, name);
            }});
          } return Reflect.getOwnPropertyDescriptor(value, key);
        },
      }],
    ] as const) {
      const output = validOutput();
      expect(() => invoke(new Proxy(output, handler)), label).toThrow('invalid PB-04');
    }
  });

  it('rejects invalid requests before calling the target', () => {
    let calls = 0;
    expect(() => adaptPB04({
      fixtureRoot: root, fixture: fixture(), caseId: 'not-a-case', targetId: 'fork',
      target: { observe() { calls += 1; return {}; } },
    })).toThrow('invalid PB-04');
    expect(calls).toBe(0);
  });
});
