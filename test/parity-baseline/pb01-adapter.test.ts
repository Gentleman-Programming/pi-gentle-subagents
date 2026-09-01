import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript harness module has no declarations.
import { adaptPB01 } from '../../scripts/parity-baseline/adapters/PB-01.mjs';

const root = new URL('../../', import.meta.url);
const read = (name: string) => readFileSync(new URL(`evidence/parity-baseline/fixtures/${name}`, root), 'utf8');
const fixture = () => JSON.parse(read('PB-01.json'));
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const valid = () => ({
  packageIdentity: { name: '@acme/pi-plugin', version: '1.2.3', nodeRange: '>=22', piRange: '>=0.49.0' },
  packedFiles: [{ path: 'z.mjs', sha256: 'b'.repeat(64), size: 9 }, { path: 'a.mjs', sha256: 'a'.repeat(64), size: 0 }],
  entryPoints: [{ name: 'z', path: 'z.mjs' }, { name: 'main', path: 'index.mjs' }],
  extensionDeclarations: ['z', 'a'], skillDeclarations: ['skill-z', 'skill-a'],
  peerDeclarations: [{ name: 'z', range: '^2', optional: false }, { name: 'pi', range: '>=0.49.0', optional: true }],
  verificationResult: { status: 'passed', exit: 0, resourceCount: 2 },
  installResult: { status: 'passed', exit: 0, installedPath: 'node_modules/plugin' },
  updateResult: { status: 'passed', exit: 0, installedPath: 'node_modules/plugin' },
  loadResult: { status: 'passed', exit: 0, extensionLoadEvidence: ['a'], skillLoadEvidence: ['skill-a'] },
});
const invoke = (observation = valid(), inputFixture = fixture()) => adaptPB01({ fixture: inputFixture, observation });
const frozen = (value: unknown): boolean => value === null || typeof value !== 'object' || Object.isFrozen(value) && Reflect.ownKeys(value).every((key) => frozen((value as Record<PropertyKey, unknown>)[key]));

