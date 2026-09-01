import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript harness has no declaration file.
import { createContaminationGuard } from '../../scripts/parity-baseline/lib/contamination.mjs';

const repositoryRoot = '/repo';
const canonicalize = (value: string) => value.replace('/alias', '/repo');
const config = (snapshot: (policy?: unknown) => ReturnType<typeof raw> = () => raw()) => ({ repositoryRoot, protectedRoots: ['/repo/package'], excludedRoots: ['/repo/package/cache'], externalRoots: ['/external'], canonicalize, snapshot });
const raw = () => ({ git: { status: 'clean', index: 'index', refs: 'refs' }, protected: [{ path: '/repo/package/a', kind: 'file', digest: 'a'.repeat(64), mode: '0644' }, { path: '/repo/package/cache/x', kind: 'file', digest: 'b'.repeat(64), mode: '0600' }], externalRoots: [{ path: '/external', state: 'ready' }], processes: [{ id: 'p2', state: 'done', cwd: '/external', command: 'node' }, { id: 'p1', state: 'done', cwd: '/external', command: 'node' }], network: [{ target: 'b', channel: 'http', endpoint: 'https://b' }, { target: 'a', channel: 'http', endpoint: 'https://a' }] });
const bad = (value: unknown) => expect(() => createContaminationGuard(value as never)).toThrow('invalid contamination policy');

