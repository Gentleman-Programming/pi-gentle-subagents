import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validatePB04Fixture } from '../lib/fixture-definition.mjs';
import { freeze, text } from '../lib/observation-adapter.mjs';

const FAMILIES = [
  'queued', 'running', 'terminal', 'ownership', 'dispatchOrder',
  'concurrency', 'completionOrder', 'result', 'backgroundHandoff',
];
const KINDS = [
  'task.queued', 'task.running', 'task.terminal', 'ownership.recorded',
  'dispatch.recorded', 'concurrency.sampled', 'completion.recorded',
  'result.recorded', 'background.handoff',
];
const FIELDS = [
  ['eventId', 'tick', 'taskId', 'attemptId', 'mode'],
  ['eventId', 'tick', 'taskId', 'attemptId', 'runnerId', 'mode'],
  ['eventId', 'tick', 'taskId', 'attemptId', 'state', 'resultId'],
  ['eventId', 'tick', 'taskId', 'attemptId', 'owner', 'mode'],
  ['position', 'eventId', 'tick', 'taskId', 'attemptId'],
  ['eventId', 'tick', 'activeAttemptIds', 'limit'],
  ['position', 'eventId', 'tick', 'taskId', 'attemptId', 'resultId'],
  ['eventId', 'resultId', 'taskId', 'attemptId', 'state', 'value'],
  ['eventId', 'tick', 'taskId', 'attemptId', 'owner', 'handoff'],
];
const fail = () => { throw new TypeError('invalid PB-04'); };
const frozen = (value) => { if (value && typeof value === 'object') Object.values(value).forEach(frozen); return freeze(value); };
const data = (value) => value && Object.hasOwn(value, 'value');
const profile = (value) => data(value) && value.enumerable && value.writable === value.configurable
  ? value.writable : undefined;
const coherent = (properties, mutable) => properties.every((property) => profile(property) === mutable);
const mutable = (output, key, value) => Object.defineProperty(output, key, {
  value, enumerable: true, writable: true, configurable: true,
});
function own(value, keys) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const extensible = Reflect.isExtensible(value), manifest = Reflect.ownKeys(value);
  if (manifest.length !== keys.length || manifest.some((key, index) => key !== keys[index])) fail();
  const properties = manifest.map((key) => Object.getOwnPropertyDescriptor(value, key));
  if (!coherent(properties, extensible)) fail();
  const output = {};
  for (const [index, key] of manifest.entries()) mutable(output, key, properties[index].value);
  return output;
}
function copy(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' && text(value)
    || typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) fail();
  seen.add(value);
  const prototype = Object.getPrototypeOf(value), extensible = Reflect.isExtensible(value);
  const manifest = Reflect.ownKeys(value);
  if (manifest.some((key) => typeof key === 'symbol')) fail();
  const properties = manifest.map((key) => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (profile(property) !== extensible && (!Array.isArray(value) || key !== 'length')) fail();
    return [key, property, copy(property.value, seen)];
  });
  if (Array.isArray(value)) {
    const length = properties.find(([key]) => key === 'length')?.[1];
    const indices = properties.slice(0, -1).map(([, property]) => property);
    if (prototype !== Array.prototype || !length || !data(length) || length.enumerable
      || length.configurable || length.writable !== extensible || !coherent(indices, extensible)
      || !Number.isSafeInteger(length.value) || length.value < 0
      || manifest.length !== length.value + 1
      || manifest.some((key, index) => key !== (index === length.value ? 'length' : String(index)))) fail();
    return properties.slice(0, -1).map(([, , copied]) => copied);
  }
  if (![Object.prototype, null].includes(prototype) || !coherent(properties.map(([, property]) => property), extensible)) fail();
  const output = Object.create(prototype);
  for (const [key, property, copied] of properties) mutable(output, key, copied);
  return output;
}
const ordered = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length
  && fields.every((key, index) => Object.keys(value)[index] === key);
const scalar = (value) => value === null || typeof value === 'string' || typeof value === 'boolean'
  || typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0);
