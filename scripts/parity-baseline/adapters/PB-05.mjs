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
const intrinsic = Object.freeze({ apply: Reflect.apply, array: Array.isArray, arrayPrototype: Array.prototype,
  create: Object.create, define: Object.defineProperty, descriptor: Object.getOwnPropertyDescriptor,
  extensible: Object.isExtensible, finite: Number.isFinite, freeze: Object.freeze, hasOwn: Object.hasOwn,
  is: Object.is, keys: Reflect.ownKeys, objectPrototype: Object.prototype, prototype: Object.getPrototypeOf,
  set: Set, setAdd: Set.prototype.add, setHas: Set.prototype.has, type: TypeError });
const call = (fn, receiver, args) => intrinsic.apply(fn, receiver, args);
const fail = () => { throw new intrinsic.type('invalid PB-05'); };
const owns = (value, key) => call(intrinsic.hasOwn, Object, [value, key]);
function data(value, enumerable = true, writable = true, configurable = true) {
  const output = call(intrinsic.create, Object, [null]);
  output.value = value; output.enumerable = enumerable; output.writable = writable; output.configurable = configurable;
  return output;
}
function dataValue(descriptor, enumerable, writable, configurable) {
  if (!descriptor || !owns(descriptor, 'value') || owns(descriptor, 'get') || owns(descriptor, 'set')
    || !owns(descriptor, 'enumerable') || !owns(descriptor, 'writable') || !owns(descriptor, 'configurable')
    || descriptor.enumerable !== enumerable || descriptor.writable !== writable || descriptor.configurable !== configurable) fail();
  return descriptor.value;
}
function valueOf(descriptor) {
  if (!descriptor || !owns(descriptor, 'value') || owns(descriptor, 'get') || owns(descriptor, 'set')) fail();
  return descriptor.value;
}
function consistent(profile, extensible) {
  if (profile[0] && profile[1] !== extensible) fail();
  profile[0] = true; profile[1] = extensible;
}
function append(array, value) { call(intrinsic.define, Object, [array, array.length, data(value)]); }
function fields(value, names) {
  if (!value || typeof value !== 'object' || call(intrinsic.array, Array, [value])) return false;
  const keys = call(intrinsic.keys, Reflect, [value]);
  if (keys.length !== names.length) return false;
  for (let index = 0; index < keys.length; index += 1) if (keys[index] !== names[index]) return false;
  return true;
}
function snapshot(value, seen = new intrinsic.set(), profile = [false, false]) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!call(intrinsic.finite, Number, [value]) || call(intrinsic.is, Object, [value, -0])) fail();
    return value;
  }
  if (!value || typeof value !== 'object' || call(intrinsic.setHas, seen, [value])) fail();
  const array = call(intrinsic.array, Array, [value]), extensible = call(intrinsic.extensible, Object, [value]);
  if (call(intrinsic.prototype, Object, [value]) !== (array ? intrinsic.arrayPrototype : intrinsic.objectPrototype)) fail();
  consistent(profile, extensible); call(intrinsic.setAdd, seen, [value]);
  const keys = call(intrinsic.keys, Reflect, [value]), output = array ? [] : call(intrinsic.create, Object, [intrinsic.objectPrototype]);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index], length = array && key === 'length';
    if (typeof key !== 'string') fail();
    const item = dataValue(call(intrinsic.descriptor, Object, [value, key]), !length, extensible, length ? false : extensible);
    if (length) { if (index !== keys.length - 1 || item !== index) fail(); }
    else call(intrinsic.define, Object, [output, key, data(snapshot(item, seen, profile))]);
  }
  return output;
}
function read(value, names, profile, transform, first) {
  if (!value || typeof value !== 'object' || call(intrinsic.array, Array, [value])
    || call(intrinsic.prototype, Object, [value]) !== intrinsic.objectPrototype) fail();
  const extensible = call(intrinsic.extensible, Object, [value]); consistent(profile, extensible);
  const keys = call(intrinsic.keys, Reflect, [value]);
  if (keys.length !== names.length) fail();
  for (let index = 0; index < keys.length; index += 1) if (keys[index] !== names[index]) fail();
  const output = call(intrinsic.create, Object, [intrinsic.objectPrototype]);
  const copy = (index) => {
    const key = keys[index], item = dataValue(call(intrinsic.descriptor, Object, [value, key]), true, extensible, extensible);
    call(intrinsic.define, Object, [output, key, data(transform(key, item))]);
  };
  let firstIndex = -1;
  for (let index = 0; index < keys.length; index += 1) if (keys[index] === first) firstIndex = index;
  if (firstIndex >= 0) copy(firstIndex);
  for (let index = 0; index < keys.length; index += 1) if (index !== firstIndex) copy(index);
  return output;
}
function frozen(value) {
  if (value && typeof value === 'object') {
    const keys = call(intrinsic.keys, Reflect, [value]);
    for (let index = 0; index < keys.length; index += 1) frozen(valueOf(call(intrinsic.descriptor, Object, [value, keys[index]])));
    return call(intrinsic.freeze, Object, [value]);
  }
  return value;
}
function same(left, right) {
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return left === right;
  const leftKeys = call(intrinsic.keys, Reflect, [left]), rightKeys = call(intrinsic.keys, Reflect, [right]);
  if (call(intrinsic.array, Array, [left]) !== call(intrinsic.array, Array, [right]) || leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index] || !same(
      valueOf(call(intrinsic.descriptor, Object, [left, leftKeys[index]])),
      valueOf(call(intrinsic.descriptor, Object, [right, rightKeys[index]])),
    )) return false;
  }
  return true;
}
function descriptor(authority, item, targetId) {
  const output = call(intrinsic.create, Object, [null]);
  const names = ['identity', 'caseId', 'fixtureId', 'fixtureDigest', 'seedId', 'seedDigest', 'targetId', 'runtime', 'seed'];
  const values = [
    'PB-05', item.id, authority.fixture.fixtureId, authority.fixtureDigest, authority.seed.seedId,
    authority.seedDigest, targetId, item.runtime, snapshot(authority.seed),
  ];
  for (let index = 0; index < names.length; index += 1) call(intrinsic.define, Object, [output, names[index], data(values[index])]);
  return frozen(output);
}
function expected(seed, caseId, runtime) {
  const result = call(intrinsic.create, Object, [intrinsic.objectPrototype]);
  for (let index = 0; index < FAMILIES.length; index += 1) call(intrinsic.define, Object, [result, FAMILIES[index], data([])]);
  append(result.runtimeVariant, { runtime, module: runtime === 'node-sqlite' ? 'node:sqlite' : 'bun:sqlite' });
  if (caseId === 'permission-denied') { append(result.permissionFailure, { operation: 'open-configured-path', code: 'EACCES' }); return result; }
  append(result.initialization, { databasePath: PATH, opened: true });
  const tables = ['subagent_tasks', 'subagent_task_attempts', 'subagent_events'];
  for (let index = 0; index < tables.length; index += 1) append(result.migration, { table: tables[index], applied: true });
  append(result.configuredPath, { configuredPath: PATH, databasePath: PATH });
  append(result.lockingBehavior, caseId === 'locked-database'
    ? { operation: 'write-under-exclusive-lock', result: 'SQLITE_BUSY' }
    : { operation: 'write-under-unlocked-db', result: 'accepted' });
  if (caseId === 'locked-database') return result;
  const operations = [
    ['insert', 'task', seed.task.id, seed.task.status], ['insert', 'attempt', seed.attempt.task_id, seed.attempt.status],
    ['insert', 'event', seed.event.task_id, seed.event.status], ['read', 'task', seed.task.id, seed.task.status],
    ['read', 'attempt', seed.attempt.task_id, seed.attempt.status], ['read', 'event', seed.event.task_id, seed.event.status],
    ['read', 'snapshot', seed.task.id, seed.task.status],
  ];
  for (let index = 0; index < operations.length; index += 1) {
    const row = operations[index]; append(result.crudResults, { operation: row[0], entity: row[1], id: row[2], status: row[3] });
  }
  const bounded = [
    ['task', seed.task], ['attempt', seed.attempt], ['event', seed.event],
    ['snapshot', seed.snapshot],
  ];
  for (let index = 0; index < bounded.length; index += 1) {
    append(result.boundedData, { entity: bounded[index][0], count: 1, values: [bounded[index][1]] });
  }
  return result;
}
function validate(value, descriptorValue, item) {
  const output = snapshot(value), familyData = expected(descriptorValue.seed, item.id, item.runtime);
  if (!fields(output, ['identity', 'targetId', 'fixtureId', 'fixtureDigest', 'caseId', 'seedId', 'seedDigest', 'families'])) fail();
  const identities = ['identity', 'targetId', 'fixtureId', 'fixtureDigest', 'caseId', 'seedId', 'seedDigest'];
  for (let index = 0; index < identities.length; index += 1) if (output[identities[index]] !== descriptorValue[identities[index]]) fail();
  if (!fields(output.families, FAMILIES)) fail();
  for (let index = 0; index < FAMILIES.length; index += 1) {
    const name = FAMILIES[index], actual = output.families[name], expectedValues = familyData[name];
    if (!call(intrinsic.array, Array, [actual]) || actual.length !== item.counts[index]) fail();
    for (let record = 0; record < actual.length; record += 1) if (!fields(actual[record], schemas[name])) fail();
    if (!same(actual, expectedValues)) fail();
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
  const profile = [false, false], seen = new intrinsic.set(); call(intrinsic.setAdd, seen, [input]);
  const captured = read(input, ['fixtureRoot', 'fixture', 'caseId', 'targetId', 'target'], profile, (key, item) => {
    if (key !== 'target') return snapshot(item, seen, profile);
    if (call(intrinsic.setHas, seen, [item])) fail(); call(intrinsic.setAdd, seen, [item]);
    const targetData = read(item, ['observe'], profile, (_name, observe) => observe);
    if (typeof targetData.observe !== 'function') fail(); return { target: item, observe: targetData.observe };
  }, 'target');
  if (typeof captured.fixtureRoot !== 'string' || !captured.fixtureRoot || (captured.targetId !== 'fork' && captured.targetId !== 'upstream')) fail();
  return {
    fixtureRoot: captured.fixtureRoot, fixture: captured.fixture, caseId: captured.caseId,
    targetId: captured.targetId, target: captured.target.target,
    observe: captured.target.observe,
  };
}
export function adaptPB05(input) {
  try {
    const captured = request(input);
    const authority = validatePB05Fixture(captured.fixtureRoot, captured.fixture);
    let row;
    for (let index = 0; index < CASES.length; index += 1) if (CASES[index][0] === captured.caseId) row = CASES[index];
    if (!row) fail();
    const item = { id: row[0], runtime: row[1], counts: row[2] }, value = descriptor(authority, item, captured.targetId);
    return validate(call(intrinsic.apply, Reflect, [captured.observe, captured.target, [value]]), value, item);
  } catch { return fail(); }
}
call(intrinsic.freeze, Object, [adaptPB05]);