describe('contamination snapshot guard', () => {
  it('RED: captures a canonical immutable snapshot through captured seams', () => {
    let calls = 0; const source = raw(); const guard = createContaminationGuard(config(() => { calls += 1; return source; }));
    const result = guard.capture();
    expect(calls).toBe(1); expect(result.protected).toEqual([{ path: '/repo/package/a', kind: 'file', digest: 'a'.repeat(64), mode: '0644' }]);
    expect(result.processes.map((entry: { id: string }) => entry.id)).toEqual(['p1', 'p2']); expect(result.network.map((entry: { target: string }) => entry.target)).toEqual(['a', 'b']);
    source.git.status = 'dirty'; source.protected[0].path = '/changed'; expect(result.git.status).toBe('clean'); expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.protected[0])).toBe(true); expect(Object.isFrozen(guard.capture)).toBe(true); expect(Object.isFrozen(guard)).toBe(true);
  });

  it('rejects malformed config, roots, exclusions, and captured seams', () => {
    bad({ ...config(), extra: true }); bad({ ...config(), repositoryRoot: 'repo' }); bad({ ...config(), protectedRoots: ['/repo/package', '/repo/package/a'] }); bad({ ...config(), externalRoots: ['/repo'] });
    bad({ ...config(), excludedRoots: ['/repo/package'] }); bad({ ...config(), excludedRoots: ['/repo/other'] }); bad({ ...config(), excludedRoots: ['/repo/package/cache', '/repo/package/cache/a'] });
    bad({ ...config(), protectedRoots: ['/repo/package', '/repo/package-alias'], canonicalize: (value: string) => value === '/repo/package-alias' ? '/repo/package' : value }); bad({ ...config(), canonicalize: () => 'bad' }); bad({ ...config(), canonicalize: () => { throw new Error('x'); } });
    const inherited = Object.create(config()); bad(inherited); const descriptor = config(); Object.defineProperty(descriptor, 'snapshot', { enumerable: true, configurable: true, get: () => raw() }); bad(descriptor);
  });

  it('rejects every malformed raw branch and aliases escaping exclusions', () => {
    const cases = [
      { ...raw(), git: { status: 'x', index: 'x', refs: 'x', extra: true } }, { ...raw(), protected: [{ path: '/repo/other', kind: 'file', digest: 'a'.repeat(64), mode: '0644' }] },
      { ...raw(), protected: [{ path: '/repo/alias/package/cache/x', kind: 'file', digest: 'a'.repeat(64), mode: '0644' }] }, { ...raw(), protected: [{ path: '/repo/package/a', kind: 'bad', digest: 'a'.repeat(64), mode: '0644' }] },
      { ...raw(), protected: [{ path: '/repo/package/a', kind: 'file', digest: 'A'.repeat(64), mode: '644' }] }, { ...raw(), externalRoots: [] }, { ...raw(), externalRoots: [{ path: '/external', state: 'x' }, { path: '/external', state: 'y' }] },
      { ...raw(), processes: [{ id: 'p', state: 'x', cwd: '/repo', command: 'x' }] }, { ...raw(), network: [{ target: 'a\0', channel: 'x', endpoint: 'x' }] },
    ];
    for (const value of cases) expect(() => createContaminationGuard(config(() => value)).capture()).toThrow('invalid contamination snapshot');
  });

  it('triangulates descriptor, control, ownership, duplicate, and immutable policy branches', () => {
    const sparse = raw(); sparse.protected = new Array(1) as never; const readonly = raw(); Object.defineProperty(readonly.network, 'length', { writable: false });
    const accessor = raw(); Object.defineProperty(accessor.git, 'status', { enumerable: true, configurable: true, get: () => 'x' });
    const vectors = [sparse, readonly, accessor, { ...raw(), git: { status: 'x\x7f', index: 'x', refs: 'x' } }, { ...raw(), protected: [raw().protected[0], { ...raw().protected[0] }] }, { ...raw(), processes: [{ id: 'p', state: 'x', cwd: '/external', command: 'x' }, { id: 'p', state: 'y', cwd: '/external', command: 'y' }] }];
    for (const value of vectors) expect(() => createContaminationGuard(config(() => value)).capture()).toThrow('invalid contamination snapshot');
    const policy = config((received: unknown) => { expect(Object.isFrozen(received)).toBe(true); return raw(); }); const guard = createContaminationGuard(policy); policy.externalRoots[0] = '/changed'; expect(guard.capture().externalRoots[0].path).toBe('/external');
    bad({ ...config(), repositoryRoot: '/repo/*' }); bad({ ...config(), excludedRoots: ['/repo/package/cache\0'] });
  });

  it('uses independent captured policy and guards deterministically', () => {
    const first = config(); const one = createContaminationGuard(first); first.protectedRoots[0] = '/wrong'; first.snapshot = () => { throw new Error('wrong'); };
    expect(one.capture()).toEqual(one.capture()); const two = createContaminationGuard(config()); expect(two.capture()).toEqual(one.capture()); expect(two).not.toBe(one);
  });

  it('preserves raw input and resolves every capture path once by physical identity', () => {
    const source = raw(); const before = structuredClone(source); const calls = new Map<string, number>();
    const resolve = (value: string) => { calls.set(value, (calls.get(value) ?? 0) + 1); return value.replace('/alias', '/repo'); };
    const guard = createContaminationGuard({ ...config(() => source), canonicalize: resolve });
    expect(guard.capture()).toEqual(guard.capture()); expect(source).toEqual(before); expect(calls.get('/repo/package/a')).toBe(2);
    const hostile = raw(); const pristine = structuredClone(hostile); const malformed = createContaminationGuard({ ...config(() => hostile), canonicalize: (value: string) => value === '/repo/package/a' ? '/bad/../path' : value });
    expect(() => malformed.capture()).toThrow('invalid contamination snapshot'); expect(hostile).toEqual(pristine);
    let statefulCalls = 0; const stateful = createContaminationGuard({ ...config(), canonicalize: (value: string) => value === '/repo/package/a' && statefulCalls++ ? (() => { throw new Error('second use'); })() : value });
    expect(stateful.capture().protected).toHaveLength(1); expect(statefulCalls).toBe(1);
    const throwing = createContaminationGuard({ ...config(), canonicalize: (value: string) => value === '/repo/package/a' ? (() => { throw new Error('capture seam'); })() : value });
    expect(() => throwing.capture()).toThrow('invalid contamination snapshot');
  });

  it('rejects physical aliases and process ownership escapes without mutating rejected raw values', () => {
    const duplicate = raw(); duplicate.protected = [{ ...duplicate.protected[0] }, { ...duplicate.protected[0], path: '/repo/alias/package/a' }]; const duplicateBefore = structuredClone(duplicate);
    const aliases = (value: string) => value.replace('/repo/alias', '/repo');
    expect(() => createContaminationGuard({ ...config(() => duplicate), canonicalize: aliases }).capture()).toThrow('invalid contamination snapshot'); expect(duplicate).toEqual(duplicateBefore);
    const external = raw(); external.externalRoots = [{ path: '/external/alias', state: 'ready' }]; const escaped = raw(); escaped.processes[0].cwd = '/external/alias';
    const map = (value: string) => value === '/external/alias' ? '/repo' : value;
    expect(() => createContaminationGuard({ ...config(() => external), canonicalize: map }).capture()).toThrow('invalid contamination snapshot');
    expect(() => createContaminationGuard({ ...config(() => escaped), canonicalize: map }).capture()).toThrow('invalid contamination snapshot');
  });

  it('uses code-unit ordering and rejects hostile descriptors with fresh valid precursors', () => {
    const ordered = raw(); ordered.network = [{ target: 'é', channel: 'x', endpoint: 'x' }, { target: 'é', channel: 'x', endpoint: 'x' }];
    const reversed = raw(); reversed.network = [...ordered.network].reverse();
    expect(createContaminationGuard(config(() => ordered)).capture().network).toEqual(createContaminationGuard(config(() => reversed)).capture().network);
    for (const mutate of [
      (value: ReturnType<typeof raw>) => Object.defineProperty(value.protected, '0', { enumerable: true, configurable: true, get: () => value.protected[0] }),
      (value: ReturnType<typeof raw>) => Object.defineProperty(value.externalRoots[0], Symbol('x'), { value: true }),
      (value: ReturnType<typeof raw>) => Object.setPrototypeOf(value.processes[0], null),
      (value: ReturnType<typeof raw>) => Object.preventExtensions(value.network[0]),
      (value: ReturnType<typeof raw>) => Object.defineProperty(value.protected[0], 'mode', { value: '0644', enumerable: false, configurable: true, writable: true }),
    ]) { const value = raw(); mutate(value); expect(() => createContaminationGuard(config(() => value)).capture()).toThrow('invalid contamination snapshot'); }
  });
});
