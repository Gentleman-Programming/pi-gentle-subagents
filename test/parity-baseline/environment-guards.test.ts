import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript harness has no declaration file.
import { createEnvironmentFactory } from '../../scripts/parity-baseline/lib/environment.mjs';

const roles = ['home', 'config', 'cache', 'data', 'temp', 'tool', 'bin'] as const;
type Role = (typeof roles)[number];
type Roots = Record<Role, string>;

function roots(tag: string): Roots {
  return Object.fromEntries(roles.map((role) => [role, `/tmp/${tag}-${role}`])) as Roots;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    target: { id: 'fork' },
    repositoryRoot: '/repo',
    roots: roots('fork'),
    source: hostileSource(),
    allowlist: ['SAFE'],
    ...overrides,
  };
}

function hostileSource() {
  return {
    SAFE: 'yes', PASSWORD: 'credential', TOKEN: 'token', http_proxy: 'lower-proxy',
    HTTP_PROXY: 'upper-proxy', https_proxy: 'lower-secure-proxy', HTTPS_PROXY: 'upper-secure-proxy',
    NODE_OPTIONS: '--require=x', NODE_PATH: 'node-path', NPM_TOKEN: 'npm-token',
    npm_config_cache: 'npm-config', npm_lifecycle_script: 'npm-hook', BASH_ENV: 'bash',
    ENV: 'env', SSH_AUTH_SOCK: 'ssh', GIT_ASKPASS: 'git', ARBITRARY_SECRET: 'secret',
  };
}

function factory(canonicalize = (value: string) => value) {
  return createEnvironmentFactory({ canonicalize });
}

function exact(run: () => unknown, message: string) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(TypeError);
  expect((thrown as Error).message).toBe(message);
}

function define<T extends object>(value: T, key: PropertyKey, descriptor: PropertyDescriptor) {
  Object.defineProperty(value, key, descriptor);
  return value;
}

function objectChanges(value: Record<string, unknown>, key: string) {
  const missing = { ...value }; delete missing[key];
  return [
    ['missing own key', missing],
    ['null prototype', Object.assign(Object.create(null), value)],
    ['extra own key', define({ ...value }, 'extra', { value: true, enumerable: true, configurable: true, writable: true })],
    ['accessor expected key', define({ ...value }, key, { get: () => 'x', enumerable: true, configurable: true })],
    ['symbol', define({ ...value }, Symbol('x'), { value: 'x' })],
    ['non-enumerable expected key', define({ ...value }, key, { value: value[key], enumerable: false, configurable: true, writable: true })],
  ] as const;
}

function inheritedOnly(value: Record<string, unknown>, key: string, run: (candidate: object) => void) {
  const candidate = { ...value }; delete candidate[key];
  define(Object.prototype, key, { value: value[key], enumerable: true, configurable: true, writable: true });
  try { run(candidate); } finally { delete (Object.prototype as Record<string, unknown>)[key]; }
}

function allowlistChanges() {
  const sparse = ['SAFE']; delete sparse[0];
  const accessor = ['SAFE']; define(accessor, '0', { get: () => 'SAFE', enumerable: true, configurable: true });
  const hiddenIndex = ['SAFE']; define(hiddenIndex, '0', { value: 'SAFE', enumerable: false, configurable: true, writable: true });
  return [
    ['sparse hole', sparse], ['wrong primitive', [1]], ['boxed item', [new String('SAFE')]], ['duplicate', ['SAFE', 'SAFE']], ['case duplicate', ['SAFE', 'safe']],
    ['custom prototype', Object.setPrototypeOf(['SAFE'], null)], ['accessor index 0', accessor], ['symbol', define(['SAFE'], Symbol('x'), { value: true })],
    ['extra enumerable key', define(['SAFE'], 'extra', { value: true, enumerable: true, configurable: true, writable: true })], ['non-enumerable index 0', hiddenIndex],
    ['extra non-enumerable key', define(['SAFE'], 'hidden', { value: true })],
  ] as const;
}