const id = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{2,63}$/u.test(value);
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const equal = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const MANIFEST_DIGEST = 'b07223fa7763b471049f557a11221cdadb24e508f45bebf5ebba165a4e1c26f9';
const PB04_DIGEST = '9cc8bbc646ad530051b0e919c9c62617397b0012a678f8e89b8c91e5d401b972';
const SEEDS = [
  ['single-foreground', 'pb-04-single-foreground-events-v1', 'events/pb-04/single-foreground.json', 'bbad31dcfcaa968a7bdd830bae26cb00faa9df323c9d6e998ae02b000af82999'],
  ['serial-foreground', 'pb-04-serial-foreground-events-v1', 'events/pb-04/serial-foreground.json', 'd1da6c5fb275a1c8b34ec45f1fdf7e2fb847882c35ab9e3f6899d4fad44beb8c'],
  ['bounded-concurrency', 'pb-04-bounded-concurrency-events-v1', 'events/pb-04/bounded-concurrency.json', 'dd5c2fa54499579cbeb52f9cc1f0ca64b8c2053da4f3c65010b5ae611bf28373'],
  ['mixed-background', 'pb-04-mixed-background-events-v1', 'events/pb-04/mixed-background.json', 'b71e954d3586bebf2f4f679e3b13d615abec5daab0c8f5367ec5c1bf86ea5f17'],
];

