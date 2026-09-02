import { validatePB03Fixture } from '../lib/fixture-definition.mjs';
import { exact, freeze, own, text } from '../lib/observation-adapter.mjs';

const CASES = ['global-only', 'project-only', 'project-over-global', 'malformed-source', 'shadowed-source'];
const DEFINITIONS = {
  parsedAgents: ['name description sourcePath sourceDigest', 'name', 'description', 'agent'],
  parsedSubagents: ['name body sourcePath sourceDigest', 'name', 'body', 'agent'],
  frontmatter: ['agent field value sourcePath', 'agent field', 'value', 'agent'],
  modelSettings: ['agent model sourcePath', 'agent', 'model', 'profile'],
  effortSettings: ['agent effort sourcePath', 'agent', 'effort', 'profile'],
  defaults: ['field value path', 'field', 'value', 'settings'],
  numericValues: ['field value path', 'field', 'value', 'settings'],
  sessionResources: ['agent resource path', 'agent', 'resource', 'settings'],
  continuation: ['agent enabled path', 'agent', 'enabled', 'settings'],
  tools: ['agent name enabled path', 'agent name', 'enabled', 'settings'],
  shortcuts: ['agent key command path', 'agent key', 'command', 'settings'],
};
const FAMILIES = Object.keys(DEFINITIONS);
const KEYS = [...FAMILIES, 'precedence', 'provenance', 'diagnostics'];
const fail = () => { throw new TypeError('invalid PB-03'); };
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);
const safePath = (value) => text(value) && !value.startsWith('/') && !value.includes('\\')
  && !value.split('/').some((part) => !part || part === '.' || part === '..');
const same = (left, right) => left === right || Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && left.every((value, index) => same(value, right[index]))
  || plain(left) && plain(right) && Object.keys(left).length === Object.keys(right).length
  && Object.keys(left).every((key) => Object.hasOwn(right, key) && same(left[key], right[key]));
const kind = (role) => role.startsWith('global-') ? 'global' : role.startsWith('project-') ? 'project' : null;
const allowed = (source, role) => source === 'agent'
  ? /^(global|project)-agent-markdown$/u.test(role)
  : source === 'profile'
    ? /^(global|project)-(agent-markdown|profiles)$/u.test(role)
    : /^(global|project)-settings$/u.test(role);
const fieldId = (family, identity, record) => `${family}:${identity.map((key) => record[key]).join(':')}`;
const schema = (value, fields) => {
  exact(value, fields);
  return Object.keys(value).every((field, index) => field === fields[index]) ? value : fail();
};
const snapshot = (value, seen = new WeakSet()) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' && text(value)
    || typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) fail();
  seen.add(value);
  const prototype = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value);
  const descriptors = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(value, key)]));
  if (keys.some((key) => typeof key === 'symbol')) fail();
  if (Array.isArray(value)) {
    const length = descriptors.get('length');
    if (prototype !== Array.prototype || !length || length.enumerable || length.configurable || !length.writable
      || !Object.hasOwn(length, 'value') || !Number.isSafeInteger(length.value) || length.value < 0
      || keys.length !== length.value + 1 || keys.some((key, index) => key !== (index === length.value ? 'length' : String(index)))) fail();
    const output = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors.get(String(index));
      if (!descriptor || !descriptor.enumerable || !descriptor.configurable || !descriptor.writable || !Object.hasOwn(descriptor, 'value')) fail();
      output.push(snapshot(descriptor.value, seen));
    }
    return freeze(output);
  }
  if (prototype !== Object.prototype) fail();
  const output = {};
  for (const key of keys) {
    const descriptor = descriptors.get(key);
    if (!descriptor || !descriptor.enumerable || !descriptor.configurable || !descriptor.writable || !Object.hasOwn(descriptor, 'value')) fail();
    Object.defineProperty(output, key, { value: snapshot(descriptor.value, seen), enumerable: true, writable: false, configurable: false });
  }
  return freeze(output);
};

function record(family, value, seeds) {
  const [names, identity, valueKey, source] = DEFINITIONS[family];
  const keys = names.split(' ');
  schema(value, keys);
  for (const key of keys) {
    if (!['enabled', 'value', 'sourceDigest'].includes(key) && !text(value[key])) fail();
  }
  if (family === 'numericValues' && (!Number.isFinite(value.value) || Object.is(value.value, -0))) fail();
  if (family !== 'numericValues' && !['continuation', 'tools'].includes(family) && !text(value[valueKey])) fail();
  if (['continuation', 'tools'].includes(family) && typeof value.enabled !== 'boolean') fail();
  const path = value.sourcePath ?? value.path;
  const seed = seeds.get(path);
  if (!safePath(path) || !seed || !allowed(source, seed.role)) fail();
  if (Object.hasOwn(value, 'sourceDigest') && value.sourceDigest !== seed.sha256) fail();
  return { field: fieldId(family, identity.split(' '), value), path, seed, value: value[valueKey] };
}

function effective(observation, seeds) {
  const fields = new Map();
  for (const family of FAMILIES) {
    const values = observation[family];
    if (!Array.isArray(values) || !values.length) fail();
    for (const value of values) {
      const item = record(family, value, seeds);
      if (fields.has(item.field)) fail();
      fields.set(item.field, item);
    }
  }
  return fields;
}

