import { validatePB05Fixture } from '../lib/fixture-definition.mjs';

const FAMILIES = [
  'initialization', 'migration', 'crudResults', 'boundedData',
  'configuredPath', 'lockingBehavior', 'runtimeVariant', 'permissionFailure',
];
const CASES = [
  ['node-sqlite-crud', 'node-sqlite', [1, 3, 7, 4, 1, 1, 1, 0]],
  ['bun-sqlite-crud', 'bun-sqlite', [1, 3, 7, 4, 1, 1, 1, 0]],
  ['locked-database', 'node-sqlite', [1, 3, 0, 0, 1, 1, 1, 0]],
  ['permission-denied', 'node-sqlite', [0, 0, 0, 0, 0, 0, 1, 1]],
];
const PATH = 'history/subagents-history.sqlite';
const reflectApply = Reflect.apply;
const fail = () => { throw new TypeError('invalid PB-05'); };
const fields = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every((name, index) => Object.keys(value)[index] === name);
function copy(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) fail();
  const then = Object.getOwnPropertyDescriptor(value, 'then');
  if (then || 'then' in value) fail();
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) fail();
    seen.add(value); return value.map((item) => copy(item, seen));
  }
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  seen.add(value); const output = {};
  for (const key of Object.keys(value)) output[key] = copy(value[key], seen);
  return output;
}
function frozen(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) frozen(item);
    Object.freeze(value);
  }
  return value;
}
function same(left, right) {
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return left === right;
  const leftKeys = Object.keys(left), rightKeys = Object.keys(right);
  return Array.isArray(left) === Array.isArray(right) && leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && same(left[key], right[key]));
}
function descriptor(authority, item, targetId) {
  const output = Object.create(null);
  Object.assign(output, {
    identity: 'PB-05', caseId: item.id, fixtureId: authority.fixture.fixtureId,
    fixtureDigest: authority.fixtureDigest, seedId: authority.seed.seedId,
    seedDigest: authority.seedDigest, targetId, runtime: item.runtime, seed: copy(authority.seed),
  });
  return frozen(output);
}
function expected(seed, caseId, runtime) {
  const result = Object.fromEntries(FAMILIES.map((name) => [name, []]));
  result.runtimeVariant.push({ runtime, module: runtime === 'node-sqlite' ? 'node:sqlite' : 'bun:sqlite' });
  if (caseId === 'permission-denied') {
    result.permissionFailure.push({ operation: 'open-configured-path', code: 'EACCES' });
    return result;
  }
  result.initialization.push({ databasePath: PATH, opened: true });
  for (const table of ['subagent_tasks', 'subagent_task_attempts', 'subagent_events']) result.migration.push({ table, applied: true });
  result.configuredPath.push({ configuredPath: PATH, databasePath: PATH });
  result.lockingBehavior.push(caseId === 'locked-database'
    ? { operation: 'write-under-exclusive-lock', result: 'SQLITE_BUSY' }
    : { operation: 'write-under-unlocked-db', result: 'accepted' });
  if (caseId === 'locked-database') return result;
  for (const [operation, entity, id, status] of [
    ['insert', 'task', seed.task.id, seed.task.status], ['insert', 'attempt', seed.attempt.task_id, seed.attempt.status],
    ['insert', 'event', seed.event.task_id, seed.event.status], ['read', 'task', seed.task.id, seed.task.status],
    ['read', 'attempt', seed.attempt.task_id, seed.attempt.status], ['read', 'event', seed.event.task_id, seed.event.status],
    ['read', 'snapshot', seed.task.id, seed.task.status],
  ]) result.crudResults.push({ operation, entity, id, status });
  for (const [entity, value] of [['task', seed.task], ['attempt', seed.attempt], ['event', seed.event], ['snapshot', seed.snapshot]]) {
    result.boundedData.push({ entity, count: 1, values: [value] });
  }
  return result;
}
function validate(value, descriptorValue, item) {
  const output = copy(value), familyData = expected(descriptorValue.seed, item.id, item.runtime);
  if (!fields(output, ['identity', 'targetId', 'fixtureId', 'fixtureDigest', 'caseId', 'seedId', 'seedDigest', 'families'])) fail();
  for (const key of ['identity', 'targetId', 'fixtureId', 'fixtureDigest', 'caseId', 'seedId', 'seedDigest']) {
    if (output[key] !== descriptorValue[key]) fail();
  }
  if (!fields(output.families, FAMILIES)) fail();
  for (const [index, name] of FAMILIES.entries()) {
    const actual = output.families[name], expectedValues = familyData[name];
    if (!Array.isArray(actual) || actual.length !== item.counts[index]) fail();
    if (!actual.every((record) => fields(record, schemas[name])) || !same(actual, expectedValues)) fail();
  }
  return frozen(output);
}
const schemas = {
  initialization: ['databasePath', 'opened'], migration: ['table', 'applied'],
  crudResults: ['operation', 'entity', 'id', 'status'], boundedData: ['entity', 'count', 'values'],
  configuredPath: ['configuredPath', 'databasePath'], lockingBehavior: ['operation', 'result'],
  runtimeVariant: ['runtime', 'module'], permissionFailure: ['operation', 'code'],
};
function request(input) {
  if (!fields(input, ['fixtureRoot', 'fixture', 'caseId', 'targetId', 'target'])) fail();
  const target = input.target, observe = target?.observe;
  if (!fields(target, ['observe']) || typeof observe !== 'function') fail();
  if (typeof input.fixtureRoot !== 'string' || !input.fixtureRoot || !['fork', 'upstream'].includes(input.targetId)) fail();
  return { fixtureRoot: input.fixtureRoot, fixture: input.fixture, caseId: input.caseId, targetId: input.targetId, target, observe };
}
export function adaptPB05(input) {
  try {
    const captured = request(input);
    const authority = validatePB05Fixture(captured.fixtureRoot, captured.fixture);
    const found = CASES.find(([id]) => id === captured.caseId);
    if (!found) fail();
    const [id, runtime, counts] = found, item = { id, runtime, counts };
    const value = descriptor(authority, item, captured.targetId);
    return validate(reflectApply(captured.observe, captured.target, [value]), value, item);
  } catch { return fail(); }
}
Object.freeze(adaptPB05);
