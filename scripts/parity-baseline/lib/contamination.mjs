import path from 'node:path';

const controls = /[\0-\x1f\x7f-\x9f]/u;
const kinds = new Set(['file', 'directory', 'symlink', 'missing']);
const fail = (message) => { throw new TypeError(message); };
const text = (value) => typeof value === 'string' && value.length > 0 && !controls.test(value);
const absolute = (value) => text(value) && !/[?*\[\]]/u.test(value) && path.isAbsolute(value) && path.normalize(value) === value;
const below = (root, value) => root === path.sep ? value !== root && value.startsWith(root) : value.startsWith(`${root}${path.sep}`);
const order = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function exact(value, keys, message) {
  if (!value || typeof value !== 'object' || !Object.isExtensible(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== keys.length) fail(message);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !descriptor.configurable || !descriptor.writable || !Object.hasOwn(descriptor, 'value')) fail(message);
  }
  return value;
}
function list(value, message) {
  if (!Array.isArray(value) || !Object.isExtensible(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1) fail(message);
  const length = Object.getOwnPropertyDescriptor(value, 'length');
  if (!length || length.enumerable || length.configurable || !length.writable || length.value !== value.length) fail(message);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !descriptor.configurable || !descriptor.writable || !Object.hasOwn(descriptor, 'value')) fail(message);
  }
  return value;
}
function canonical(value, resolve, message, cache) {
  if (cache?.has(value)) return cache.get(value);
  let result; try { result = resolve(value); } catch { fail(message); }
  if (!absolute(result)) fail(message);
  cache?.set(value, result); return result;
}
function frozen(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozen));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.keys(value).map((key) => [key, frozen(value[key])]))) ;
  return value;
}
function key(entry, fields) { return fields.map((field) => entry[field]).join('\0'); }
function inventory(value, fields, validate) {
  const entries = list(value, 'invalid contamination snapshot').map((raw) => {
    exact(raw, fields, 'invalid contamination snapshot'); const entry = Object.fromEntries(fields.map((field) => [field, raw[field]])); validate(entry); return entry;
  });
  const seen = new Set(); if (entries.some((entry) => seen.has(key(entry, fields)) || !seen.add(key(entry, fields)))) fail('invalid contamination snapshot');
  return entries.sort((left, right) => order(key(left, fields), key(right, fields)));
}
function roots(value, resolve, message) {
  const entries = list(value, message).map((lexical) => {
    if (!absolute(lexical)) fail(message); return { lexical, physical: canonical(lexical, resolve, message) };
  });
  if (!entries.length || entries.some((entry, index) => entries.some((other, otherIndex) => index !== otherIndex && (entry.lexical === other.lexical || entry.physical === other.physical || below(entry.lexical, other.lexical) || below(other.lexical, entry.lexical) || below(entry.physical, other.physical) || below(other.physical, entry.physical))))) fail(message);
  return entries;
}