function precedence(observation, fields, seeds, caseId) {
  if (!Array.isArray(observation.precedence) || !observation.precedence.length) fail();
  const bindings = new Map();
  for (const item of observation.precedence) {
    schema(item, ['field', 'candidates', 'selectedSourcePath', 'selectedValue']);
    const direct = fields.get(item.field);
    if (!text(item.field) || !direct || bindings.has(item.field) || !Array.isArray(item.candidates)
      || !item.candidates.length || !safePath(item.selectedSourcePath)) fail();
    const [, , , source] = DEFINITIONS[item.field.split(':', 1)[0]];
    const paths = new Set();
    for (const candidate of item.candidates) {
      schema(candidate, ['sourcePath', 'value']);
      const seed = seeds.get(candidate.sourcePath);
      const loser = caseId === 'shadowed-source' && seed?.role === 'shadowed-source'
        && candidate.sourcePath !== item.selectedSourcePath;
      if (!safePath(candidate.sourcePath) || !seed || paths.has(candidate.sourcePath)
        || !allowed(source, seed.role) && !loser) fail();
      paths.add(candidate.sourcePath);
    }
    const selected = item.candidates.find((candidate) => candidate.sourcePath === item.selectedSourcePath
      && same(candidate.value, item.selectedValue));
    if (!selected || item.selectedSourcePath !== direct.path || !same(item.selectedValue, direct.value)) fail();
    bindings.set(item.field, item);
  }
  if (bindings.size !== fields.size) fail();
  return bindings;
}

function provenance(observation, fields, seeds) {
  if (!Array.isArray(observation.provenance) || !observation.provenance.length) fail();
  const bindings = new Map();
  for (const item of observation.provenance) {
    schema(item, ['field', 'sourceKind', 'path', 'seedDigest']);
    const direct = fields.get(item.field), seed = seeds.get(item.path);
    if (!text(item.field) || !direct || bindings.has(item.field) || !['global', 'project'].includes(item.sourceKind)
      || !seed || item.path !== direct.path || item.seedDigest !== seed.sha256 || item.sourceKind !== kind(seed.role)) fail();
    bindings.set(item.field, item);
  }
  if (bindings.size !== fields.size) fail();
}

function cases(caseId, fields, precedenceBindings, diagnostics, seeds) {
  const malformed = [...seeds.values()].find((seed) => seed.role === 'malformed-source');
  const shadowed = [...seeds.values()].find((seed) => seed.role === 'shadowed-source');
  const expected = caseId === 'malformed-source'
    ? ['PB03_MALFORMED_SOURCE', 'error', malformed.path, 'Malformed PB-03 source.']
    : caseId === 'shadowed-source'
      ? ['PB03_SHADOWED_SOURCE', 'warning', shadowed.path, 'Shadowed PB-03 source.'] : null;
  if (!malformed || !shadowed || !Array.isArray(diagnostics) || expected && diagnostics.length !== 1
    || !expected && diagnostics.length) fail();
  if (expected) {
    schema(diagnostics[0], ['code', 'severity', 'path', 'message']);
    if (!expected.every((value, index) => diagnostics[0][['code', 'severity', 'path', 'message'][index]] === value)) fail();
  }
  for (const item of fields.values()) if ([malformed.path, shadowed.path].includes(item.path)) fail();
  let shadowedLosers = 0;
  for (const item of precedenceBindings.values()) {
    const scopes = item.candidates.map((candidate) => kind(seeds.get(candidate.sourcePath).role));
    if (caseId === 'global-only' && scopes.some((scope) => scope !== 'global')) fail();
    if (caseId === 'project-only' && scopes.some((scope) => scope !== 'project')) fail();
    if (caseId === 'project-over-global' && !(scopes.length === 2 && scopes[0] === 'global' && scopes[1] === 'project')) fail();
    if (caseId === 'malformed-source' && item.candidates.some((candidate) => candidate.sourcePath === malformed.path)) fail();
    shadowedLosers += item.candidates.filter((candidate) => candidate.sourcePath === shadowed.path
      && candidate.sourcePath !== item.selectedSourcePath).length;
    if ([malformed.path, shadowed.path].includes(item.selectedSourcePath)) fail();
  }
  if (shadowedLosers !== (caseId === 'shadowed-source' ? 1 : 0)) fail();
  const selected = [...fields.values()].map((item) => kind(item.seed.role));
  if (caseId === 'global-only' && selected.some((scope) => scope !== 'global')) fail();
  if (caseId !== 'global-only' && selected.some((scope) => scope !== 'project')) fail();
}

function observe(value, caseId, seeds) {
  schema(value, KEYS);
  const authority = new Map(seeds.map((seed) => [seed.path, seed]));
  const fields = effective(value, authority);
  const bindings = precedence(value, fields, authority, caseId);
  provenance(value, fields, authority);
  cases(caseId, fields, bindings, value.diagnostics, authority);
  return freeze(value);
}

export function adaptPB03(input) {
  try {
    const request = own(input, ['fixtureRoot', 'fixture', 'caseId', 'target']);
    if (!text(request.fixtureRoot) || !CASES.includes(request.caseId)) fail();
    const fixture = validatePB03Fixture(request.fixtureRoot, request.fixture);
    const fixtureCase = fixture.cases[CASES.indexOf(request.caseId)];
    const target = own(request.target, ['observe']);
    if (typeof target.observe !== 'function' || fixtureCase.id !== request.caseId) fail();
    const descriptor = freeze({ caseId: fixtureCase.id, seeds: fixture.seeds });
    const observation = observe(snapshot(target.observe(descriptor)), fixtureCase.id, fixture.seeds);
    return freeze({ identity: fixture.identity, fixtureId: fixture.fixtureId, procedureId: fixture.procedureId,
      normalizationId: fixture.normalizationId, caseId: fixtureCase.id, observation });
  } catch { return fail(); }
}

Object.freeze(adaptPB03);