function schema(value, fields) {
  if (!ordered(value, fields)) fail();
  return value;
}
function captureAuthority(root, caseId, readFile) {
  const expected = SEEDS.find(([id]) => id === caseId);
  if (!expected) fail();
  const files = ['manifest.json', 'PB-04.json', expected[2]];
  const snapshot = (file) => {
    const value = readFile(path.join(root, file));
    if ((typeof value !== 'string' && !Buffer.isBuffer(value))
      || Buffer.isBuffer(value) && Object.hasOwn(value, 'toString')) fail();
    return Buffer.from(value);
  };
  const bytes = new Map(files.map((file) => [file, snapshot(file)]));
  if (sha256(bytes.get('manifest.json')) !== MANIFEST_DIGEST
    || sha256(bytes.get('PB-04.json')) !== PB04_DIGEST
    || sha256(bytes.get(expected[2])) !== expected[3]) fail();
  return { expected, manifest: JSON.parse(bytes.get('manifest.json')), fixture: JSON.parse(bytes.get('PB-04.json')), seed: JSON.parse(bytes.get(expected[2])) };
}
function fixtureAuthority(fixture, capture) {
  const { expected, manifest, seed } = capture;
  const item = fixture.cases.find((entry) => entry.id === expected[0]);
  const entry = manifest.fixtures.find((value) => value.identity === 'PB-04');
  const event = manifest.eventSeeds.find((value) => value.caseId === expected[0]);
  if (!item || JSON.stringify(fixture) !== JSON.stringify(capture.fixture)
    || !entry || entry.path !== 'PB-04.json' || entry.sha256 !== PB04_DIGEST
    || !event || event.owner !== 'PB-04' || event.eventSeedId !== expected[1]
    || event.path !== expected[2] || event.sha256 !== expected[3]
    || item.eventSeedId !== expected[1] || item.eventSeedPath !== expected[2]
    || item.eventSeedDigest !== expected[3] || seed.eventSeedId !== expected[1]
    || seed.caseId !== expected[0] || !Array.isArray(seed.events)) fail();
  return { item, seed, fixtureDigest: entry.sha256 };
}
function descriptor(fixture, item, fixtureDigest, targetId) {
  const tasks = item.tasks.map(({ taskId, attemptId, resultId, mode, owner }) => freeze({
    taskId, attemptId, resultId, mode, owner,
  }));
  const value = Object.create(null);
  Object.assign(value, {
    identity: 'PB-04', caseId: item.id, fixtureId: fixture.fixtureId, fixtureDigest,
    eventSeedId: item.eventSeedId, eventSeedDigest: item.eventSeedDigest, targetId,
    clock: freeze({ tick: 0, unit: 'tick' }),
    runner: freeze({ kind: 'controlled', seed: 'pb-04-runner-v1' }),
    tasks: freeze(tasks),
  });
  return freeze(value);
}
function eventMap(seed) {
  const map = new Map();
  for (const event of seed.events) {
    if (!ordered(event, ['eventId', 'tick', 'kind', 'taskId', 'attemptId', 'resultId', 'value', 'activeAttemptIds', 'limit'])
      || !id(event.eventId) || !Number.isInteger(event.tick) || event.tick < 0
      || !KINDS.includes(event.kind) || map.has(event.eventId)) fail();
    map.set(event.eventId, event);
  }
  return map;
}
function record(value, family, index, events, tasks, used) {
  schema(value, FIELDS[family]);
  const event = events.get(value.eventId), kind = KINDS[family];
  if (!event || event.kind !== kind || used.has(value.eventId)) fail();
  used.add(value.eventId);
  const task = tasks.get(event.attemptId);
  if (family === 5) {
    if (value.tick !== event.tick || value.limit !== event.limit || !Array.isArray(value.activeAttemptIds)
      || !equal(value.activeAttemptIds, event.activeAttemptIds)) fail();
  } else {
    if (!task || value.taskId !== event.taskId || value.attemptId !== event.attemptId) fail();
    if ([0, 1, 2, 3, 4, 6, 8].includes(family) && value.tick !== event.tick) fail();
    if (family === 0 && value.mode !== task.mode) fail();
    if (family === 1 && (value.runnerId !== 'pb-04-controlled-runner' || value.mode !== task.mode)) fail();
    if (family === 2 && (value.state !== 'completed' || value.resultId !== task.resultId)) fail();
    if (family === 3 && (value.owner !== task.owner || value.mode !== task.mode)) fail();
    if (family === 4 && value.position !== index + 1) fail();
    if (family === 6 && (value.position !== index + 1 || value.resultId !== task.resultId)) fail();
    if (family === 7 && (value.resultId !== task.resultId || value.state !== 'completed'
      || !scalar(value.value) || value.value !== event.value)) fail();
    if (family === 8 && (value.owner !== 'background-supervisor' || value.handoff !== 'accepted')) fail();
  }
}
function relations(families, item, events) {
  const byAttempt = (family) => new Map(families[family].map((value) => [value.attemptId, value]));
  const queued = byAttempt(0), running = byAttempt(1), terminal = byAttempt(2);
  const ownership = byAttempt(3), result = byAttempt(7);
  if (!equal(families[4].map((value) => value.attemptId), families[1].map((value) => value.attemptId))) fail();
  if (!equal(families[6].map((value) => value.attemptId), families[2].map((value) => value.attemptId))) fail();
  for (const task of item.tasks) {
    const q = queued.get(task.attemptId), r = running.get(task.attemptId);
    const t = terminal.get(task.attemptId), o = ownership.get(task.attemptId), v = result.get(task.attemptId);
    if (!q || !r || !t || !o || !v || q.tick >= r.tick || r.tick >= t.tick) fail();
    if (o.owner !== task.owner || o.mode !== task.mode || v.taskId !== task.taskId || v.resultId !== task.resultId) fail();
    const handoffs = families[8].filter((value) => value.attemptId === task.attemptId);
    if (handoffs.length !== (task.mode === 'background' ? 1 : 0)) fail();
  }
  for (const sample of families[5]) {
    const active = families[1].filter((value) => value.tick <= sample.tick
      && sample.tick < terminal.get(value.attemptId).tick).map((value) => value.attemptId);
    if (!equal(sample.activeAttemptIds, active) || sample.limit !== item.concurrencyLimit
      || active.length > sample.limit) fail();
  }
  if (events.size !== [...families.flat()].length) fail();
}
function observation(value, descriptorValue, item, seed) {
  const output = copy(value);
  schema(output, ['identity', 'targetId', 'fixtureId', 'fixtureDigest', 'caseId', 'eventSeedId', 'eventSeedDigest', 'families']);
  for (const key of ['identity', 'targetId', 'fixtureId', 'fixtureDigest', 'caseId', 'eventSeedId', 'eventSeedDigest']) {
    if (output[key] !== descriptorValue[key]) fail();
  }
  schema(output.families, FAMILIES);
  const events = eventMap(seed), tasks = new Map(item.tasks.map((task) => [task.attemptId, task]));
  const used = new Set();
  const families = FAMILIES.map((name, family) => {
    const values = output.families[name];
    if (!Array.isArray(values)) fail();
    values.forEach((recordValue, index) => record(recordValue, family, index, events, tasks, used));
    return values;
  });
  for (const [index, kind] of KINDS.entries()) {
    const expected = [...events.values()].filter((event) => event.kind === kind).map((event) => event.eventId);
    if (!equal(families[index].map((recordValue) => recordValue.eventId), expected)) fail();
  }
  relations(families, item, events);
  return frozen(output);
}
export function adaptPB04(input, readFile = fs.readFileSync) {
  try {
    const request = own(input, ['fixtureRoot', 'fixture', 'caseId', 'targetId', 'target']);
    const target = own(request.target, ['observe']), observe = target.observe;
    if (!text(request.fixtureRoot) || !id(request.caseId) || !['fork', 'upstream'].includes(request.targetId) || typeof observe !== 'function') fail();
    const capture = captureAuthority(request.fixtureRoot, request.caseId, readFile);
    const fixture = validatePB04Fixture(request.fixtureRoot, copy(request.fixture));
    const authority = fixtureAuthority(fixture, capture);
    const value = descriptor(fixture, authority.item, authority.fixtureDigest, request.targetId);
    return observation(observe.call(target, value), value, authority.item, authority.seed);
  } catch {
    return fail();
  }
}
Object.freeze(adaptPB04);
