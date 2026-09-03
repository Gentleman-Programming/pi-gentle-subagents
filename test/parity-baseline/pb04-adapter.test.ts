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

describe('PB-04 injected semantic adapter core', () => {
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
  it('rejects invalid requests before calling the target', () => {
    let calls = 0;
    expect(() => adaptPB04({
      fixtureRoot: root, fixture: fixture(), caseId: 'not-a-case', targetId: 'fork',
      target: { observe() { calls += 1; return {}; } },
    })).toThrow('invalid PB-04');
    expect(calls).toBe(0);
  });
});