describe('PB-01 adapter', () => {
  it('owns the exact committed fixture and manifest digest', () => {
    const text = read('PB-01.json');
    expect(fixture()).toEqual({ schemaVersion: 1, identity: 'PB-01', fixtureId: 'pb-01-local-package-lifecycle-v1', procedureId: 'pb-01-local-package-lifecycle-v1', normalizationId: 'pb-01-package-observation-v1', cases: [{ id: 'local-package-lifecycle', requiredSubObservations: ['packageIdentity', 'packedFiles', 'entryPoints', 'extensionDeclarations', 'skillDeclarations', 'peerDeclarations', 'verificationResult', 'installResult', 'updateResult', 'loadResult'] }] });
    expect(JSON.parse(read('manifest.json'))).toEqual({ schemaVersion: 1, fixtures: [{ identity: 'PB-01', path: 'PB-01.json', sha256: digest(text) }] });
  });

  it('rejects every fixture descriptor family and cannot use caller selectors to define completeness', () => {
    const bad = [
      (v: any) => { v.schemaVersion = 2; }, (v: any) => { v.identity = 'PB-02'; }, (v: any) => { v.fixtureId = 'wrong'; },
      (v: any) => { v.procedureId = 'wrong'; }, (v: any) => { v.normalizationId = 'wrong'; }, (v: any) => { v.cases[0].id = 'wrong'; },
      (v: any) => { v.cases[0].requiredSubObservations.reverse(); }, (v: any) => { v.cases[0].requiredSubObservations.pop(); },
      (v: any) => { v.cases[0].requiredSubObservations.push('extra'); }, (v: any) => { v.cases[0].requiredSubObservations[1] = 'packageIdentity'; },
      (v: any) => { v.extra = true; }, (v: any) => { v.cases.push(clone(v.cases[0])); },
    ];
    for (const alter of bad) { const value = fixture(); alter(value); expect(() => invoke(valid(), value)).toThrow('invalid PB-01'); }
  });

  it('uses descriptor values, never getters, and rejects hostile descriptors', () => {
    const descriptor = valid(); Object.defineProperty(descriptor, 'packageIdentity', { enumerable: true, get: () => ({ name: 'getter', version: '1', nodeRange: 'x', piRange: 'y' }) });
    const nonenumerable = valid(); Object.defineProperty(nonenumerable, 'packageIdentity', { enumerable: false, value: nonenumerable.packageIdentity });
    const proxy = new Proxy(valid(), { getOwnPropertyDescriptor(target, key) { if (key === 'packageIdentity') return { enumerable: true, configurable: true, writable: true, value: null }; return Reflect.getOwnPropertyDescriptor(target, key); } });
    for (const value of [descriptor, nonenumerable, proxy, Object.assign(Object.create(null), valid()), (() => { const v: any = valid(); v[Symbol('x')] = true; return v; })()]) expect(() => invoke(value)).toThrow('invalid PB-01');
  });

  it('normalizes only declared set fields in UTF-16 code-unit order and has no aliases', () => {
    const input = valid(); input.extensionDeclarations = ['\u{10000}', '\uE000'];
    const output = invoke(input); const second = invoke(clone(input));
    expect(output.observation.extensionDeclarations).toEqual(['\u{10000}', '\uE000']);
    expect(output.observation.packedFiles.map((v: any) => v.path)).toEqual(['a.mjs', 'z.mjs']);
    expect(second).toEqual(output); expect(second).not.toBe(output); expect(frozen(output)).toBe(true);
    input.packedFiles[0].path = 'changed'; expect((output.observation.packedFiles as any)[0].path).toBe('a.mjs');
  });

  it.each([
    ['top omission', (v: any) => delete v.packageIdentity], ['top extra', (v: any) => v.extra = 1], ['cycle', (v: any) => v.loadResult.self = v], ['shared', (v: any) => v.updateResult = v.installResult],
    ['absolute', (v: any) => v.packedFiles[0].path = '/bad'], ['backslash', (v: any) => v.packedFiles[0].path = 'a\\b'], ['traversal', (v: any) => v.packedFiles[0].path = 'a/../b'], ['dot', (v: any) => v.entryPoints[0].path = './a'], ['empty segment', (v: any) => v.entryPoints[0].path = 'a//b'], ['control', (v: any) => v.packedFiles[0].path = 'a\nb'],
    ['packed duplicate', (v: any) => v.packedFiles[1].path = v.packedFiles[0].path], ['entry duplicate', (v: any) => v.entryPoints[1].name = v.entryPoints[0].name], ['declaration duplicate', (v: any) => v.skillDeclarations = ['x', 'x']], ['peer duplicate', (v: any) => v.peerDeclarations[1].name = v.peerDeclarations[0].name],
    ['digest', (v: any) => v.packedFiles[0].sha256 = 'A'.repeat(64)], ['negative size', (v: any) => v.packedFiles[0].size = -1], ['fractional size', (v: any) => v.packedFiles[0].size = 1.5], ['unsafe size', (v: any) => v.packedFiles[0].size = Number.MAX_SAFE_INTEGER + 1], ['unsafe name', (v: any) => v.entryPoints[0].name = 'bad\0'], ['unsafe range', (v: any) => v.peerDeclarations[0].range = 'bad\n'], ['nonfinite', (v: any) => v.packedFiles[0].size = Infinity],
  ])('rejects %s', (_name, alter) => { const value = valid(); alter(value); expect(() => invoke(value)).toThrow('invalid PB-01'); });

  it('has no ambient capability imports or parity claims', () => {
    const source = readFileSync(new URL('scripts/parity-baseline/adapters/PB-01.mjs', root), 'utf8');
    expect(source).not.toMatch(/from ['"]node:|\b(Date|Math\.random|fetch|process\.)/); expect(source).not.toMatch(/outcome|claim/i);
    expect(() => (adaptPB01 as any)()).toThrow('invalid PB-01');
  });

  it('rejects Windows drive absolute paths while valid normalized precursors pass', () => {
    for (const mutate of [(v: any) => v.packedFiles[0].path = 'C:/outside', (v: any) => v.entryPoints[0].path = 'z:/x', (v: any) => v.installResult.installedPath = 'C:/outside', (v: any) => v.updateResult.installedPath = 'z:/x', (v: any) => v.packedFiles[0].path = 'C:\\outside', (v: any) => v.entryPoints[0].path = 'z:\\x', (v: any) => v.installResult.installedPath = 'C:\\outside', (v: any) => v.updateResult.installedPath = 'z:\\x', (v: any) => v.packedFiles[0].path = '\\\\host/share', (v: any) => v.entryPoints[0].path = '/outside']) { const value = valid(); mutate(value); expect(() => invoke(value)).toThrow('invalid PB-01'); }
    expect(invoke()).toBeTruthy();
  });

  it('emits the complete exact normalized observation without aggregate substitutes or aliases', () => {
    const input = valid(); const output = invoke(input);
    expect(output).toEqual({ identity: 'PB-01', fixtureId: 'pb-01-local-package-lifecycle-v1', procedureId: 'pb-01-local-package-lifecycle-v1', normalizationId: 'pb-01-package-observation-v1', observation: { packageIdentity: input.packageIdentity, packedFiles: [input.packedFiles[1], input.packedFiles[0]], entryPoints: [input.entryPoints[1], input.entryPoints[0]], extensionDeclarations: ['a', 'z'], skillDeclarations: ['skill-a', 'skill-z'], peerDeclarations: [input.peerDeclarations[1], input.peerDeclarations[0]], verificationResult: input.verificationResult, installResult: input.installResult, updateResult: input.updateResult, loadResult: input.loadResult } });
    const repeat = invoke(clone(input)); expect(repeat).toEqual(output); input.packageIdentity.name = 'mutated'; input.loadResult.extensionLoadEvidence[0] = 'mutated'; expect(output.observation.packageIdentity.name).toBe('@acme/pi-plugin'); expect(output.observation.loadResult.extensionLoadEvidence).toEqual(['a']);
  });

  it.each([
    ['package missing', (v: any) => delete v.packageIdentity.name], ['package extra', (v: any) => v.packageIdentity.extra = 1], ['package wrong type', (v: any) => v.packageIdentity.version = 1], ['package control', (v: any) => v.packageIdentity.piRange = 'x\n'],
    ['packed missing', (v: any) => delete v.packedFiles[0].path], ['packed extra', (v: any) => v.packedFiles[0].extra = 1], ['packed bad path', (v: any) => v.packedFiles[0].path = 'C:/x'], ['packed bad digest', (v: any) => v.packedFiles[0].sha256 = 'x'], ['packed negative', (v: any) => v.packedFiles[0].size = -1], ['packed fractional', (v: any) => v.packedFiles[0].size = .5], ['packed unsafe', (v: any) => v.packedFiles[0].size = Number.MAX_SAFE_INTEGER + 1],
    ['entry missing', (v: any) => delete v.entryPoints[0].name], ['entry extra', (v: any) => v.entryPoints[0].extra = 1], ['entry bad name', (v: any) => v.entryPoints[0].name = 'x\0'], ['entry bad path', (v: any) => v.entryPoints[0].path = 'C:/x'],
    ['extension bad', (v: any) => v.extensionDeclarations = ['x\n']], ['extension duplicate', (v: any) => v.extensionDeclarations = ['x', 'x']], ['skill bad', (v: any) => v.skillDeclarations = ['x\n']], ['skill duplicate', (v: any) => v.skillDeclarations = ['x', 'x']],
    ['peer missing', (v: any) => delete v.peerDeclarations[0].name], ['peer extra', (v: any) => v.peerDeclarations[0].extra = 1], ['peer bad name', (v: any) => v.peerDeclarations[0].name = 'x\0'], ['peer bad range', (v: any) => v.peerDeclarations[0].range = 'x\n'], ['peer optional', (v: any) => v.peerDeclarations[0].optional = 1],
    ['verification missing', (v: any) => delete v.verificationResult.status], ['verification extra', (v: any) => v.verificationResult.extra = 1], ['verification status', (v: any) => v.verificationResult.status = 'unknown'], ['verification exit', (v: any) => v.verificationResult.exit = -1], ['verification resources', (v: any) => v.verificationResult.resourceCount = -1],
    ['install missing', (v: any) => delete v.installResult.status], ['install extra', (v: any) => v.installResult.extra = 1], ['install status', (v: any) => v.installResult.status = 'unknown'], ['install exit', (v: any) => v.installResult.exit = -1], ['install path', (v: any) => v.installResult.installedPath = 'C:/x'],
    ['update missing', (v: any) => delete v.updateResult.status], ['update extra', (v: any) => v.updateResult.extra = 1], ['update status', (v: any) => v.updateResult.status = 'unknown'], ['update exit', (v: any) => v.updateResult.exit = -1], ['update path', (v: any) => v.updateResult.installedPath = 'C:/x'],
    ['load missing', (v: any) => delete v.loadResult.status], ['load extra', (v: any) => v.loadResult.extra = 1], ['load status', (v: any) => v.loadResult.status = 'unknown'], ['load exit', (v: any) => v.loadResult.exit = -1], ['load extension evidence', (v: any) => v.loadResult.extensionLoadEvidence = ['x', 'x']], ['load skill evidence', (v: any) => v.loadResult.skillLoadEvidence = ['x\n']],
  ])('rejects fresh valid record vector: %s', (_name, mutate) => { const value = valid(); expect(invoke(value)).toBeTruthy(); mutate(value); expect(() => invoke(value)).toThrow('invalid PB-01'); });

  it('rejects hostile nested records and snapshots proxy descriptor values without live gets', () => {
    const nested = [(v: any) => Object.defineProperty(v.packedFiles[0], 'path', { enumerable: true, get: () => 'x' }), (v: any) => Object.defineProperty(v.entryPoints[0], 'name', { enumerable: false, value: 'x' }), (v: any) => v.peerDeclarations[0][Symbol('x')] = true, (v: any) => Object.setPrototypeOf(v.verificationResult, null), (v: any) => v.installResult.self = v.installResult, (v: any) => v.updateResult.shared = v.loadResult, (v: any) => v.packedFiles[0].size = Infinity, (v: any) => v.loadResult.extensionLoadEvidence[0] = 'x\n'];
    for (const mutate of nested) { const value = valid(); mutate(value); expect(() => invoke(value)).toThrow('invalid PB-01'); }
    const value = valid(); const target = value.entryPoints[0]; value.entryPoints[0] = new Proxy(target, { get(t, key, receiver) { return key === 'path' ? 'live-get-substitution' : Reflect.get(t, key, receiver); }, getOwnPropertyDescriptor(t, key) { return Reflect.getOwnPropertyDescriptor(t, key); } }); expect(invoke(value).observation.entryPoints.find((item: any) => item.name === 'z').path).toBe('z.mjs');
  });

});
