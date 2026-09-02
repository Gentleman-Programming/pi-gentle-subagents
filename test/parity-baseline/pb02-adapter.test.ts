import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript harness module has no declarations.
import { adaptPB02 } from '../../scripts/parity-baseline/adapters/PB-02.mjs';

const root = new URL('../../', import.meta.url);
const read = (name: string) => readFileSync(new URL(`evidence/parity-baseline/fixtures/${name}`, root), 'utf8');
const manifest = () => ({
  schemaVersion: 1,
  fixtures: [
    { identity: 'PB-01', path: 'PB-01.json', sha256: '86c48b13224da2de87e258bd6681187b73b46f147eca947ffe0aa25c613f3093' },
    { identity: 'PB-02', path: 'PB-02.json', sha256: 'c7312d5567953b6357221b216aeaec1635d634a3a19e16ae89f0b61bbad15cc8' },
    { identity: 'PB-03', path: 'PB-03.json', sha256: 'f877f8167aab9c0512c441c3e1c68045393b74945ee1e7805997806659ae6dda' },
    { identity: 'PB-04', path: 'PB-04.json', sha256: '9cc8bbc646ad530051b0e919c9c62617397b0012a678f8e89b8c91e5d401b972' },
  ],
  eventSeeds: [
    { owner: 'PB-04', caseId: 'single-foreground',
      eventSeedId: 'pb-04-single-foreground-events-v1', path: 'events/pb-04/single-foreground.json', sha256: 'bbad31dcfcaa968a7bdd830bae26cb00faa9df323c9d6e998ae02b000af82999' },
    { owner: 'PB-04', caseId: 'serial-foreground',
      eventSeedId: 'pb-04-serial-foreground-events-v1', path: 'events/pb-04/serial-foreground.json', sha256: 'd1da6c5fb275a1c8b34ec45f1fdf7e2fb847882c35ab9e3f6899d4fad44beb8c' },
    { owner: 'PB-04', caseId: 'bounded-concurrency',
      eventSeedId: 'pb-04-bounded-concurrency-events-v1',
      path: 'events/pb-04/bounded-concurrency.json', sha256: 'dd5c2fa54499579cbeb52f9cc1f0ca64b8c2053da4f3c65010b5ae611bf28373' },
    { owner: 'PB-04', caseId: 'mixed-background',
      eventSeedId: 'pb-04-mixed-background-events-v1', path: 'events/pb-04/mixed-background.json', sha256: 'b71e954d3586bebf2f4f679e3b13d615abec5daab0c8f5367ec5c1bf86ea5f17' },
  ],
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const ids = ['full-capability', 'absent-message-renderer', 'absent-shortcut', 'absent-lifecycle-listener', 'absent-widget', 'absent-terminal-input'];
const fields = ['tools', 'commands', 'warnings', 'shortcuts', 'messageRenderers', 'sessionHandlers', 'listeners', 'widgets', 'terminalInputListeners', 'cleanup', 'fallback'];
const optional = { 'message-renderer': ['messageRenderers'], shortcut: ['shortcuts'], 'lifecycle-listener': ['sessionHandlers', 'listeners'], widget: ['widgets'], 'terminal-input': ['terminalInputListeners'] } as const;
const fixture = () => JSON.parse(read('PB-02.json'));
const valid = () => ({
  tools: [{ name: 'delegate_task', description: 'Delegate task', handler: true }, { name: 'inspect_task', description: 'Inspect task', handler: true }],
  commands: [{ name: 'subagents', description: 'Show agents', handler: true }, { name: 'tasks', description: 'Show tasks', handler: true }],
  warnings: [{ severity: 'warning', message: 'Optional UI unavailable' }, { severity: 'warning', message: 'Registration complete' }],
  shortcuts: [{ key: 'ctrl+s', description: 'Show agents', handler: true }, { key: 'ctrl+t', description: 'Show tasks', handler: true }],
  messageRenderers: [{ name: 'subagent-message', handler: true }, { name: 'task-message', handler: true }],
  sessionHandlers: [{ event: 'session_start', handler: true }, { event: 'session_resume', handler: true }],
  listeners: [{ event: 'session_shutdown', handler: true }, { event: 'session_end', handler: true }],
  widgets: [{ name: 'subagents-panel', handler: true }, { name: 'task-panel', handler: true }],
  terminalInputListeners: [{ event: 'input', handler: true }, { event: 'keypress', handler: true }],
  cleanup: [{ event: 'dispose', owner: 'subagents' }, { event: 'unload', owner: 'subagents' }], fallback: null as null | { capability: string; behavior: string },
});
const forCase = (id: string) => { const value = valid(); const capability = id.slice(7); if (id !== ids[0]) { for (const key of optional[capability as keyof typeof optional]) (value as any)[key] = []; value.fallback = { capability, behavior: 'observed fallback' }; } return value; };
const invoke = (caseId: string, observation = forCase(caseId), inputFixture = fixture()) => adaptPB02({ fixture: inputFixture, caseId, observation });
const frozen = (value: unknown): boolean => value === null || typeof value !== 'object' || Object.isFrozen(value) && Reflect.ownKeys(value).every((key) => frozen((value as Record<PropertyKey, unknown>)[key]));
const rejects = (label: string, mutate: (value: any) => void, id = ids[0]) => { const value = forCase(id); expect(invoke(id, value), label).toBeTruthy(); mutate(value); expect(() => invoke(id, value), label).toThrow('invalid PB-02'); };

describe('PB-02 adapter', () => {
  it('uses the exact hyphenated PB-02 identity in fixture metadata', () => {
    expect(fixture().identity).toBe('PB-02');
    expect(JSON.parse(read('manifest.json')).fixtures.map(({ identity }: { identity: string }) => identity)).toEqual(['PB-01', 'PB-02', 'PB-03', 'PB-04']);
  });

  it('owns six exact fixture vectors and the PB-01 coexistence manifest', () => {
    expect(fixture()).toEqual({ schemaVersion: 1, identity: 'PB-02', fixtureId: 'pb-02-registration-lifecycle-v1', procedureId: 'pb-02-registration-lifecycle-v1', normalizationId: 'pb-02-registration-observation-v1', cases: ids.map((id) => ({ id, absentCapability: id === ids[0] ? null : id.slice(7), requiredSubObservations: fields })) });
    expect(JSON.parse(read('manifest.json'))).toEqual(manifest());
  });

  it.each(ids)('preserves every ordered observation family exactly for %s', (caseId) => {
    const input = forCase(caseId); const first = invoke(caseId, input); const second = invoke(caseId, clone(input));
    expect(first).toEqual({ identity: 'PB-02', fixtureId: 'pb-02-registration-lifecycle-v1', procedureId: 'pb-02-registration-lifecycle-v1', normalizationId: 'pb-02-registration-observation-v1', caseId, observation: input });
    expect(second).toEqual(first); expect(second).not.toBe(first); expect(frozen(first)).toBe(true);
    for (const [capability, group] of Object.entries(optional)) expect(group.every((key) => (first.observation as any)[key].length > 0)).toBe(capability !== caseId.slice(7));
    input.tools[0].name = 'mutated'; input.cleanup[0].owner = 'mutated'; expect(first.observation.tools[0].name).toBe('delegate_task'); expect(first.observation.cleanup[0].owner).toBe('subagents');
  });

  it('proves code-unit input order, tuple identity, and no adapter sorting', () => {
    const value = valid(); value.tools = [{ name: '\uE000', description: 'first', handler: true }, { name: '\u{10000}', description: 'second', handler: true }]; value.cleanup = [{ event: 'ab', owner: 'c' }, { event: 'a', owner: 'bc' }];
    const output = invoke(ids[0], value); expect(output.observation.tools.map((item: any) => item.name)).toEqual(['\uE000', '\u{10000}']); expect(output.observation.cleanup).toEqual(value.cleanup);
    rejects('duplicate cleanup tuple', (v) => v.cleanup[1] = clone(v.cleanup[0]));
    const source = readFileSync(new URL('scripts/parity-baseline/adapters/PB-02.mjs', root), 'utf8'); expect(source).not.toMatch(/\.sort\s*\(|localeCompare|Intl\./);
  });

  it.each([
    ['fixture schema', (v: any) => v.schemaVersion = 2], ['fixture identity', (v: any) => v.identity = 'PB-01'], ['fixture procedure', (v: any) => v.procedureId = 'x'], ['fixture normalization', (v: any) => v.normalizationId = 'x'], ['fixture selector omission', (v: any) => v.cases[0].requiredSubObservations.pop()], ['fixture selector extra', (v: any) => v.cases[0].requiredSubObservations.push('x')], ['fixture selector reorder', (v: any) => v.cases[0].requiredSubObservations.reverse()], ['fixture duplicate', (v: any) => v.cases[1] = clone(v.cases[0])], ['fixture control', (v: any) => v.fixtureId = 'x\n'], ['fixture accessor', (v: any) => Object.defineProperty(v.cases[0], 'id', { enumerable: true, get: () => 'x' })], ['fixture symbol', (v: any) => v[Symbol('x')] = true], ['fixture nonenumerable', (v: any) => Object.defineProperty(v, 'cases', { enumerable: false, value: v.cases })], ['fixture prototype', (v: any) => Object.setPrototypeOf(v, null)], ['fixture cycle', (v: any) => v.cases[0].self = v],
  ])('rejects fresh fixture vector: %s', (_label, mutate) => { const input = fixture(); mutate(input); expect(() => invoke(ids[0], valid(), input)).toThrow('invalid PB-02'); });

  it.each(['tools', 'commands', 'warnings', 'shortcuts', 'messageRenderers', 'sessionHandlers', 'listeners', 'widgets', 'terminalInputListeners', 'cleanup'])('rejects every top-level container fault for %s', (key) => {
    for (const mutate of [(v: any) => delete v[key], (v: any) => v[key] = {}, (v: any) => v[key] = [,,], (v: any) => v.extra = true]) rejects(`${key} container`, mutate);
  });

  it.each([(v: any) => delete v.fallback, (v: any) => v.fallback = [], (v: any) => v.fallback = { capability: 'widget' }])('rejects every fallback top-level shape', (mutate) => rejects('fallback top-level', mutate));

  it.each([
    ['tools', ['name', 'description', 'handler']], ['commands', ['name', 'description', 'handler']], ['warnings', ['severity', 'message']], ['shortcuts', ['key', 'description', 'handler']], ['messageRenderers', ['name', 'handler']], ['sessionHandlers', ['event', 'handler']], ['listeners', ['event', 'handler']], ['widgets', ['name', 'handler']], ['terminalInputListeners', ['event', 'handler']], ['cleanup', ['event', 'owner']],
  ] as const)('rejects every nested record schema family: %s', (key, schema) => {
    for (const field of schema) rejects(`${key}.${field} omission`, (v) => delete v[key][0][field]);
    rejects(`${key} extra`, (v) => v[key][0].extra = true); rejects(`${key} wrong control`, (v) => v[key][0][schema[0]] = 'bad\n'); rejects(`${key} duplicate`, (v) => v[key][1] = clone(v[key][0]));
    if (schema.includes('handler' as never)) rejects(`${key} handler type`, (v) => v[key][0].handler = 1);
  });

  it('rejects hostile recursive state and all optional/fallback contradictions', () => {
    for (const mutate of [(v: any) => Object.defineProperty(v.tools[0], 'name', { enumerable: true, get: () => 'live' }), (v: any) => v.tools[0][Symbol('x')] = true, (v: any) => Object.defineProperty(v.tools[0], 'name', { enumerable: false, value: 'x' }), (v: any) => Object.setPrototypeOf(v.tools[0], null), (v: any) => v.tools[0].self = v, (v: any) => v.commands[0] = v.tools[0], (v: any) => v.tools[0].name = '\u0000', (v: any) => v.fallback = {}, (v: any) => v.fallback = { capability: 'widget', behavior: 'x' }]) rejects('hostile state', mutate);
    for (const id of ids.slice(1)) { rejects(`${id} missing fallback`, (v) => v.fallback = null, id); rejects(`${id} wrong fallback`, (v) => v.fallback.capability = id === 'absent-widget' ? 'shortcut' : 'widget', id); rejects(`${id} malformed fallback`, (v) => v.fallback.behavior = '', id); }
    rejects('session only lifecycle contradiction', (v) => v.sessionHandlers = valid().sessionHandlers, 'absent-lifecycle-listener'); rejects('listener only lifecycle contradiction', (v) => v.listeners = valid().listeners, 'absent-lifecycle-listener'); rejects('both lifecycle categories contradiction', (v) => { v.sessionHandlers = valid().sessionHandlers; v.listeners = valid().listeners; }, 'absent-lifecycle-listener'); rejects('full lifecycle absence', (v) => { v.sessionHandlers = []; v.listeners = []; }, ids[0]); rejects('unrelated optional absence', (v) => v.widgets = [], 'absent-shortcut');
  });

  it('rejects descriptor/proxy mutations and has no ambient runtime or parity claim', () => {
    const proxy = new Proxy(forCase(ids[0]), { getOwnPropertyDescriptor(target, key) { if (key === 'tools') return { enumerable: true, configurable: true, writable: true, value: [] }; return Reflect.getOwnPropertyDescriptor(target, key); } });
    expect(() => invoke(ids[0], proxy)).toThrow('invalid PB-02'); const source = readFileSync(new URL('scripts/parity-baseline/adapters/PB-02.mjs', root), 'utf8'); expect(source).not.toMatch(/from ['"]node:|\b(Date|Math\.random|fetch|process\.)|outcome|claim|PB-03/i);
  });
});

// Public precursor vectors retained separately so every failure reaches the adapter boundary.
describe('PB-02 adapter precursor completeness', () => {
  const fixtureRejects = (label: string, mutate: (value: any) => void) => {
    const input = fixture(); mutate(input);
    expect(() => invoke(ids[0], valid(), input), label).toThrow('invalid PB-02');
  };

  it.each([
    ['fixture root omission', (v: any) => delete v.fixtureId], ['fixture root extra', (v: any) => v.extra = true], ['fixture root primitive', (v: any) => v.cases = 'cases'],
    ['case omission', (v: any) => delete v.cases[0].absentCapability], ['case extra', (v: any) => v.cases[0].extra = true], ['case primitive', (v: any) => v.cases[0] = 'case'],
    ['cases hole', (v: any) => { delete v.cases[1]; }], ['case id wrong', (v: any) => v.cases[0].id = 'wrong'], ['case id control', (v: any) => v.cases[0].id = 'bad\n'],
    ['selectors missing', (v: any) => v.cases[0].requiredSubObservations.pop()], ['selectors extra', (v: any) => v.cases[0].requiredSubObservations.push('extra')], ['selectors wrong', (v: any) => v.cases[0].requiredSubObservations[0] = 'extra'], ['selectors reordered', (v: any) => v.cases[0].requiredSubObservations.reverse()], ['selectors duplicate', (v: any) => v.cases[0].requiredSubObservations[1] = v.cases[0].requiredSubObservations[0]],
  ])('rejects fresh valid fixture precursor: %s', (_label, mutate) => fixtureRejects(_label, mutate));

  it.each([
    ['tools', ['name', 'description']], ['commands', ['name', 'description']], ['warnings', ['severity', 'message']], ['shortcuts', ['key', 'description']], ['messageRenderers', ['name']], ['sessionHandlers', ['event']], ['listeners', ['event']], ['widgets', ['name']], ['terminalInputListeners', ['event']], ['cleanup', ['event', 'owner']],
  ] as const)('rejects every non-handler primitive type/control and extra field: %s', (key, primitiveFields) => {
    for (const field of primitiveFields) {
      rejects(`${key}.${field} wrong type`, (v) => v[key][0][field] = 1);
      rejects(`${key}.${field} control text`, (v) => v[key][0][field] = 'bad\n');
    }
    rejects(`${key} record extra`, (v) => v[key][0].extra = true);
  });

  it('reaches warning enum validation and recursive descriptor-copy number rejection', () => {
    rejects('warning severity enum notice', (v) => v.warnings[0] = { severity: 'notice', message: 'textually safe warning' });
    for (const [label, number] of [['nested Infinity', Infinity], ['nested NaN', NaN], ['nested -0', -0]] as const) {
      const value = valid(); let nestedDescriptorReads = 0;
      value.tools[0] = new Proxy({ name: 'delegate_task', description: 'Delegate task', handler: true, nested: number }, {
        getOwnPropertyDescriptor(target, key) { if (key === 'nested') nestedDescriptorReads += 1; return Reflect.getOwnPropertyDescriptor(target, key); },
      });
      expect(() => invoke(ids[0], value), label).toThrow('invalid PB-02');
      expect(nestedDescriptorReads, label).toBe(1);
    }
  });

  it('accepts descriptor snapshots without live gets and reads each descriptor once', () => {
    const observed = valid(); const rootCounts = new Map<string, number>();
    const proxy = new Proxy(observed, {
      get(target, key) { throw new Error(`live get: ${String(key)}`); },
      getOwnPropertyDescriptor(target, key) {
        const name = String(key); rootCounts.set(name, (rootCounts.get(name) ?? 0) + 1);
        if ((rootCounts.get(name) ?? 0) > 1) return { enumerable: true, configurable: true, writable: true, value: 'hostile' };
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const output = invoke(ids[0], proxy);
    expect([...rootCounts.values()]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(output.observation).toEqual(valid());

    const counts = new Map<string, number>();
    const nested = new Proxy(valid().tools[0], {
      getOwnPropertyDescriptor(target, key) {
        const name = String(key); counts.set(name, (counts.get(name) ?? 0) + 1);
        if ((counts.get(name) ?? 0) > 1) return { enumerable: true, configurable: true, writable: true, value: 'hostile' };
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const value = valid(); value.tools[0] = nested as any;
    const exactOutput = invoke(ids[0], value);
    expect(exactOutput.observation.tools[0]).toEqual({ name: 'delegate_task', description: 'Delegate task', handler: true });
    expect([...counts.values()]).toEqual([1, 1, 1]);
  });
});
