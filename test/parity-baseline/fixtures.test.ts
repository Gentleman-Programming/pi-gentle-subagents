import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript evidence helper is exercised directly by Vitest.
import { createEvidenceRef, readEvidence } from '../../scripts/parity-baseline/lib/evidence-store.mjs';
// @ts-expect-error PB-03 fixture authority is introduced by this work unit.
import * as fixtureDefinition from '../../scripts/parity-baseline/lib/fixture-definition.mjs';
const { validateFixtureManifest, validatePB03Fixture } = fixtureDefinition;

const roots: string[] = [];
function root() { const value = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-')); roots.push(value); return value; }
afterEach(() => roots.splice(0).forEach((value) => fs.rmSync(value, { recursive: true, force: true })));

describe('evidence store', () => {
  it('creates and resolves content-addressed relative JSON evidence', () => {
    const directory = root();
    fs.mkdirSync(path.join(directory, 'targets/fork'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'targets/fork/one.json'), '{"ok":true}\n');
    const reference = createEvidenceRef(directory, 'targets/fork/one.json');
    expect(reference).toMatchObject({ path: 'targets/fork/one.json', mediaType: 'application/json' });
    expect(readEvidence(directory, reference).toString()).toBe('{"ok":true}\n');
  });

  it.each(['../outside.json', '/absolute.json'])('rejects unsafe reference path %s', (unsafe) => {
    expect(() => createEvidenceRef(root(), unsafe)).toThrow('relative');
  });

  it('rejects evidence changed after its reference is created', () => {
    const directory = root();
    fs.writeFileSync(path.join(directory, 'one.json'), '{}');
    const reference = createEvidenceRef(directory, 'one.json');
    fs.writeFileSync(path.join(directory, 'one.json'), '{"changed":true}');
    expect(() => readEvidence(directory, reference)).toThrow('digest');
  });

  it('rejects an intermediate-directory symlink that escapes the root', () => {
    const directory = root();
    const outside = root();
    fs.writeFileSync(path.join(outside, 'escape.json'), '{}');
    fs.symlinkSync(outside, path.join(directory, 'linked'));
    expect(() => createEvidenceRef(directory, 'linked/escape.json')).toThrow('symlink');
  });

  it('rejects backslash paths at the evidence-store boundary', () => {
    expect(() => createEvidenceRef(root(), 'targets\\fork\\one.json')).toThrow('relative');
  });

  it('rejects symlinks and digest mismatches', () => {
    const directory = root();
    fs.writeFileSync(path.join(directory, 'real.json'), '{}');
    fs.symlinkSync('real.json', path.join(directory, 'link.json'));
    expect(() => createEvidenceRef(directory, 'link.json')).toThrow('symlink');
    expect(() => readEvidence(directory, { path: 'real.json', sha256: 'a'.repeat(64), mediaType: 'application/json' })).toThrow('digest');
  });
});

describe('PB-04 immutable asset anchors', () => {
  const fixtureRoot = path.resolve(import.meta.dirname, '../../evidence/parity-baseline/fixtures');
  const read = (name: string) => fs.readFileSync(path.join(fixtureRoot, name), 'utf8');
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const deeplyFrozen = (value: unknown): boolean => value === null || typeof value !== 'object'
    || Object.isFrozen(value) && Reflect.ownKeys(value).every((key) => deeplyFrozen((value as Record<PropertyKey, unknown>)[key]));
  const validManifest = () => {
    const manifest = JSON.parse(read('manifest.json'));
    expect(validateFixtureManifest(fixtureRoot, manifest)).toEqual(manifest);
    return manifest;
  };

  it('accepts the exact ordered fixture and event manifest with pinned asset bytes', () => {
    const manifest = JSON.parse(read('manifest.json'));
    expect(validateFixtureManifest(fixtureRoot, manifest)).toEqual(manifest);
    expect(manifest.fixtures.map(({ identity, path: assetPath, sha256 }: any) => [identity, assetPath, sha256])).toEqual([
      ['PB-01', 'PB-01.json', '86c48b13224da2de87e258bd6681187b73b46f147eca947ffe0aa25c613f3093'],
      ['PB-02', 'PB-02.json', 'c7312d5567953b6357221b216aeaec1635d634a3a19e16ae89f0b61bbad15cc8'],
      ['PB-03', 'PB-03.json', 'f877f8167aab9c0512c441c3e1c68045393b74945ee1e7805997806659ae6dda'],
      ['PB-04', 'PB-04.json', '9cc8bbc646ad530051b0e919c9c62617397b0012a678f8e89b8c91e5d401b972'],
    ]);
    expect(manifest.eventSeeds.map(({ owner, caseId, eventSeedId, path: assetPath, sha256 }: any) => [owner, caseId, eventSeedId, assetPath, sha256])).toEqual([
      ['PB-04', 'single-foreground', 'pb-04-single-foreground-events-v1',
        'events/pb-04/single-foreground.json', 'bbad31dcfcaa968a7bdd830bae26cb00faa9df323c9d6e998ae02b000af82999'],
      ['PB-04', 'serial-foreground', 'pb-04-serial-foreground-events-v1',
        'events/pb-04/serial-foreground.json', 'd1da6c5fb275a1c8b34ec45f1fdf7e2fb847882c35ab9e3f6899d4fad44beb8c'],
      ['PB-04', 'bounded-concurrency', 'pb-04-bounded-concurrency-events-v1',
        'events/pb-04/bounded-concurrency.json', 'dd5c2fa54499579cbeb52f9cc1f0ca64b8c2053da4f3c65010b5ae611bf28373'],
      ['PB-04', 'mixed-background', 'pb-04-mixed-background-events-v1',
        'events/pb-04/mixed-background.json', 'b71e954d3586bebf2f4f679e3b13d615abec5daab0c8f5367ec5c1bf86ea5f17'],
    ]);
    expect(JSON.parse(read('PB-04.json')).cases).toHaveLength(4);
    for (const event of manifest.eventSeeds) expect(JSON.parse(read(event.path)).events).not.toHaveLength(0);
  });

  it('keeps external anchors closure-private', () => {
    expect(Object.keys(fixtureDefinition).sort()).toEqual(['validateFixtureManifest', 'validatePB03Fixture']);
  });

  it('returns fresh, deeply frozen manifest snapshots without aliases', () => {
    const input = validManifest();
    const first = validateFixtureManifest(fixtureRoot, input);
    const second = validateFixtureManifest(fixtureRoot, clone(input));
    expect(deeplyFrozen(first)).toBe(true); expect(deeplyFrozen(second)).toBe(true);
    expect(second).toEqual(first); expect(second).not.toBe(first);
    input.eventSeeds[0].sha256 = 'a'.repeat(64);
    expect(first.eventSeeds[0].sha256).toBe('bbad31dcfcaa968a7bdd830bae26cb00faa9df323c9d6e998ae02b000af82999');
  });

  it('rejects coordinated PB-04 bytes and manifest digest substitution against external anchors', () => {
    const directory = root();
    fs.cpSync(fixtureRoot, directory, { recursive: true });
    fs.appendFileSync(path.join(directory, 'PB-04.json'), ' ');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    manifest.fixtures[3].sha256 = createHash('sha256').update(fs.readFileSync(path.join(directory, 'PB-04.json'))).digest('hex');
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    expect(() => validateFixtureManifest(directory, manifest)).toThrow('invalid PB-03 fixture');
  });

  it('rejects coordinated event, PB-04, and manifest digest substitution against external anchors', () => {
    const directory = root();
    fs.cpSync(fixtureRoot, directory, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    const fixture = JSON.parse(fs.readFileSync(path.join(directory, 'PB-04.json'), 'utf8'));
    const event = manifest.eventSeeds[0];
    fs.appendFileSync(path.join(directory, event.path), ' ');
    const eventDigest = createHash('sha256').update(fs.readFileSync(path.join(directory, event.path))).digest('hex');
    fixture.cases[0].eventSeedDigest = eventDigest;
    fs.writeFileSync(path.join(directory, 'PB-04.json'), JSON.stringify(fixture));
    event.sha256 = eventDigest;
    manifest.fixtures[3].sha256 = createHash('sha256').update(fs.readFileSync(path.join(directory, 'PB-04.json'))).digest('hex');
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    expect(() => validateFixtureManifest(directory, manifest)).toThrow('invalid PB-03 fixture');
  });

  it.each([
    ['reordered fixtures', (value: any) => value.fixtures.reverse()],
    ['reordered event seeds', (value: any) => value.eventSeeds.reverse()],
    ['wrong event owner', (value: any) => value.eventSeeds[0].owner = 'PB-03'],
    ['wrong event path', (value: any) => value.eventSeeds[0].path = 'events/pb-04/serial-foreground.json'],
    ['wrong event seed id', (value: any) => value.eventSeeds[0].eventSeedId = 'wrong'],
    ['wrong event SHA', (value: any) => value.eventSeeds[0].sha256 = 'a'.repeat(64)],
    ['missing fixture', (value: any) => value.fixtures.pop()],
    ['extra fixture', (value: any) => value.fixtures.push(clone(value.fixtures[0]))],
    ['missing event', (value: any) => value.eventSeeds.pop()],
    ['extra event', (value: any) => value.eventSeeds.push(clone(value.eventSeeds[0]))],
  ])('rejects fresh valid manifest precursor: %s', (_label, mutate) => {
    const value = validManifest(); mutate(value);
    expect(() => validateFixtureManifest(fixtureRoot, value)).toThrow('invalid PB-03 fixture');
  });
});

describe('PB-03 fixture authority', () => {
  const fixtureRoot = path.resolve(import.meta.dirname, '../../evidence/parity-baseline/fixtures');
  const read = (name: string) => fs.readFileSync(path.join(fixtureRoot, name), 'utf8');
  const fixture = () => JSON.parse(read('PB-03.json'));

  it('accepts only the exact content-addressed PB-01/PB-02/PB-03 manifest', () => {
    const manifest = JSON.parse(read('manifest.json'));
    expect(validateFixtureManifest(fixtureRoot, manifest)).toEqual(manifest);
    for (const change of [(value: any) => value.fixtures.reverse(), (value: any) => value.fixtures.pop(), (value: any) => { value.fixtures[2].sha256 = 'a'.repeat(64); }]) {
      const value = JSON.parse(read('manifest.json')); change(value);
      expect(() => validateFixtureManifest(fixtureRoot, value)).toThrow();
    }
  });

  it('accepts exact committed seed bytes and rejects descriptor, inventory, and hostile-object drift', () => {
    expect(validatePB03Fixture(fixtureRoot, fixture())).toEqual(fixture());
    for (const change of [
      (value: any) => { value.cases.reverse(); },
      (value: any) => { value.seeds[0].sha256 = 'A'.repeat(64); },
      (value: any) => { value.seeds[0].path = '../escape'; },
      (value: any) => { value.seeds[0].role = 'profile'; },
      (value: any) => { value.seeds.pop(); },
    ]) {
      const value = fixture(); change(value);
      expect(() => validatePB03Fixture(fixtureRoot, value)).toThrow();
    }
    const hostile = fixture();
    Object.defineProperty(hostile, 'identity', { enumerable: true, get() { throw new Error('live'); } });
    expect(() => validatePB03Fixture(fixtureRoot, hostile)).toThrow();
  });

  it('fails closed for every hostile shape and returns independent frozen definitions', () => {
    const valid = fixture(); const first = validatePB03Fixture(fixtureRoot, valid); const second = validatePB03Fixture(fixtureRoot, fixture());
    expect(Object.isFrozen(first)).toBe(true); expect(second).toEqual(first); expect(second).not.toBe(first);
    valid.cases[0].id = 'mutated'; expect(first.cases[0].id).toBe('global-only');
    const vectors: Array<(value: any) => void> = [
      (value) => { value.extra = true; }, (value) => { value.cases[0].requiredSubObservations.push('extra'); },
      (value) => { value.cases[1] = value.cases[0]; }, (value) => { value.cases[1].requiredSubObservations = value.cases[0].requiredSubObservations; },
      (value) => { value.seeds[1] = value.seeds[0]; }, (value) => { value.seeds[0].path = '/absolute'; },
      (value) => { value.seeds[0].path = 'fs\\bad'; }, (value) => { value.seeds[0].path = 'fs/./bad'; },
      (value) => { value.seeds[0].path = ''; }, (value) => { value.seeds[0].path = 'fs/\u0000bad'; },
      (value) => { value.cases = [, ...value.cases]; }, (value) => { value.cases[0].requiredSubObservations[0] = NaN; },
      (value) => { value.cases[0].requiredSubObservations[0] = Infinity; }, (value) => { value.cases[0].requiredSubObservations[0] = -0; },
      (value) => { value.self = value; },
      (value) => { value.cases.push(value.cases[0]); }, (value) => { Object.setPrototypeOf(value, null); },
      (value) => { Object.defineProperty(value, 'hidden', { value: true }); }, (value) => { (value as any)[Symbol('hidden')] = true; },
    ];
    for (const change of vectors) { const value = fixture(); change(value); expect(() => validatePB03Fixture(fixtureRoot, value)).toThrow(); }
    expect(() => validatePB03Fixture(fixtureRoot, new Proxy(fixture(), { ownKeys() { throw new Error('proxy'); } }))).toThrow();
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true }); fs.appendFileSync(path.join(directory, fixture().seeds[0].path), 'changed');
    expect(() => validatePB03Fixture(directory, fixture())).toThrow();
  });

  it('binds seed declarations and bytes to the authoritative digest tuples', () => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true }); const value = fixture();
    fs.copyFileSync(path.join(directory, value.seeds[0].path), path.join(directory, value.seeds[1].path)); value.seeds[1].sha256 = value.seeds[0].sha256;
    expect(() => validatePB03Fixture(directory, value)).toThrow();
    const duplicate = fixture(); duplicate.seeds[1].sha256 = duplicate.seeds[0].sha256;
    expect(() => validatePB03Fixture(fixtureRoot, duplicate)).toThrow();
  });

  it('rejects a nonstandard captured array length descriptor', () => {
    const value = fixture();
    Object.defineProperty(value.cases, 'length', { writable: false });
    expect(() => validatePB03Fixture(fixtureRoot, value)).toThrow();
  });

  it('uses standard descriptors exactly once and never live gets', () => {
    let gets = 0; const reads = new Map<string, number>(), wrap = (value: any, name = 'root'): any => value && typeof value === 'object' ? new Proxy(value, {
      ownKeys: Reflect.ownKeys, getPrototypeOf: Reflect.getPrototypeOf,
      getOwnPropertyDescriptor(target, key) { const id = `${name}.${String(key)}`, count = (reads.get(id) ?? 0) + 1; reads.set(id, count); if (count > 1) throw new Error('reread'); const descriptor = Reflect.getOwnPropertyDescriptor(target, key); return descriptor && 'value' in descriptor ? { ...descriptor, value: wrap(descriptor.value, id) } : descriptor; },
      get() { gets += 1; throw new Error('live get'); },
    }) : value;
    expect(validatePB03Fixture(fixtureRoot, wrap(fixture()))).toEqual(fixture()); expect(gets).toBe(0); expect([...reads.values()].every((count) => count === 1)).toBe(true);
    for (const option of [{ writable: false }, { configurable: false }]) { const value = fixture(); Object.defineProperty(value, 'identity', { ...Object.getOwnPropertyDescriptor(value, 'identity')!, ...option }); expect(() => validatePB03Fixture(fixtureRoot, value)).toThrow(); }
  });
});
