import path from 'node:path';

const fixed = ['HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'PI_CODING_AGENT_DIR', 'PNPM_HOME', 'PATH'];
const roles = ['home', 'config', 'cache', 'data', 'temp', 'tool', 'bin'];
const controls = /[\0-\x1f\x7f-\x9f]/;
const fail = (message) => { throw new TypeError(message); };

function string(value) {
  return typeof value === 'string' && !controls.test(value);
}

function identifier(value) {
  return string(value) && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value);
}

function ownData(object, keys, message, prototype = Object.prototype) {
  if (!object || typeof object !== 'object' || Object.getPrototypeOf(object) !== prototype || Object.getOwnPropertySymbols(object).length || Object.getOwnPropertyNames(object).length !== keys.length) fail(message);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !descriptor.enumerable || !descriptor.configurable || !descriptor.writable || !Object.hasOwn(descriptor, 'value')) fail(message);
  }
  return object;
}

function environmentSource(value) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length) fail('invalid source environment');
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !descriptor.configurable || !descriptor.writable || !Object.hasOwn(descriptor, 'value') || !identifier(key) || !string(descriptor.value)) fail('invalid source environment');
  }
  return value;
}

function allowlist(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1) fail('invalid allowlist');
  const length = Object.getOwnPropertyDescriptor(value, 'length');
  if (!length || length.enumerable || length.configurable || !length.writable || length.value !== value.length) fail('invalid allowlist');
  const seen = new Set();
  return value.map((item, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !descriptor.configurable || !descriptor.writable || !Object.hasOwn(descriptor, 'value') || !identifier(item) || seen.has(item.toUpperCase())) fail('invalid allowlist');
    const upper = item.toUpperCase();
    seen.add(upper);
    if (fixed.includes(upper)) fail('reserved environment key');
    return item;
  });
}

function lexicalRoot(value) {
  if (!string(value) || !path.isAbsolute(value) || path.normalize(value) !== value) fail('invalid roots');
  return value;
}

function canonicalRoot(value, canonicalize) {
  const result = canonicalize(value);
  if (!string(result) || !path.isAbsolute(result) || path.normalize(result) !== result) fail('invalid canonical root');
  return result;
}

function overlaps(left, right) {
  return left === right || left === path.parse(left).root || right === path.parse(right).root || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`);
}

function invalidRootSet(repository, roots) {
  return roots.some((root) => overlaps(root, repository)) || roots.some((root, index) => roots.some((other, otherIndex) => index !== otherIndex && overlaps(root, other)));
}

function sameRoots(left, right) {
  return left.length === right.length && left.every((root, index) => root === right[index]);
}

export function createEnvironmentFactory(config) {
  ownData(config, ['canonicalize'], 'invalid factory config');
  if (typeof config.canonicalize !== 'function') fail('invalid factory config');
  const bindings = new Map();

  return Object.freeze({
    build(request) {
      ownData(request, ['target', 'repositoryRoot', 'roots', 'source', 'allowlist'], 'invalid build request');
      ownData(request.target, ['id'], 'invalid target');
      if (!identifier(request.target.id)) fail('invalid target');
      ownData(request.roots, roles, 'invalid roots');
      const lexicalRepository = lexicalRoot(request.repositoryRoot);
      const lexical = roles.map((role) => lexicalRoot(request.roots[role]));
      if (invalidRootSet(lexicalRepository, lexical)) fail('invalid roots');
      const physicalRepository = canonicalRoot(lexicalRepository, config.canonicalize);
      const physical = lexical.map((root) => canonicalRoot(root, config.canonicalize));
      if (invalidRootSet(physicalRepository, physical)) fail('invalid roots');
      const source = environmentSource(request.source);
      const allowed = allowlist(request.allowlist);
      const snapshot = Object.freeze({ lexical: Object.freeze([...lexical]), physical: Object.freeze([...physical]) });
      const previous = bindings.get(request.target.id);
      if (previous && (!sameRoots(previous.lexical, snapshot.lexical) || !sameRoots(previous.physical, snapshot.physical))) fail('target roots changed');
      if (!previous && [...bindings.values()].some((bound) => bound.lexical.some((root) => snapshot.lexical.some((candidate) => overlaps(root, candidate))) || bound.physical.some((root) => snapshot.physical.some((candidate) => overlaps(root, candidate))))) fail('root already bound');
      if (!previous) bindings.set(request.target.id, snapshot);
      const output = Object.create(null);
      for (const key of allowed) if (Object.hasOwn(source, key)) output[key] = source[key];
      Object.assign(output, { HOME: physical[0], XDG_CONFIG_HOME: physical[1], XDG_CACHE_HOME: physical[2], XDG_DATA_HOME: physical[3], TMPDIR: physical[4], LANG: 'C', LC_ALL: 'C', TZ: 'UTC', PI_CODING_AGENT_DIR: physical[5], PNPM_HOME: physical[5], PATH: physical[6] });
      return Object.freeze(output);
    },
  });
}
