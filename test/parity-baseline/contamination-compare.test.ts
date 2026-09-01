import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript harness has no declaration file.
import { createContaminationGuard } from '../../scripts/parity-baseline/lib/contamination.mjs';

type Raw = {
  git: { status: string; index: string; refs: string };
  protected: Array<{ path: string; kind: string; digest: string; mode: string }>;
  externalRoots: Array<{ path: string; state: string }>;
  processes: Array<{ id: string; state: string; cwd: string; command: string }>;
  network: Array<{ target: string; channel: string; endpoint: string }>;
};

const digest = (letter: string) => letter.repeat(64);
const raw = (patch: Partial<Raw> = {}): Raw => ({
  git: { status: 'clean', index: 'index', refs: 'refs' },
  protected: [{ path: '/repo/package/a', kind: 'file', digest: digest('a'), mode: '0644' }],
  externalRoots: [{ path: '/external', state: 'ready' }],
  processes: [{ id: 'p', state: 'done', cwd: '/external', command: 'node' }],
  network: [{ target: 'target', channel: 'http', endpoint: 'https://one' }],
  ...patch,
});
const guard = (values: Raw[]) => {
  let index = 0;
  return createContaminationGuard({
    repositoryRoot: '/repo', protectedRoots: ['/repo/package'], excludedRoots: ['/repo/package/cache'], externalRoots: ['/external'],
    canonicalize: (value: string) => value, snapshot: () => values[index++]!,
  });
};
const captures = (before: Raw, after: Raw) => {
  const instance = guard([before, after]);
  return { instance, before: instance.capture(), after: instance.capture() };
};
const difference = (area: string, key: string, change: string, before: unknown, after: unknown) => ({ area, key, change, before, after });

describe('contamination comparison guard', () => {
  it('RED: returns clean fresh immutable reports for equivalent captures and ignored cache-only changes', () => {
    const first = raw({ protected: [...raw().protected, { path: '/repo/package/cache/a', kind: 'file', digest: digest('b'), mode: '0600' }] });
    const second = raw({ protected: [{ path: '/repo/package/cache/a', kind: 'directory', digest: digest('c'), mode: '0755' }, raw().protected[0]!], processes: [...raw().processes], network: [...raw().network] });
    const { instance, before, after } = captures(first, second);
    const one = instance.compare(before, after); const two = instance.compare(before, after);
    expect(one).toEqual({ clean: true, differences: [] }); expect(two).toEqual(one); expect(two).not.toBe(one);
    expect(Object.isFrozen(instance.compare)).toBe(true); expect(Object.isFrozen(one)).toBe(true); expect(Object.isFrozen(one.differences)).toBe(true);
    expect(() => { (one as { clean: boolean }).clean = false; }).toThrow(); expect(() => { (one.differences as unknown[]).push({}); }).toThrow(); expect(() => { (before.git as { status: string }).status = 'dirty'; }).toThrow(); expect(one.clean).toBe(true);
  });

  it('reports each Git primitive independently with exact null-free changed records', () => {
    for (const field of ['status', 'index', 'refs'] as const) {
      const next = raw({ git: { ...raw().git, [field]: `next-${field}` } }); const { instance, before, after } = captures(raw(), next);
      expect(instance.compare(before, after)).toEqual({ clean: false, differences: [difference('git', field, 'changed', raw().git[field], next.git[field])] });
    }
  });

  it('triangulates protected recursion and exact kind, digest, and mode changes', () => {
    const nested = { path: '/repo/package/nested/a', kind: 'file', digest: digest('b'), mode: '0644' };
    const base = raw(); const changed = { ...base.protected[0]!, kind: 'directory', digest: digest('c'), mode: '0755' };
    for (const [after, expected] of [
      [raw({ protected: [...base.protected, nested] }), difference('protected', nested.path, 'added', null, nested)],
      [raw({ protected: [] }), difference('protected', base.protected[0]!.path, 'removed', base.protected[0], null)],
      [raw({ protected: [changed] }), difference('protected', changed.path, 'changed', base.protected[0], changed)],
    ] as const) { const { instance, before, after: snapshot } = captures(base, after); expect(instance.compare(before, snapshot).differences).toEqual([expected]); }
  });

  it('reports each protected and process mutable field independently', () => {
    const base = raw();
    for (const field of ['kind', 'digest', 'mode'] as const) {
      const entry = { ...base.protected[0]!, [field]: field === 'digest' ? digest('d') : field === 'kind' ? 'directory' : '0755' };
      const result = captures(base, raw({ protected: [entry] }));
      expect(result.instance.compare(result.before, result.after).differences).toEqual([difference('protected', entry.path, 'changed', base.protected[0], entry)]);
    }
    for (const field of ['state', 'cwd', 'command'] as const) {
      const entry = { ...base.processes[0]!, [field]: field === 'state' ? 'running' : field === 'cwd' ? '/external/next' : 'bun' };
      const result = captures(base, raw({ processes: [entry] }));
      expect(result.instance.compare(result.before, result.after).differences).toEqual([difference('processes', entry.id, 'changed', base.processes[0], entry)]);
    }
  });

  it('reports external state, process lifecycle and mutable fields, and distinct network endpoints', () => {
    const base = raw();
    const next = raw({ externalRoots: [{ path: '/external', state: 'gone' }], processes: [{ id: 'p', state: 'running', cwd: '/external/next', command: 'bun' }, { id: 'new', state: 'new', cwd: '/external', command: 'node' }], network: [{ target: 'target', channel: 'http', endpoint: 'https://two' }] });
    const { instance, before, after } = captures(base, next);
    expect(instance.compare(before, after).differences).toEqual([
      difference('externalRoots', '/external', 'changed', base.externalRoots[0], next.externalRoots[0]),
      difference('network', 'target\0http\0https://one', 'removed', base.network[0], null),
      difference('network', 'target\0http\0https://two', 'added', null, next.network[0]),
      difference('processes', 'new', 'added', null, next.processes[1]),
      difference('processes', 'p', 'changed', base.processes[0], next.processes[0]),
    ]);
    const removal = captures(base, raw({ processes: [] }));
    expect(removal.instance.compare(removal.before, removal.after).differences).toEqual([difference('processes', 'p', 'removed', base.processes[0], null)]);
  });

  it('rejects null, raw, clone, proxy, and foreign snapshots without side effects', () => {
    const left = captures(raw(), raw()); const foreign = captures(raw(), raw()); const prior = left.instance.compare(left.before, left.after);
    for (const value of [null, raw(), structuredClone(left.before), new Proxy(left.before, {}), foreign.before]) {
      expect(() => left.instance.compare(value, left.after)).toThrow(new TypeError('invalid contamination comparison'));
    }
    expect(left.instance.compare(left.before, left.after)).toEqual(prior);
  });
});