export function createContaminationGuard(config) {
  exact(config, ['repositoryRoot', 'protectedRoots', 'excludedRoots', 'externalRoots', 'canonicalize', 'snapshot'], 'invalid contamination policy');
  if (!absolute(config.repositoryRoot) || typeof config.canonicalize !== 'function' || typeof config.snapshot !== 'function') fail('invalid contamination policy');
  const resolve = config.canonicalize; const snapshot = config.snapshot; const repository = { lexical: config.repositoryRoot, physical: canonical(config.repositoryRoot, resolve, 'invalid contamination policy') };
  const protectedRoots = roots(config.protectedRoots, resolve, 'invalid contamination policy'); const externalRoots = roots(config.externalRoots, resolve, 'invalid contamination policy');
  if (protectedRoots.some((entry) => !below(repository.lexical, entry.lexical) || !below(repository.physical, entry.physical)) || externalRoots.some((entry) => entry.lexical === repository.lexical || entry.physical === repository.physical || below(entry.lexical, repository.lexical) || below(repository.lexical, entry.lexical) || below(entry.physical, repository.physical) || below(repository.physical, entry.physical) || protectedRoots.some((root) => below(entry.lexical, root.lexical) || below(root.lexical, entry.lexical) || below(entry.physical, root.physical) || below(root.physical, entry.physical)))) fail('invalid contamination policy');
  const excludedRoots = list(config.excludedRoots, 'invalid contamination policy').map((lexical) => {
    if (!absolute(lexical)) fail('invalid contamination policy'); const physical = canonical(lexical, resolve, 'invalid contamination policy'); const owners = protectedRoots.filter((root) => below(root.lexical, lexical) && below(root.physical, physical));
    if (owners.length !== 1) fail('invalid contamination policy'); return { lexical, physical, owner: owners[0] };
  });
  if (excludedRoots.some((entry, index) => excludedRoots.some((other, otherIndex) => index !== otherIndex && (entry.lexical === other.lexical || entry.physical === other.physical || below(entry.lexical, other.lexical) || below(other.lexical, entry.lexical) || below(entry.physical, other.physical) || below(other.physical, entry.physical))))) fail('invalid contamination policy');
  const policy = frozen({ repositoryRoot: repository.lexical, protectedRoots: protectedRoots.map((entry) => entry.lexical), excludedRoots: excludedRoots.map((entry) => entry.lexical), externalRoots: externalRoots.map((entry) => entry.lexical) });
  const brands = new WeakSet();
  const copy = (value) => frozen(value);
  const compareEntries = (area, before, after, identity) => {
    const left = new Map(before.map((entry) => [identity(entry), entry])); const right = new Map(after.map((entry) => [identity(entry), entry]));
    return [...new Set([...left.keys(), ...right.keys()])].map((key) => {
      const previous = left.get(key); const next = right.get(key);
      const change = previous === undefined ? 'added' : next === undefined ? 'removed' : JSON.stringify(previous) === JSON.stringify(next) ? null : 'changed';
      return change && { area, key, change, before: previous === undefined ? null : copy(previous), after: next === undefined ? null : copy(next) };
    }).filter(Boolean);
  };
  const compare = Object.freeze((before, after) => {
    if (!brands.has(before) || !brands.has(after)) fail('invalid contamination comparison');
    const differences = [
      ...['status', 'index', 'refs'].map((key) => before.git[key] === after.git[key] ? null : { area: 'git', key, change: 'changed', before: before.git[key], after: after.git[key] }),
      ...compareEntries('protected', before.protected, after.protected, (entry) => entry.path),
      ...compareEntries('externalRoots', before.externalRoots, after.externalRoots, (entry) => entry.path),
      ...compareEntries('processes', before.processes, after.processes, (entry) => entry.id),
      ...compareEntries('network', before.network, after.network, (entry) => key(entry, ['target', 'channel', 'endpoint'])),
    ].filter(Boolean).sort((left, right) => order(left.area, right.area) || order(left.key, right.key) || order(left.change, right.change));
    return frozen({ clean: differences.length === 0, differences });
  });
  const capture = Object.freeze(() => {
    let raw; try { raw = snapshot(policy); } catch { fail('invalid contamination snapshot'); }
    exact(raw, ['git', 'protected', 'externalRoots', 'processes', 'network'], 'invalid contamination snapshot'); exact(raw.git, ['status', 'index', 'refs'], 'invalid contamination snapshot');
    if (Object.values(raw.git).some((value) => !text(value))) fail('invalid contamination snapshot'); const cache = new Map(); const physical = (value) => canonical(value, resolve, 'invalid contamination snapshot', cache);
    const protectedEntries = inventory(raw.protected, ['path', 'kind', 'digest', 'mode'], (entry) => {
      if (!absolute(entry.path) || !kinds.has(entry.kind) || !/^[a-f0-9]{64}$/u.test(entry.digest) || !/^0[0-7]{3}$/u.test(entry.mode)) fail('invalid contamination snapshot');
      entry.physical = physical(entry.path); const owners = protectedRoots.filter((root) => below(root.lexical, entry.path) && below(root.physical, entry.physical)); if (owners.length !== 1) fail('invalid contamination snapshot');
      const lexical = excludedRoots.filter((root) => below(root.lexical, entry.path)); const resolved = excludedRoots.filter((root) => below(root.physical, entry.physical)); if (lexical.length !== resolved.length || lexical.some((root) => !resolved.includes(root))) fail('invalid contamination snapshot'); entry.excluded = lexical.length === 1;
    });
    if (new Set(protectedEntries.map((entry) => entry.physical)).size !== protectedEntries.length) fail('invalid contamination snapshot');
    const external = inventory(raw.externalRoots, ['path', 'state'], (entry) => {
      if (!absolute(entry.path) || !text(entry.state)) fail('invalid contamination snapshot'); entry.physical = physical(entry.path); if (!externalRoots.some((root) => root.lexical === entry.path && root.physical === entry.physical)) fail('invalid contamination snapshot');
    });
    if (external.length !== externalRoots.length || new Set(external.map((entry) => entry.physical)).size !== external.length || external.some((entry) => !externalRoots.some((root) => root.physical === entry.physical))) fail('invalid contamination snapshot');
    const processes = inventory(raw.processes, ['id', 'state', 'cwd', 'command'], (entry) => {
      if (!text(entry.id) || !text(entry.state) || !absolute(entry.cwd) || !text(entry.command)) fail('invalid contamination snapshot'); entry.physical = physical(entry.cwd); if (externalRoots.filter((root) => (root.lexical === entry.cwd || below(root.lexical, entry.cwd)) && (root.physical === entry.physical || below(root.physical, entry.physical))).length !== 1) fail('invalid contamination snapshot');
    });
    if (new Set(processes.map((entry) => entry.id)).size !== processes.length) fail('invalid contamination snapshot');
    const network = inventory(raw.network, ['target', 'channel', 'endpoint'], (entry) => { if (Object.values(entry).some((value) => !text(value))) fail('invalid contamination snapshot'); });
    const result = frozen({ git: { ...raw.git }, protected: protectedEntries.filter((entry) => !entry.excluded).map(({ physical: _physical, excluded: _excluded, ...entry }) => entry), externalRoots: external.map(({ physical: _physical, ...entry }) => entry), processes: processes.map(({ physical: _physical, ...entry }) => entry), network }); brands.add(result); return result;
  });
  return Object.freeze({ capture, compare });
}