function physical(mapping: Record<string, string>) {
  return (value: string) => mapping[value] ?? value;
}

function mappedRequest(tag: string, repository = '/repository') {
  return request({ repositoryRoot: repository, roots: roots(tag) });
}

describe('PR3b1 deterministic environment isolation', () => {
  it('copies only explicitly allowlisted values into an exact immutable output', () => {
    const output = factory().build(request());
    const expected = {
      SAFE: 'yes', HOME: '/tmp/fork-home', XDG_CONFIG_HOME: '/tmp/fork-config',
      XDG_CACHE_HOME: '/tmp/fork-cache', XDG_DATA_HOME: '/tmp/fork-data', TMPDIR: '/tmp/fork-temp',
      LANG: 'C', LC_ALL: 'C', TZ: 'UTC', PI_CODING_AGENT_DIR: '/tmp/fork-tool',
      PNPM_HOME: '/tmp/fork-tool', PATH: '/tmp/fork-bin',
    };
    expect(Object.keys(output)).toEqual(Object.keys(expected));
    expect(Object.getOwnPropertyNames(output)).toEqual(Object.keys(expected));
    expect(Object.getOwnPropertySymbols(output)).toEqual([]);
    expect(Object.getPrototypeOf(output)).toBeNull();
    expect(output).toEqual(expected);
    for (const [key, value] of Object.entries(expected)) {
      expect(Object.getOwnPropertyDescriptor(output, key)).toEqual({
        value, enumerable: true, writable: false, configurable: false,
      });
    }
    for (const key of Object.keys(hostileSource()).filter((key) => key !== 'SAFE')) {
      expect(output).not.toHaveProperty(key);
    }
  });

  it('rejects complete shape, type, name, C1, and sparse-input violations exactly', () => {
    const c1 = '\u0085';
    const rows: Array<[() => unknown, string]> = [
      [() => createEnvironmentFactory('x' as never), 'invalid factory config'], [() => factory().build('x' as never), 'invalid build request'],
      [() => factory().build(request({ target: { id: `bad${c1}` } })), 'invalid target'], [() => factory().build(request({ roots: { ...roots('shape'), home: `/tmp/${c1}` } })), 'invalid roots'],
      [() => factory().build(request({ source: { SAFE: `x${c1}` } })), 'invalid source environment'], [() => factory().build(request({ allowlist: [`SAFE${c1}`] })), 'invalid allowlist'],
    ];
    for (const [, value] of objectChanges({ canonicalize: (x: string) => x }, 'canonicalize')) rows.push([() => createEnvironmentFactory(value as never), 'invalid factory config']);
    for (const [, value] of objectChanges(request(), 'target')) rows.push([() => factory().build(value as never), 'invalid build request']);
    for (const [, value] of objectChanges({ id: 'fork' }, 'id')) rows.push([() => factory().build(request({ target: value })), 'invalid target']);
    for (const [, value] of objectChanges(roots('shape'), 'home')) rows.push([() => factory().build(request({ roots: value })), 'invalid roots']);
    for (const [kind, value] of objectChanges({ SAFE: 'yes' }, 'SAFE')) if (kind !== 'missing own key' && kind !== 'extra own key') rows.push([() => factory().build(request({ source: value })), 'invalid source environment']);
    for (const [, value] of allowlistChanges()) rows.push([() => factory().build(request({ allowlist: value })), 'invalid allowlist']);
    inheritedOnly({ canonicalize: (x: string) => x }, 'canonicalize', (value) => exact(() => createEnvironmentFactory(value as never), 'invalid factory config'));
    inheritedOnly(request(), 'target', (value) => exact(() => factory().build(value as never), 'invalid build request'));
    inheritedOnly({ id: 'fork' }, 'id', (value) => exact(() => factory().build(request({ target: value })), 'invalid target'));
    inheritedOnly(roots('shape'), 'home', (value) => exact(() => factory().build(request({ roots: value })), 'invalid roots'));
    for (const [run, message] of rows) exact(run, message);
  });

  it('rejects C0, DEL, and C1 independently at every public environment boundary', () => {
    for (const control of ['\u0000', '\u007f', '\u0085']) {
      exact(() => factory().build(request({ target: { id: `fork${control}` } })), 'invalid target');
      exact(() => factory().build(request({ source: { [`SAFE${control}`]: 'yes' } })), 'invalid source environment');
      exact(() => factory().build(request({ source: { SAFE: `yes${control}` } })), 'invalid source environment');
      exact(() => factory().build(request({ allowlist: [`SAFE${control}`] })), 'invalid allowlist');
      exact(() => factory().build(request({ roots: { ...roots('control'), home: `/tmp/${control}home` } })), 'invalid roots');
      exact(() => factory((value: string) => value.endsWith('-home') ? `/physical/${control}home` : `/physical${value}`).build(request({ roots: roots('canonical-control') })), 'invalid canonical root');
    }
  });

  it('proves the former physical swap and nesting precursors already reject lexically', () => {
    const first = roots('first');
    const swap = { ...roots('second'), home: first.config, config: first.home };
    const nested = { ...roots('second'), home: `${first.home}/child` };
    for (const candidate of [swap, nested]) {
      const instance = factory();
      instance.build(request({ roots: first }));
      exact(() => instance.build(request({ target: { id: 'upstream' }, roots: candidate })), 'root already bound');
    }
  });

  it('rejects every lexical repository/root relationship before canonicalization', () => {
    for (const home of ['/repo', '/repo/child', '/', '/tmp/a/../a']) {
      exact(() => factory().build(request({ roots: { ...roots('lexical'), home } })), 'invalid roots');
    }
    const lexical = roots('reverse');
    exact(() => factory().build(request({ repositoryRoot: `${lexical.home}/repository`, roots: lexical })), 'invalid roots');
    expect(() => factory().build(request({ roots: { ...roots('prefix'), home: '/repo-other' } }))).not.toThrow();
  });

  it('rejects home/config equality and both lexical overlap directions in one otherwise-valid request', () => {
    const base = roots('within-request');
    for (const [home, config] of [[base.config, base.config], ['/tmp/ancestor', '/tmp/ancestor/config'], ['/tmp/descendant/home', '/tmp/descendant']]) {
      exact(() => factory().build(request({ roots: { ...base, home, config } })), 'invalid roots');
    }
  });

  it('requires repository and each independently returned canonical root to be valid', () => {
    const badReturns: Array<[string, unknown]> = [
      ['relative', 'relative'], ['non-string', 1], ['C1', '/physical/\u0085home'], ['non-normalized', '/physical/a/../home'],
    ];
    for (const [, bad] of badReturns) {
      const input = roots('canonical');
      const canonicalize = (value: string) => {
        if (value === '/repo') return '/physical/repository';
        return value === input.home ? bad : `/physical${value}`;
      };
      exact(() => factory(canonicalize as never).build(request({ roots: input })), 'invalid canonical root');
    }
  });

  it('rejects physical repository overlap only after lexically disjoint inputs pass', () => {
    const cases: Array<[string, Record<string, string>]> = [
      ['equal', { '/repository': '/physical/repository', '/tmp/physical-home': '/physical/repository' }],
      ['root ancestor', { '/repository': '/physical/repository/child', '/tmp/physical-home': '/physical/repository' }],
      ['root descendant', { '/repository': '/physical/repository', '/tmp/physical-home': '/physical/repository/child' }],
      ['filesystem root', { '/repository': '/physical/repository', '/tmp/physical-home': '/' }],
    ];
    for (const [, mapping] of cases) {
      exact(() => factory(physical(mapping)).build(mappedRequest('physical')), 'invalid roots');
    }
  });

  it('rejects physical root registry reuse, swap, descendant, and ancestor with fresh precursors', () => {
    const first = roots('first');
    const firstPhysical = {
      '/repo': '/elsewhere/repository',
      ...Object.fromEntries(roles.map((role) => [
        first[role],
        role === 'home' ? '/physical/first-home/child' : `/physical/first-${role}`,
      ])),
    };
    const cases: Array<[string, (second: Roots) => Record<string, string>]> = [
      ['reuse', (second) => ({ [second.home]: '/physical/first-home/child' })],
      ['swap', (second) => ({ [second.home]: '/physical/first-config', [second.config]: '/physical/first-home/child' })],
      ['descendant', (second) => ({ [second.home]: '/physical/first-home/child/grandchild' })],
      ['ancestor', (second) => ({ [second.home]: '/physical/first-home' })],
    ];
    for (const [, override] of cases) {
      const second = roots('second');
      const mapping = { ...firstPhysical, ...Object.fromEntries(roles.map((role) => [second[role], `/physical/second-${role}`])), ...override(second) };
      const instance = factory(physical(mapping));
      instance.build(request({ roots: first }));
      exact(() => instance.build(request({ target: { id: 'upstream' }, roots: second })), 'root already bound');
    }
  });

  it('rejects lexical cross-target reuse, swap, ancestor, descendant, and changed same-target roots with fresh factories', () => {
    const first = roots('lexical-first');
    const cases: Array<[string, (next: Roots) => Roots, string]> = [
      ['reuse', (next) => ({ ...next, home: first.home }), 'root already bound'], ['swap', (next) => ({ ...next, home: first.config, config: first.home }), 'root already bound'],
      ['ancestor', (next) => ({ ...next, home: '/tmp/lexical-parent' }), 'root already bound'], ['descendant', (next) => ({ ...next, home: `${first.home}/child` }), 'root already bound'],
      ['same target changed', (next) => next, 'target roots changed'],
    ];
    for (const [, change, message] of cases) {
      const initial = { ...first, ...(message === 'root already bound' && change(roots('probe')).home === '/tmp/lexical-parent' ? { home: '/tmp/lexical-parent/child' } : {}) };
      const instance = factory(); instance.build(request({ roots: initial }));
      exact(() => instance.build(request({ target: { id: message === 'target roots changed' ? 'fork' : 'upstream' }, roots: change(roots('lexical-second')) })), message);
    }
  });

  it('rejects a same-target physical snapshot change even when lexical roots are identical', () => {
    const input = roots('physical-snapshot'); let changed = false;
    const instance = factory((value: string) => value === input.home && changed ? '/physical/new-home' : `/physical${value}`);
    instance.build(request({ roots: input })); changed = true;
    exact(() => instance.build(request({ roots: input })), 'target roots changed');
  });

  it('retains snapshots after mutation and keeps a disjoint target independent', () => {
    const source = { SAFE: 'yes' };
    const allowlist = ['SAFE'];
    const input = roots('stable');
    const instance = factory();
    const output = instance.build(request({ source, allowlist, roots: input }));
    source.SAFE = 'changed';
    allowlist[0] = 'OTHER';
    input.cache = '/changed';
    expect(() => { (output as Record<string, string>).SAFE = 'changed'; }).toThrow(TypeError);
    expect(instance.build(request({ source: { SAFE: 'yes' }, allowlist: ['SAFE'], roots: roots('stable') }))).toEqual(output);
    expect(instance.build(request({ target: { id: 'upstream' }, roots: roots('independent') }))).toMatchObject({
      HOME: '/tmp/independent-home', SAFE: 'yes',
    });
  });

  it('rejects every reserved fixed-name case variant', () => {
    const fixed = ['HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'PI_CODING_AGENT_DIR', 'PNPM_HOME', 'PATH'];
    for (const key of fixed) {
      for (const name of [key, key.toLowerCase(), `${key[0].toLowerCase()}${key.slice(1)}`]) {
        exact(() => factory().build(request({ source: { [name]: 'x' }, allowlist: [name] })), 'reserved environment key');
      }
    }
  });
});
