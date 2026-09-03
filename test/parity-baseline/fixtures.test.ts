import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error JavaScript evidence helper is exercised directly by Vitest.
import { createEvidenceRef, readEvidence } from '../../scripts/parity-baseline/lib/evidence-store.mjs';
// @ts-expect-error PB-03 fixture authority is introduced by this work unit.
import * as fixtureDefinition from '../../scripts/parity-baseline/lib/fixture-definition.mjs';
const { validateFixtureManifest, validatePB03Fixture, validatePB04Fixture } = fixtureDefinition;

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
      ['PB-05', 'PB-05.json', '355e3775f64c6543fb6bce418ec0bac834a271087dcc82898eccf2ad11b5e02e'],
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

  it('pins the exact PB-05 fixture and staged history-seed tuple', () => {
    const fixture = read('PB-05.json'), seed = read('fs/pb-05/history-seed.json');
    expect(createHash('sha256').update(fixture).digest('hex')).toBe('355e3775f64c6543fb6bce418ec0bac834a271087dcc82898eccf2ad11b5e02e');
    expect(createHash('sha256').update(seed).digest('hex')).toBe('9e79da443d71b4080fac4e47a3b9bcfd79534bb48e1caa8eaf83782c96ae9e29');
    expect(JSON.parse(fixture)).toMatchObject({ schemaVersion: 1, identity: 'PB-05', fixtureId: 'pb-05-history-fixture-v1', cases: [
      { id: 'node-sqlite-crud', runtime: 'node-sqlite', seedPath: 'fs/pb-05/history-seed.json', seedId: 'pb-05-history-seed-v1' },
      { id: 'bun-sqlite-crud', runtime: 'bun-sqlite' }, { id: 'locked-database', runtime: 'node-sqlite' },
      { id: 'permission-denied', runtime: 'node-sqlite' },
    ] });
    expect(JSON.parse(seed)).toMatchObject({ schemaVersion: 1, seedId: 'pb-05-history-seed-v1', task: { id: 'pb05-task-1' } });
  });

  it('rejects a history-seed ID mutation through generic manifest validation', () => {
    const directory = root();
    fs.cpSync(fixtureRoot, directory, { recursive: true });
    const seedPath = path.join(directory, 'fs/pb-05/history-seed.json');
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    seed.seedId = 'pb-05-history-seed-mutated';
    fs.writeFileSync(seedPath, JSON.stringify(seed));
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    expect(() => validateFixtureManifest(directory, manifest)).toThrow('invalid PB-03 fixture');
  });

  it('keeps external anchors closure-private', () => {
    expect(Object.keys(fixtureDefinition).sort()).toEqual(['loadPB05Authority', 'validateFixtureManifest', 'validatePB03Fixture', 'validatePB04Fixture']);
  });

  it('freezes the exported PB-05 authority loader without changing its result', () => {
    expect(Object.isFrozen(fixtureDefinition.loadPB05Authority)).toBe(true);
    expect(fixtureDefinition.loadPB05Authority(fixtureRoot).fixture.identity).toBe('PB-05');
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

  const capturedAuthority = async (tag: string, configure: (saved: any) => void) => {
    const saved = { close: fs.closeSync, fstat: fs.fstatSync, lstat: fs.lstatSync, open: fs.openSync,
      read: fs.readFileSync, realpath: fs.realpathSync, native: fs.realpathSync.native, decode: TextDecoder.prototype.decode, parse: JSON.parse };
    try {
      configure(saved);
      const moduleUrl = new URL(`../../scripts/parity-baseline/lib/fixture-definition.mjs?${tag}`, import.meta.url).href;
      return await import(moduleUrl) as typeof fixtureDefinition;
    } finally {
      fs.closeSync = saved.close; fs.fstatSync = saved.fstat; (fs as { lstatSync: typeof fs.lstatSync }).lstatSync = saved.lstat;
      fs.openSync = saved.open; fs.readFileSync = saved.read; fs.realpathSync = saved.realpath; fs.realpathSync.native = saved.native;
      TextDecoder.prototype.decode = saved.decode; JSON.parse = saved.parse; vi.resetModules();
    }
  };

  it('reads and closes the three private PB-05 authority files in order with fresh frozen data', async () => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true });
    const reads: string[] = [], opened: Record<number, string> = {}; let closes = 0;
    const { loadPB05Authority } = await capturedAuthority('pb05-order', (saved) => {
      (fs as any).readFileSync = (fd: number) => { reads.push(path.relative(directory, opened[fd])); return saved.read(fd); };
      (fs as any).openSync = (file: string, flags: number) => {
        const fd = saved.open(file, flags); opened[fd] = file; return fd;
      }; (fs as any).closeSync = (fd: number) => { closes += 1; return saved.close(fd); };
    });
    const first = loadPB05Authority(directory), second = loadPB05Authority(directory);
    expect(first).not.toBe(second); expect(deeplyFrozen(first)).toBe(true);
    expect(reads).toEqual(['manifest.json', 'PB-05.json', 'fs/pb-05/history-seed.json', 'manifest.json', 'PB-05.json', 'fs/pb-05/history-seed.json']); expect(closes).toBe(6);
    expect(first.fixture).not.toBe(second.fixture); expect(first.seed).not.toBe(second.seed);
  });

  it('authenticates manifest bytes before decode, parse, or later authority reads', async () => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true });
    fs.appendFileSync(path.join(directory, 'manifest.json'), ' ');
    let manifestReads = 0, laterReads = 0, decodes = 0, parses = 0;
    const { loadPB05Authority } = await capturedAuthority('pb05-manifest-first', (saved) => {
      (fs as any).readFileSync = (fd: number) => {
        if (manifestReads === 0) manifestReads += 1; else laterReads += 1;
        return saved.read(fd);
      };
      TextDecoder.prototype.decode = function (...args: any[]) { decodes += 1; return saved.decode.apply(this, args); };
      JSON.parse = (...args: any[]) => { parses += 1; return saved.parse(...args); };
    });
    expect(() => loadPB05Authority(directory)).toThrow('invalid PB-03 fixture');
    expect({ manifestReads, laterReads, decodes, parses }).toEqual({
      manifestReads: 1, laterReads: 0, decodes: 0, parses: 0,
    });
  });

  it('rejects non-Buffer reader values without coercion and always closes', async () => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true });
    let hostile = false, closes = 0, coercions = 0;
    const poison = { toString() { coercions += 1; return 'bytes'; }, valueOf() { coercions += 1; return 'bytes'; } };
    const values = [() => 'not bytes', () => new Uint8Array([1]), () => poison, () => new Proxy(Buffer.from('{}'), {})];
    for (const create of values) {
      const { loadPB05Authority } = await capturedAuthority(`pb05-non-buffer-${closes}`, (saved) => {
        (fs as any).readFileSync = (fd: number) => hostile ? create() : saved.read(fd);
        (fs as any).closeSync = (fd: number) => { closes += 1; return saved.close(fd); };
      });
      expect(loadPB05Authority(directory).fixture.identity).toBe('PB-05'); hostile = true;
      expect(() => loadPB05Authority(directory)).toThrow('invalid PB-03 fixture'); hostile = false;
    }
    expect([coercions, closes]).toEqual([0, 16]);
  });

  it('copies reader buffers before close without own or prototype coercion', async () => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true }); let bytes: Buffer | undefined;
    const decoy = Buffer.from([0, 127, 128, 255]); let coercions = 0, ownPoison = true;
    const { loadPB05Authority } = await capturedAuthority('pb05-buffer-alias', (saved) => {
      (fs as any).readFileSync = (fd: number) => {
        bytes = saved.read(fd);
        if (ownPoison) Object.defineProperties(bytes, {
          valueOf: { value: () => { coercions += 1; return decoy; } },
          [Symbol.toPrimitive]: { value: () => { coercions += 1; return 'bytes'; } },
        });
        return bytes;
      };
      (fs as any).closeSync = (fd: number) => { const result = saved.close(fd); bytes?.fill(0); return result; };
    });
    expect(loadPB05Authority(directory).seed.seedId).toBe('pb-05-history-seed-v1');
    const savedValueOf = Buffer.prototype.valueOf, savedPrimitive = Buffer.prototype[Symbol.toPrimitive];
    try {
      ownPoison = false;
      Buffer.prototype.valueOf = () => { coercions += 1; return decoy; };
      Buffer.prototype[Symbol.toPrimitive] = () => { coercions += 1; return 'bytes'; };
      expect(loadPB05Authority(directory).seed.seedId).toBe('pb-05-history-seed-v1');
    } finally {
      Buffer.prototype.valueOf = savedValueOf;
      Buffer.prototype[Symbol.toPrimitive] = savedPrimitive;
    }
    expect(Array.from(decoy, (byte) => byte > 127 ? byte - 256 : byte)).toEqual([0, 127, -128, -1]);
    expect(coercions).toBe(0);
  });

  it.each([
    ['root replacement', 4], ['root replacement after manifest close', 4],
    ['pre-open file replacement', 5], ['post-read file replacement', 5],
  ])('rejects %s at its named identity seam and closes every opened descriptor', async (seam, expectedCloses) => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true });
    const opened: Record<number, string> = {}; let armed = false, reads = 0, closes = 0, seamHits = 0;
    const { loadPB05Authority } = await capturedAuthority(`pb05-${seam}`, (saved) => {
      (fs as any).openSync = (file: string, flags: number) => {
        if (armed && seam === 'pre-open file replacement' && file.endsWith('PB-05.json')) {
          seamHits += 1; fs.renameSync(file, `${file}.before`); fs.writeFileSync(file, '{}');
        }
        const fd = saved.open(file, flags); opened[fd] = file;
        if (armed && seam === 'root replacement' && seamHits === 0) {
          seamHits += 1; const previous = `${directory}.previous`; fs.renameSync(directory, previous);
          roots.push(previous); fs.cpSync(previous, directory, { recursive: true });
        }
        return fd;
      };
      (fs as any).readFileSync = (fd: number) => {
        const bytes = saved.read(fd);
        if (armed && seam === 'post-read file replacement' && ++reads === 2) {
          seamHits += 1; const asset = path.join(directory, 'PB-05.json'); fs.renameSync(asset, `${asset}.after`); fs.writeFileSync(asset, '{}');
        }
        return bytes;
      };
      (fs as any).closeSync = (fd: number) => {
        closes += 1; const result = saved.close(fd);
        if (armed && seam === 'root replacement after manifest close' && seamHits === 0
          && opened[fd].endsWith('manifest.json')) {
          seamHits += 1; const previous = `${directory}.previous`; fs.renameSync(directory, previous);
          roots.push(previous); fs.cpSync(previous, directory, { recursive: true });
        }
        return result;
      };
    });
    expect(loadPB05Authority(directory).fixture.identity).toBe('PB-05'); armed = true;
    expect(() => loadPB05Authority(directory)).toThrow('invalid PB-03 fixture');
    expect([seamHits, closes]).toEqual([1, expectedCloses]);
  });

  it('closes a descriptor when the captured close performs the real close then throws', async () => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true }); let armed = false, closes = 0;
    const { loadPB05Authority } = await capturedAuthority('pb05-close-throws', (saved) => {
      (fs as any).closeSync = (fd: number) => { closes += 1; const result = saved.close(fd); if (armed) throw new Error('after close'); return result; };
    });
    expect(loadPB05Authority(directory).fixture.identity).toBe('PB-05'); armed = true;
    expect(() => loadPB05Authority(directory)).toThrow('invalid PB-03 fixture'); expect(closes).toBe(4);
  });

  it.each([
    ['symlink', (asset: string) => { fs.renameSync(asset, `${asset}.real`); fs.symlinkSync('PB-05.json.real', asset); }],
    ['directory', (asset: string) => { fs.renameSync(asset, `${asset}.real`); fs.mkdirSync(asset); }],
  ])('rejects a non-regular PB-05 authority %s after a valid precursor', (_label, mutate) => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true });
    const asset = path.join(directory, 'PB-05.json'), manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    expect(validateFixtureManifest(directory, manifest)).toEqual(manifest); mutate(asset);
    expect(() => validateFixtureManifest(directory, manifest)).toThrow('invalid PB-03 fixture');
  });

  it.each([
    ['the history seed leaf', (directory: string) => {
      const asset = path.join(directory, 'fs/pb-05/history-seed.json');
      fs.renameSync(asset, `${asset}.real`);
      fs.symlinkSync('history-seed.json.real', asset);
    }],
    ['the history seed intermediate directory', (directory: string) => {
      const asset = path.join(directory, 'fs/pb-05');
      fs.renameSync(asset, `${asset}.real`);
      fs.symlinkSync('pb-05.real', asset);
    }],
    ['the lexical fixture root', (directory: string) => {
      const real = `${directory}.real`;
      fs.renameSync(directory, real);
      roots.push(real);
      fs.symlinkSync(real, directory);
    }],
  ])('rejects a PB-05 authority symlink at %s', (_label, mutate) => {
    const directory = root();
    fs.cpSync(fixtureRoot, directory, { recursive: true });
    mutate(directory);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    expect(() => validateFixtureManifest(directory, manifest)).toThrow('invalid PB-03 fixture');
  });

  it('runs the PB-05 loader through hostile captured-boundary replacements', async () => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true });
    const moduleUrl = new URL('../../scripts/parity-baseline/lib/fixture-definition.mjs?pb05-captures', import.meta.url).href;
    const { loadPB05Authority: captured } = await import(moduleUrl), hash = createHash('sha256'); let result: any;
    const saved = {
      close: fs.closeSync, fstat: fs.fstatSync, lstat: fs.lstatSync, open: fs.openSync,
      read: fs.readFileSync, realpath: fs.realpathSync, join: path.join, resolve: path.resolve,
      absolute: path.isAbsolute, bufferAllocate: Buffer.allocUnsafe, bufferIsBuffer: Buffer.isBuffer,
      typedSet: Uint8Array.prototype.set, decode: TextDecoder.prototype.decode,
      starts: String.prototype.startsWith, directory: fs.Stats.prototype.isDirectory,
      file: fs.Stats.prototype.isFile, link: fs.Stats.prototype.isSymbolicLink, parse: JSON.parse,
      keys: Object.keys, freeze: Object.freeze, apply: Reflect.apply,
      update: Object.getPrototypeOf(hash).update, digest: Object.getPrototypeOf(hash).digest,
    };
    try {
      const replaced = [[fs, 'closeSync'], [fs, 'fstatSync'], [fs, 'lstatSync'], [fs, 'openSync'], [fs, 'readFileSync'],
        [fs, 'realpathSync'], [path, 'join'], [path, 'resolve'], [path, 'isAbsolute']] as const;
      for (const [owner, name] of replaced) (owner as any)[name] = () => { throw new Error(name); };
      TextDecoder.prototype.decode = () => { throw new Error('replaced'); }; JSON.parse = () => { throw new Error('replaced'); };
      String.prototype.startsWith = () => { throw new Error('replaced'); };
      Buffer.allocUnsafe = (size: number) => saved.bufferAllocate(size);
      Buffer.isBuffer = (_value: unknown): _value is Buffer => { throw new Error('replaced'); }; Uint8Array.prototype.set = () => { throw new Error('replaced'); };
      Object.keys = () => { throw new Error('replaced'); }; Object.freeze = () => { throw new Error('replaced'); };
      Reflect.apply = () => { throw new Error('replaced'); }; Object.getPrototypeOf(hash).update = () => { throw new Error('replaced'); };
      Object.getPrototypeOf(hash).digest = () => { throw new Error('replaced'); }; fs.Stats.prototype.isDirectory = () => { throw new Error('replaced'); };
      fs.Stats.prototype.isFile = () => { throw new Error('replaced'); }; fs.Stats.prototype.isSymbolicLink = () => { throw new Error('replaced'); }; result = captured(directory);
    } finally {
      fs.closeSync = saved.close; fs.fstatSync = saved.fstat; (fs as { lstatSync: typeof fs.lstatSync }).lstatSync = saved.lstat; fs.openSync = saved.open;
      fs.readFileSync = saved.read; fs.realpathSync = saved.realpath; path.join = saved.join; path.resolve = saved.resolve;
      path.isAbsolute = saved.absolute; Buffer.allocUnsafe = saved.bufferAllocate; Buffer.isBuffer = saved.bufferIsBuffer;
      Uint8Array.prototype.set = saved.typedSet; TextDecoder.prototype.decode = saved.decode; JSON.parse = saved.parse;
      String.prototype.startsWith = saved.starts; Object.keys = saved.keys; Object.freeze = saved.freeze;
      Reflect.apply = saved.apply; Object.getPrototypeOf(hash).update = saved.update; Object.getPrototypeOf(hash).digest = saved.digest;
      fs.Stats.prototype.isDirectory = saved.directory; fs.Stats.prototype.isFile = saved.file; fs.Stats.prototype.isSymbolicLink = saved.link; vi.resetModules();
    }
    expect(result.fixture.identity).toBe('PB-05'); expect(result.seed.seedId).toBe('pb-05-history-seed-v1');
  });

  it('authenticates fatal PB-05 bytes before attempting a second decode or parse', async () => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true });
    fs.appendFileSync(path.join(directory, 'PB-05.json'), Buffer.from([0xff])); let decodes = 0, parses = 0;
    const { validateFixtureManifest: validate } = await capturedAuthority('pb05-fatal-first', (saved) => {
      TextDecoder.prototype.decode = function (...args: any[]) { decodes += 1; return saved.decode.apply(this, args); };
      JSON.parse = (...args: any[]) => { parses += 1; return saved.parse(...args); };
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    expect(() => validate(directory, manifest)).toThrow('invalid PB-03 fixture'); expect([decodes, parses]).toEqual([1, 1]);
  });

  it('rejects PB-05 realpath escape before its open', async () => {
    const directory = root(), outside = root(), asset = path.join(directory, 'PB-05.json'); fs.cpSync(fixtureRoot, directory, { recursive: true });
    let armed = false, hits = 0, opens = 0;
    const { loadPB05Authority } = await capturedAuthority('pb05-realpath-escape', (saved) => {
      (fs.realpathSync as any).native = (file: string) => armed && file === asset ? (hits += 1, outside) : saved.native(file);
      (fs as any).openSync = (...args: any[]) => { opens += 1; return saved.open(...args); };
    });
    expect(fs.lstatSync(asset).isFile()).toBe(true); expect(loadPB05Authority(directory).fixture.identity).toBe('PB-05'); armed = true;
    expect(() => loadPB05Authority(directory)).toThrow('invalid PB-03 fixture'); expect([hits, opens]).toEqual([1, 4]);
  });

  it('rejects duplicate coordinated PB-05 and seed bytes through private digests', () => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true });
    const fixture = path.join(directory, 'PB-05.json');
    const seed = path.join(directory, 'fs/pb-05/history-seed.json');
    fs.copyFileSync(seed, fixture); fs.copyFileSync(fixture, seed);
    expect(() => fixtureDefinition.loadPB05Authority(directory)).toThrow('invalid PB-03 fixture');
  });

  it('rejects coordinated PB-05 bytes and manifest digest substitution against external anchors', () => {
    const directory = root();
    fs.cpSync(fixtureRoot, directory, { recursive: true });
    fs.appendFileSync(path.join(directory, 'PB-05.json'), ' ');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    manifest.fixtures[4].sha256 = createHash('sha256').update(fs.readFileSync(path.join(directory, 'PB-05.json'))).digest('hex');
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    expect(() => validateFixtureManifest(directory, manifest)).toThrow('invalid PB-03 fixture');
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

describe('PB-04 semantic fixture authority', () => {
  const fixtureRoot = path.resolve(import.meta.dirname, '../../evidence/parity-baseline/fixtures');
  const fixture = (directory = fixtureRoot) =>
    JSON.parse(fs.readFileSync(path.join(directory, 'PB-04.json'), 'utf8'));
  const seed = (directory: string, index: number) =>
    JSON.parse(fs.readFileSync(path.join(directory, fixture(directory).cases[index].eventSeedPath), 'utf8'));
  const write = (directory: string, value: any) =>
    fs.writeFileSync(path.join(directory, 'PB-04.json'), JSON.stringify(value));
  const precursor = () => {
    const directory = root();
    fs.cpSync(fixtureRoot, directory, { recursive: true });
    const value = fixture(directory);
    expect(validatePB04Fixture(directory, value)).toEqual(value);
    return { directory, value };
  };

  it('rejects a cyclic fresh fixture precursor before schema validation', () => {
    const { directory, value } = precursor();
    (value.cases[0] as any).cycle = value;
    expect(() => validatePB04Fixture(directory, value)).toThrow('invalid PB-04 fixture: schema');
  });

  it('accepts independent deeply frozen snapshots without aliases', () => {
    const input = fixture();
    const first = validatePB04Fixture(fixtureRoot, input);
    const second = validatePB04Fixture(fixtureRoot, fixture());
    expect(first).toEqual(input);
    expect(Object.isFrozen(first.cases)).toBe(true);
    expect(Object.isFrozen(first.cases[0].tasks)).toBe(true);
    expect(Object.isFrozen(first.cases[0].tasks[0])).toBe(true);
    expect(second).not.toBe(first);
    input.cases[0].tasks[0].taskId = 'changed';
    expect(first.cases[0].tasks[0].taskId).toBe('sf-task-1');
  });

  it.each([
    ['schema', ({ directory }: any) => {
      const value = seed(directory, 0);
      value.events[0] = { nope: true };
      fs.writeFileSync(path.join(directory, 'events/pb-04/single-foreground.json'), JSON.stringify(value));
    }],
    ['task', ({ value, directory }: any) => {
      value.cases[3].tasks[1].owner = 'foreground-parent';
      write(directory, value);
    }],
    ['task', ({ value, directory }: any) => {
      value.cases[0].tasks[0] = { extra: true, ...value.cases[0].tasks[0] };
      write(directory, value);
    }],
    ['cardinality', ({ directory }: any) => {
      const value = seed(directory, 1);
      value.events.find((event: any) => event.eventId === 'ser-q2').kind = 'task.running';
      fs.writeFileSync(path.join(directory, 'events/pb-04/serial-foreground.json'), JSON.stringify(value));
    }],
    ['timing', ({ directory }: any) => {
      const value = seed(directory, 1);
      const first = value.events.find((event: any) => event.eventId === 'ser-r1');
      const second = value.events.find((event: any) => event.eventId === 'ser-r2');
      [first.taskId, second.taskId] = [second.taskId, first.taskId];
      [first.attemptId, second.attemptId] = [second.attemptId, first.attemptId];
      fs.writeFileSync(path.join(directory, 'events/pb-04/serial-foreground.json'), JSON.stringify(value));
    }],
    ['event', ({ directory }: any) => {
      const value = seed(directory, 0);
      value.events[0].eventId = 'sf-wrong';
      fs.writeFileSync(path.join(directory, 'events/pb-04/single-foreground.json'), JSON.stringify(value));
    }],
    ['result', ({ directory }: any) => {
      const value = seed(directory, 1);
      value.events.find((event: any) => event.eventId === 'ser-result1').value = 42;
      fs.writeFileSync(path.join(directory, 'events/pb-04/serial-foreground.json'), JSON.stringify(value));
    }],
    ['projection', ({ directory }: any) => {
      const value = seed(directory, 2);
      const event = value.events.find((item: any) => item.eventId === 'bc-d1');
      event.taskId = 'bc-task-2';
      event.attemptId = 'bc-attempt-2';
      fs.writeFileSync(path.join(directory, 'events/pb-04/bounded-concurrency.json'), JSON.stringify(value));
    }],
    ['result', ({ directory }: any) => {
      const value = seed(directory, 3);
      value.events.find((event: any) => event.eventId === 'mb-h2').resultId = 'mb-result-2';
      fs.writeFileSync(path.join(directory, 'events/pb-04/mixed-background.json'), JSON.stringify(value));
    }],
    ['concurrency', ({ directory }: any) => {
      const value = seed(directory, 2);
      value.events.find((event: any) => event.eventId === 'bc-c2').activeAttemptIds.reverse();
      fs.writeFileSync(path.join(directory, 'events/pb-04/bounded-concurrency.json'), JSON.stringify(value));
    }],
  ])('rejects %s after proving an isolated valid precursor', (reason, mutate) => {
    const state = precursor();
    mutate(state);
    expect(() => validatePB04Fixture(state.directory, fixture(state.directory)))
      .toThrow(`invalid PB-04 fixture: ${reason}`);
  });

  it('rejects a semantically valid coordinated substitution only at external authority', () => {
    const { directory, value } = precursor();
    const eventPath = value.cases[0].eventSeedPath;
    fs.appendFileSync(path.join(directory, eventPath), ' ');
    value.cases[0].eventSeedDigest = createHash('sha256')
      .update(fs.readFileSync(path.join(directory, eventPath)))
      .digest('hex');
    write(directory, value);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    manifest.eventSeeds[0].sha256 = value.cases[0].eventSeedDigest;
    manifest.fixtures[3].sha256 = createHash('sha256')
      .update(fs.readFileSync(path.join(directory, 'PB-04.json')))
      .digest('hex');
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    expect(() => validatePB04Fixture(directory, fixture(directory)))
      .toThrow('invalid PB-04 fixture: authority');
  });

  it('accepts a transparent one-ownKeys/one-descriptor/zero-get Proxy', () => {
    let gets = 0;
    const reads = new Map<string, number>();
    const keys = new Map<string, number>();
    const wrap = (value: any, name = 'root'): any => value && typeof value === 'object'
      ? new Proxy(value, {
        ownKeys(target) {
          keys.set(name, (keys.get(name) ?? 0) + 1);
          return Reflect.ownKeys(target);
        },
        getPrototypeOf: Reflect.getPrototypeOf,
        getOwnPropertyDescriptor(target, key) {
          const id = `${name}.${String(key)}`;
          const count = (reads.get(id) ?? 0) + 1;
          reads.set(id, count);
          if (count > 1) throw new Error('reread');
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          return descriptor && 'value' in descriptor
            ? { ...descriptor, value: wrap(descriptor.value, id) }
            : descriptor;
        },
        get() {
          gets += 1;
          throw new Error('live get');
        },
      })
      : value;
    expect(validatePB04Fixture(fixtureRoot, wrap(fixture()))).toEqual(fixture());
    expect(gets).toBe(0);
    expect([...keys.values()].every((count) => count === 1)).toBe(true);
    expect([...reads.values()].every((count) => count === 1)).toBe(true);
  });

  it.each([
    ['extra top-level key', (value: any) => value.extra = true, 'schema'],
    ['missing top-level key', (value: any) => delete value.identity, 'schema'],
    ['reordered top-level keys', (value: any) => { delete value.identity; value.identity = 'PB-04'; }, 'schema'],
    ['extra nested task key', (value: any) => value.cases[0].tasks[0].extra = true, 'task'],
    ['missing nested case key', (value: any) => delete value.cases[0].mode, 'task'],
    ['reordered nested case keys', (value: any) => { const item = value.cases[0]; delete item.id; item.id = 'single-foreground'; }, 'task'],
    ['missing nested task key', (value: any) => delete value.cases[0].tasks[0].owner, 'task'],
    ['reordered nested task keys', (value: any) => { const item = value.cases[0].tasks[0]; delete item.taskId; item.taskId = 'sf-task-1'; }, 'task'],
    ['shared nested task', (value: any) => value.cases[0].tasks.push(value.cases[0].tasks[0]), 'schema'],
    ['sparse cases', (value: any) => { value.cases = [, ...value.cases]; }, 'schema'],
    ['function value', (value: any) => value.identity = () => 'PB-04', 'schema'],
    ['symbol value', (value: any) => value.identity = Symbol('PB-04'), 'schema'],
    ['nonfinite value', (value: any) => value.schemaVersion = Infinity, 'schema'],
    ['negative zero', (value: any) => value.schemaVersion = -0, 'schema'],
    ['custom prototype', (value: any) => Object.setPrototypeOf(value.cases[0], null), 'schema'],
    ['nonenumerable descriptor', (value: any) => Object.defineProperty(value, 'identity', { enumerable: false }), 'schema'],
    ['nonwritable descriptor', (value: any) => Object.defineProperty(value, 'identity', { writable: false }), 'schema'],
    ['nonconfigurable descriptor', (value: any) => Object.defineProperty(value, 'identity', { configurable: false }), 'schema'],
  ])('rejects %s from a fresh valid precursor', (_label, mutate, reason) => {
    const { directory, value } = precursor();
    mutate(value);
    expect(() => validatePB04Fixture(directory, value)).toThrow(`invalid PB-04 fixture: ${reason}`);
  });

  it('rejects accessors without invoking their getter', () => {
    const { directory, value } = precursor();
    let calls = 0;
    Object.defineProperty(value, 'identity', { enumerable: true, get() { calls += 1; return 'PB-04'; } });
    expect(() => validatePB04Fixture(directory, value)).toThrow('invalid PB-04 fixture: schema');
    expect(calls).toBe(0);
  });

  const own = (target: object, key: PropertyKey) => Reflect.getOwnPropertyDescriptor(target, key);
  const nested = (value: any, handler: ProxyHandler<object>, task = false) => {
    const parent = task ? value.cases[0].tasks : value.cases;
    parent[0] = new Proxy(parent[0], handler);
    return value;
  };
  it.each([
    ['ownKeys throw', (value: any) => nested(value, { ownKeys() { throw new Error('keys'); } }), 'schema'],
    ['descriptor throw', (value: any) => nested(value, { getOwnPropertyDescriptor() { throw new Error('descriptor'); } }), 'schema'],
    ['reordered case keys', (value: any) => nested(value, { ownKeys: (target) => Reflect.ownKeys(target).reverse() }), 'task'],
    ['incomplete case keys', (value: any) => nested(value, { ownKeys: (target) => Reflect.ownKeys(target).filter((key) => key !== 'mode') }), 'task'],
    ['incomplete task descriptor', (value: any) => nested(value, { getOwnPropertyDescriptor: (target, key) => key === 'owner' ? undefined : own(target, key) }, true), 'schema'],
    ['nonstandard task data descriptor', (value: any) => nested(value, {
      getOwnPropertyDescriptor: (target, key) => key === 'owner'
        ? { ...own(target, key)!, writable: false } : own(target, key),
    }, true), 'schema'],
    ['task descriptor substitution', (value: any) => nested(value, {
      getOwnPropertyDescriptor: (target, key) => key === 'taskId'
        ? { ...own(target, key)!, value: 'wrong' } : own(target, key),
    }, true), 'task'],
    ['capture mutation with invalid data', (value: any) => nested(value, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'id') (target as any).mode = 'background';
        return own(target, key);
      },
    }), 'task'],
  ])('rejects nested Proxy %s from a fresh valid precursor', (_label, wrap, reason) => {
    const { directory, value } = precursor();
    expect(() => validatePB04Fixture(directory, wrap(value))).toThrow(`invalid PB-04 fixture: ${reason}`);
  });

  it('rejects nested Proxy accessor descriptors without invoking their getter', () => {
    const { directory, value } = precursor(); let calls = 0;
    const input = nested(value, { getOwnPropertyDescriptor(target, key) {
      return key === 'owner' ? { enumerable: true, configurable: true, get() { calls += 1; return 'foreground-parent'; } } : own(target, key);
    } }, true);
    expect(() => validatePB04Fixture(directory, input)).toThrow('invalid PB-04 fixture: schema');
    expect(calls).toBe(0);
  });

  it('rejects root Proxy descriptor substitution separately', () => {
    const { directory, value } = precursor();
    const input = new Proxy(value, { getOwnPropertyDescriptor: (target, key) => key === 'identity'
      ? { ...own(target, key)!, value: 'wrong' } : own(target, key) });
    expect(() => validatePB04Fixture(directory, input)).toThrow('invalid PB-04 fixture: schema');
  });

  it('uses the already-captured Proxy snapshot, not second-read detection', () => {
    const { directory, value } = precursor();
    const input = new Proxy(value, { getOwnPropertyDescriptor(target, key) {
      if (key === 'normalizationId') (target as any).identity = 'mutated-after-capture';
      return own(target, key);
    } });
    const accepted = validatePB04Fixture(directory, input);
    expect(value.identity).toBe('mutated-after-capture');
    expect(accepted.identity).toBe('PB-04');
  });

  it('uses exactly one captured read for each PB-04 authority path', async () => {
    const directory = root(); fs.cpSync(fixtureRoot, directory, { recursive: true });
    const input = fixture(directory); const original = fs.readFileSync; const reads = new Map<string, number>();
    try {
      (fs as any).readFileSync = ((file: fs.PathOrFileDescriptor, ...args: any[]) => {
        const bytes = original(file, ...args); const name = String(file);
        reads.set(name, (reads.get(name) ?? 0) + 1);
        if (name.endsWith('PB-04.json')) fs.appendFileSync(name, ' ');
        return bytes;
      }) as typeof fs.readFileSync;
      vi.resetModules();
      const moduleUrl = new URL('../../scripts/parity-baseline/lib/fixture-definition.mjs?captured-read', import.meta.url).href;
      const { validatePB04Fixture: captured } = await import(moduleUrl);
      (fs as any).readFileSync = () => { throw new Error('reread'); };
      expect(captured(directory, input)).toEqual(input);
      expect([...reads.keys()].map((file) => path.relative(directory, file))).toEqual([
        'manifest.json', 'PB-04.json',
        'events/pb-04/single-foreground.json', 'events/pb-04/serial-foreground.json',
        'events/pb-04/bounded-concurrency.json', 'events/pb-04/mixed-background.json',
      ]);
      expect([...reads.values()]).toEqual([1, 1, 1, 1, 1, 1]);
    } finally { (fs as any).readFileSync = original; vi.resetModules(); }
  });

  it('copies an accepted Proxy snapshot without retaining its source graph', () => {
    const input = fixture();
    const accepted = validatePB04Fixture(fixtureRoot, new Proxy(input, {
      ownKeys: Reflect.ownKeys,
      getOwnPropertyDescriptor: Reflect.getOwnPropertyDescriptor,
      get() { throw new Error('ordinary get'); },
    }));
    input.cases[0].tasks[0].taskId = 'mutated-after-capture';
    expect(accepted.cases[0].tasks[0].taskId).toBe('sf-task-1');
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
