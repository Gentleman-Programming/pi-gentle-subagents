import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const fields=['schemaVersion','identity','fixtureId','procedureId','normalizationId','cases','seeds'], selectors=['parsedAgents','parsedSubagents','frontmatter','modelSettings','effortSettings','defaults','numericValues','sessionResources','continuation','tools','shortcuts','precedence','provenance','diagnostics'], cases=['global-only','project-only','project-over-global','malformed-source','shadowed-source'];
const seeds=[['fs/pb-03/global/agents/global.md','global-agent-markdown','eeb3fe9d61cacbb7c56ba3407802ee1e7f8bfacae1962f7f87ed74f32f4b5741'],['fs/pb-03/global/profiles.json','global-profiles','22c01b543789973f4033aed47ce3a55f79afc17d9376c384aef09ead4b0abb44'],['fs/pb-03/global/settings.json','global-settings','76dc87110ef415d992564799891222f01dd01089ef221e084a09444a3a4ddb10'],['fs/pb-03/project/.pi/agents/malformed.md','malformed-source','92b921e41332497c8a7cffe3e8ea3f19dd5a4af8d03d0d796741027bffba9b07'],['fs/pb-03/project/.pi/agents/project.md','project-agent-markdown','57f5dd35a33bc3c15f8ed3c351b750a0b1504ddb478fb031d3620b565809e9c0'],['fs/pb-03/project/.pi/agents/shadowed.md','shadowed-source','77bedf9b500110d7f6aea7ae14c5b355f0253557cde0e6ee50ccc67334f6b3bc'],['fs/pb-03/project/.pi/profiles.json','project-profiles','1ad751cc91d318a07cddb4f6d1e010f2f7b97331ddf670b4ca31872fa934a4f1'],['fs/pb-03/project/.pi/settings.json','project-settings','d322ecd7597bfbdfc56ff1e2c01bf3cc3ec70c34c88cf21a6f3e57c09accdd32']];
const fail=()=>{throw new TypeError('invalid PB-03 fixture')}, text=value=>typeof value==='string'&&value.length>0&&!/[\u0000-\u001f\u007f]/u.test(value), digest=bytes=>createHash('sha256').update(bytes).digest('hex'), safePath=value=>text(value)&&!value.startsWith('/')&&!value.includes('\\')&&!value.split('/').some(part=>!part||part==='.'||part==='..');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function copy(value,seen=new Set()) {
 if(value===null||typeof value==='string'||typeof value==='boolean') return value;
 if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0))fail();return value;}
 if(!value||typeof value!=='object'||seen.has(value))fail(); const array=Array.isArray(value); if(Object.getPrototypeOf(value)!==(array?Array.prototype:Object.prototype))fail(); seen.add(value);
 const keys=Reflect.ownKeys(value), descriptors=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(value,key)])); if(keys.some(key=>typeof key!=='string'))fail();
 const standard=descriptor=>descriptor&&'value'in descriptor&&!('get'in descriptor)&&!('set'in descriptor)&&descriptor.enumerable&&descriptor.writable&&descriptor.configurable;
 let names=keys;
 if(array){const length=descriptors.get('length'); if(!length||!('value'in length)||length.enumerable||!length.writable||length.configurable||!Number.isSafeInteger(length.value)||keys.length!==length.value+1)fail(); names=keys.filter(key=>key!=='length'); if(names.some((key,index)=>key!==String(index)))fail();}
 if(names.some(key=>!standard(descriptors.get(key))))fail(); const result=array?[]:{}; for(const key of names)result[key]=copy(descriptors.get(key).value,seen); return result;
}
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
export function validatePB03Fixture(root,input){try{if(!text(root))fail();const value=copy(input);if(!exact(value,fields)||value.schemaVersion!==1||value.identity!=='PB-03'||value.fixtureId!=='pb-03-configuration-fixture-v1'||value.procedureId!=='pb-03-seeded-configuration-v1'||value.normalizationId!=='pb-03-configuration-observation-v1'||!Array.isArray(value.cases)||!Array.isArray(value.seeds)||value.cases.length!==cases.length||value.seeds.length!==seeds.length)fail();value.cases.forEach((item,index)=>{if(!exact(item,['id','requiredSubObservations'])||item.id!==cases[index]||!Array.isArray(item.requiredSubObservations)||item.requiredSubObservations.length!==selectors.length||item.requiredSubObservations.some((name,offset)=>name!==selectors[offset]))fail();});const declared=new Set();value.seeds.forEach((item,index)=>{const[seedPath,role,sha256]=seeds[index];if(!exact(item,['path','role','sha256'])||item.path!==seedPath||item.role!==role||item.sha256!==sha256||!safePath(item.path)||declared.has(item.sha256)||digest(fs.readFileSync(path.join(root,item.path)))!==sha256)fail();declared.add(item.sha256);});return frozen(value);}catch{return fail();}}
Object.freeze(validatePB03Fixture);

const fixtureManifestAnchors = Object.freeze([
  ['PB-01', 'PB-01.json', '86c48b13224da2de87e258bd6681187b73b46f147eca947ffe0aa25c613f3093'],
  ['PB-02', 'PB-02.json', 'c7312d5567953b6357221b216aeaec1635d634a3a19e16ae89f0b61bbad15cc8'],
  ['PB-03', 'PB-03.json', 'f877f8167aab9c0512c441c3e1c68045393b74945ee1e7805997806659ae6dda'],
  ['PB-04', 'PB-04.json', '9cc8bbc646ad530051b0e919c9c62617397b0012a678f8e89b8c91e5d401b972'],
].map(Object.freeze));

const eventSeedManifestAnchors = Object.freeze([
  [
    'PB-04', 'single-foreground', 'pb-04-single-foreground-events-v1',
    'events/pb-04/single-foreground.json',
    'bbad31dcfcaa968a7bdd830bae26cb00faa9df323c9d6e998ae02b000af82999',
  ],
  [
    'PB-04', 'serial-foreground', 'pb-04-serial-foreground-events-v1',
    'events/pb-04/serial-foreground.json',
    'd1da6c5fb275a1c8b34ec45f1fdf7e2fb847882c35ab9e3f6899d4fad44beb8c',
  ],
  [
    'PB-04', 'bounded-concurrency', 'pb-04-bounded-concurrency-events-v1',
    'events/pb-04/bounded-concurrency.json',
    'dd5c2fa54499579cbeb52f9cc1f0ca64b8c2053da4f3c65010b5ae611bf28373',
  ],
  [
    'PB-04', 'mixed-background', 'pb-04-mixed-background-events-v1',
    'events/pb-04/mixed-background.json',
    'b71e954d3586bebf2f4f679e3b13d615abec5daab0c8f5367ec5c1bf86ea5f17',
  ],
].map(Object.freeze));

const authorityPaths = Object.freeze([
  'manifest.json',
  ...fixtureManifestAnchors.map(([, file]) => file),
  ...eventSeedManifestAnchors.map(([, , , file]) => file),
]);

const exactOrdered = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key, index) => actual[index] === key);
};

function readAuthorityBytes(root) {
  if (!text(root)) fail();
  return new Map(
    authorityPaths.map((file) => [file, fs.readFileSync(path.join(root, file))]),
  );
}

function validateFixtureEntry(item, index, bytes) {
  const [identity, file, sha256] = fixtureManifestAnchors[index];
  if (!exactOrdered(item, ['identity', 'path', 'sha256'])) fail();
  if (item.identity !== identity || item.path !== file || item.sha256 !== sha256) fail();
  if (digest(bytes.get(file)) !== sha256) fail();
}

function validateEventSeedEntry(item, index, bytes) {
  const [owner, caseId, eventSeedId, file, sha256] = eventSeedManifestAnchors[index];
  if (!exactOrdered(item, ['owner', 'caseId', 'eventSeedId', 'path', 'sha256'])) fail();
  if (item.owner !== owner || item.caseId !== caseId || item.eventSeedId !== eventSeedId) fail();
  if (item.path !== file || item.sha256 !== sha256 || digest(bytes.get(file)) !== sha256) fail();
}

export function validateFixtureManifest(root, input) {
  try {
    const bytes = readAuthorityBytes(root);
    const value = copy(input);
    if (!exactOrdered(value, ['schemaVersion', 'fixtures', 'eventSeeds'])) fail();
    if (value.schemaVersion !== 1 || !Array.isArray(value.fixtures)) fail();
    if (!Array.isArray(value.eventSeeds)) fail();
    if (value.fixtures.length !== fixtureManifestAnchors.length) fail();
    if (value.eventSeeds.length !== eventSeedManifestAnchors.length) fail();
    value.fixtures.forEach((item, index) => validateFixtureEntry(item, index, bytes));
    value.eventSeeds.forEach((item, index) => validateEventSeedEntry(item, index, bytes));
    return frozen(value);
  } catch {
    return fail();
  }
}
Object.freeze(validateFixtureManifest);

const pb04Read = fs.readFileSync;
const pb04Cases = ['single-foreground', 'serial-foreground', 'bounded-concurrency', 'mixed-background'];
const pb04Kinds = [
  'task.queued',
  'task.running',
  'task.terminal',
  'ownership.recorded',
  'dispatch.recorded',
  'concurrency.sampled',
  'completion.recorded',
  'result.recorded',
  'background.handoff',
];
const pb04Counts = [3, 6, 9, 10];
const pb04EventIds = [
  ['sf-q', 'sf-r', 'sf-o', 'sf-d', 'sf-c1', 'sf-c2', 'sf-c3', 'sf-t', 'sf-co', 'sf-result'],
  ['ser-q1', 'ser-q2', 'ser-r1', 'ser-o1', 'ser-d1', 'ser-c1', 'ser-c2', 'ser-c3', 'ser-t1', 'ser-co1',
    'ser-result1', 'ser-r2', 'ser-o2', 'ser-d2', 'ser-c4', 'ser-c5', 'ser-c6', 'ser-t2', 'ser-co2', 'ser-result2'],
  ['bc-q1', 'bc-q2', 'bc-q3', 'bc-r1', 'bc-o1', 'bc-d1', 'bc-c1', 'bc-r2', 'bc-o2', 'bc-d2',
    'bc-c2', 'bc-c3', 'bc-t2', 'bc-co2', 'bc-result2', 'bc-c4', 'bc-r3', 'bc-o3', 'bc-d3', 'bc-c5',
    'bc-c6', 'bc-t1', 'bc-co1', 'bc-result1', 'bc-c7', 'bc-c8', 'bc-c9', 'bc-t3', 'bc-co3', 'bc-result3'],
  ['mb-q1', 'mb-q2', 'mb-q3', 'mb-r1', 'mb-o1', 'mb-d1', 'mb-c1', 'mb-r2', 'mb-o2', 'mb-d2',
    'mb-c2', 'mb-c3', 'mb-t2', 'mb-co2', 'mb-result2', 'mb-h2', 'mb-c4', 'mb-r3', 'mb-o3', 'mb-d3',
    'mb-c5', 'mb-c6', 'mb-t1', 'mb-co1', 'mb-result1', 'mb-c7', 'mb-c8', 'mb-c9', 'mb-c10', 'mb-t3',
    'mb-co3', 'mb-result3'],
];
const pb04Results = [['single-complete'], [1, 2], [true, false, null], [0, 'background-complete', true]];
const taskKeys = ['taskId', 'attemptId', 'resultId', 'mode', 'owner'];
const pb04Completions = [
  ['sf-attempt-1'], ['ser-attempt-1', 'ser-attempt-2'],
  ['bc-attempt-2', 'bc-attempt-1', 'bc-attempt-3'], ['mb-attempt-2', 'mb-attempt-1', 'mb-attempt-3'],
];
const pb04Tasks = [
  [['sf-task-1', 'sf-attempt-1', 'sf-result-1', 'foreground', 'foreground-parent']],
  [['ser-task-1', 'ser-attempt-1', 'ser-result-1', 'foreground', 'foreground-parent'], ['ser-task-2', 'ser-attempt-2', 'ser-result-2', 'foreground', 'foreground-parent']],
  [
    ['bc-task-1', 'bc-attempt-1', 'bc-result-1', 'foreground', 'foreground-parent'], ['bc-task-2', 'bc-attempt-2', 'bc-result-2', 'foreground', 'foreground-parent'],
    ['bc-task-3', 'bc-attempt-3', 'bc-result-3', 'foreground', 'foreground-parent'],
  ],
  [
    ['mb-task-1', 'mb-attempt-1', 'mb-result-1', 'foreground', 'foreground-parent'], ['mb-task-2', 'mb-attempt-2', 'mb-result-2', 'background', 'background-supervisor'],
    ['mb-task-3', 'mb-attempt-3', 'mb-result-3', 'foreground', 'foreground-parent'],
  ],
].map((tasks) => tasks.map((values) => Object.fromEntries(taskKeys.map((key, index) => [key, values[index]]))));
const pb04Dispatches = pb04Tasks.map((tasks) => tasks.map(({ attemptId }) => attemptId));
const pb04MaxActive = [1, 1, 2, 2];
const pb04EventKeys = [
  'eventId', 'tick', 'kind', 'taskId', 'attemptId', 'resultId', 'value', 'activeAttemptIds', 'limit',
];
const fixtureKeys = ['schemaVersion', 'identity', 'fixtureId', 'procedureId', 'normalizationId', 'cases'];
const caseKeys = ['id', 'eventSeedPath', 'eventSeedId', 'eventSeedDigest', 'mode', 'concurrencyLimit', 'tasks'];
const seedKeys = ['schemaVersion', 'eventSeedId', 'caseId', 'events'];
const eventKindsWithResults = ['task.terminal', 'completion.recorded', 'result.recorded'];
const requiredTaskEventKinds = [
  'task.queued', 'task.running', 'task.terminal', 'ownership.recorded',
  'dispatch.recorded', 'completion.recorded', 'result.recorded',
];

const id = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{2,63}$/u.test(value);
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const scalar = (value) => value === null
  || typeof value === 'string'
  || typeof value === 'boolean'
  || typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0);
const pb04Fail = (reason) => { throw new TypeError(`invalid PB-04 fixture: ${reason}`); };
const equal = (left, right, keys) => left.length === right.length
  && left.every((item, index) => keys.every((key) => item[key] === right[index][key]));

function pb04Bytes(root) {
  if (!text(root)) pb04Fail('root');
  const files = ['manifest.json', 'PB-04.json', ...eventSeedManifestAnchors.map(([, , , file]) => file)];
  return new Map(files.map((file) => [file, pb04Read(path.join(root, file))]));
}

function pb04Document(value) {
  const hasDocumentSchema = exactOrdered(value, fixtureKeys)
    && value.schemaVersion === 1
    && value.identity === 'PB-04'
    && value.fixtureId === 'pb-04-controlled-execution-fixture-v1'
    && value.procedureId === 'pb-04-controlled-execution-v1'
    && value.normalizationId === 'pb-04-execution-observation-v1'
    && Array.isArray(value.cases)
    && value.cases.length === 4;
  if (!hasDocumentSchema) pb04Fail('schema');

  value.cases.forEach((item, index) => {
    const [, , seedId, file] = eventSeedManifestAnchors[index];
    const hasCaseSchema = exactOrdered(item, caseKeys)
      && item.id === pb04Cases[index]
      && item.eventSeedPath === file
      && item.eventSeedId === seedId
      && hash(item.eventSeedDigest)
      && item.mode === ['foreground', 'foreground', 'foreground', 'mixed'][index]
      && item.concurrencyLimit === [1, 1, 2, 2][index]
      && Array.isArray(item.tasks)
      && item.tasks.every((task) => exactOrdered(task, taskKeys))
        && equal(item.tasks, pb04Tasks[index], taskKeys);
    if (!hasCaseSchema) pb04Fail('task');
  });
}

function pb04Event(event, tasks, limit) {
  const hasEventSchema = exactOrdered(event, pb04EventKeys)
    && id(event.eventId)
    && Number.isInteger(event.tick)
    && event.tick >= 0
    && pb04Kinds.includes(event.kind);
  if (!hasEventSchema) pb04Fail('schema');

  const task = tasks.find((item) => item.taskId === event.taskId && item.attemptId === event.attemptId);
  const isSample = event.kind === 'concurrency.sampled';
  const hasResult = eventKindsWithResults.includes(event.kind);
  if (event.kind === 'background.handoff' && event.resultId !== null) pb04Fail('result');

  const hasSampleShape = event.taskId === null
    && event.attemptId === null
    && event.resultId === null
    && event.value === null
    && Array.isArray(event.activeAttemptIds)
    && event.limit === limit
    && event.activeAttemptIds.length > 0
    && event.activeAttemptIds.length <= limit
    && new Set(event.activeAttemptIds).size === event.activeAttemptIds.length
    && event.activeAttemptIds.every((attempt) => tasks.some((item) => item.attemptId === attempt));
  const hasTaskShape = task
    && (hasResult ? event.resultId === task.resultId : event.resultId === null)
    && (event.kind === 'result.recorded' ? scalar(event.value) : event.value === null)
    && event.activeAttemptIds === null
    && event.limit === null;
  if (!(isSample ? hasSampleShape : hasTaskShape)) pb04Fail(isSample ? 'concurrency' : 'event');
  return task;
}

function pb04Manifest(manifest, fixture) {
  const hasManifestSchema = exactOrdered(manifest, ['schemaVersion', 'fixtures', 'eventSeeds'])
    && manifest.schemaVersion === 1
    && Array.isArray(manifest.fixtures)
    && Array.isArray(manifest.eventSeeds)
    && manifest.fixtures.length === 4
    && manifest.eventSeeds.length === 4;
  if (!hasManifestSchema) pb04Fail('schema');

  manifest.fixtures.forEach((entry, index) => {
    const [identity, file] = fixtureManifestAnchors[index];
    if (!exactOrdered(entry, ['identity', 'path', 'sha256'])
      || entry.identity !== identity || entry.path !== file || !hash(entry.sha256)) pb04Fail('manifest');
  });
  manifest.eventSeeds.forEach((entry, index) => {
    const item = fixture.cases[index];
    if (!exactOrdered(entry, ['owner', 'caseId', 'eventSeedId', 'path', 'sha256'])
      || entry.owner !== 'PB-04' || entry.caseId !== item.id || entry.eventSeedId !== item.eventSeedId
      || entry.path !== item.eventSeedPath || entry.sha256 !== item.eventSeedDigest) pb04Fail('manifest');
  });
}

function pb04Seed(seed, descriptor, index) {
  if (!exactOrdered(seed, seedKeys) || seed.schemaVersion !== 1
    || seed.eventSeedId !== descriptor.eventSeedId || seed.caseId !== descriptor.id
    || !Array.isArray(seed.events)) pb04Fail('schema');

  const groups = new Map(pb04Kinds.map((kind) => [kind, []]));
  const ids = new Set();
  let previousTick = -1;
  for (const event of seed.events) {
    const task = pb04Event(event, descriptor.tasks, descriptor.concurrencyLimit);
    if (event.eventId !== pb04EventIds[index][ids.size]) pb04Fail('event');
      if (event.tick <= previousTick || ids.has(event.eventId)) pb04Fail('timing');
    previousTick = event.tick;
    ids.add(event.eventId);
    groups.get(event.kind).push([event, task]);
  }

  const hasExpectedCardinality = groups.get('concurrency.sampled').length === pb04Counts[index]
    && requiredTaskEventKinds.every((kind) => groups.get(kind).length === descriptor.tasks.length)
    && groups.get('background.handoff').length === descriptor.tasks.filter((task) => task.mode === 'background').length;
  if (!hasExpectedCardinality) pb04Fail('cardinality');

  const eventFor = (kind, attempt) => groups.get(kind).find(([item]) => item.attemptId === attempt)?.[0];
  const running = groups.get('task.running').map(([item]) => item);
  const terminal = groups.get('task.terminal').map(([item]) => item);
  const dispatch = groups.get('dispatch.recorded').map(([item]) => item);
  const completion = groups.get('completion.recorded').map(([item]) => item);
  for (const task of descriptor.tasks) {
    const queued = eventFor('task.queued', task.attemptId);
    const runningEvent = eventFor('task.running', task.attemptId);
    const done = eventFor('task.terminal', task.attemptId);
    const owner = eventFor('ownership.recorded', task.attemptId);
    const result = eventFor('result.recorded', task.attemptId);
    const handoff = eventFor('background.handoff', task.attemptId);
    if (!queued || !runningEvent || !done || !owner || !result
      || queued.tick >= runningEvent.tick || runningEvent.tick >= done.tick) pb04Fail('timing');
    if (!equal([done], [eventFor('completion.recorded', task.attemptId)], ['taskId', 'attemptId', 'resultId'])
      || !equal([done], [result], ['taskId', 'attemptId', 'resultId'])
      || result.value !== pb04Results[index][descriptor.tasks.indexOf(task)]
          || Boolean(handoff) !== (task.mode === 'background')
      || handoff && (handoff.resultId !== null || handoff.value !== null)) pb04Fail('result');
  }

  if (!equal(running, dispatch, ['taskId', 'attemptId'])
    || !equal(terminal, completion, ['taskId', 'attemptId', 'resultId'])
    || dispatch.map((item) => item.attemptId).join() !== pb04Dispatches[index].join()
    || completion.map((item) => item.attemptId).join() !== pb04Completions[index].join()) pb04Fail('projection');
  const activeAt = (tick) => running.filter((run) => run.tick <= tick
    && tick < eventFor('task.terminal', run.attemptId).tick).map((run) => run.attemptId);
  const activeCounts = seed.events.map((event) => activeAt(event.tick).length);
  if (activeCounts.some((count) => count > descriptor.concurrencyLimit)
    || Math.max(...activeCounts) !== pb04MaxActive[index]) pb04Fail('concurrency');
  for (const [sample] of groups.get('concurrency.sampled')) {
    if (sample.activeAttemptIds.join() !== activeAt(sample.tick).join()) pb04Fail('concurrency');
  }
}

export function validatePB04Fixture(root, input) {
  try {
    const bytes = pb04Bytes(root);
    const value = copy(input);
    const fixture = JSON.parse(bytes.get('PB-04.json'));
    const manifest = JSON.parse(bytes.get('manifest.json'));
    pb04Document(value);
    pb04Document(fixture);
    pb04Manifest(manifest, fixture);
    fixture.cases.forEach((item, index) => {
      pb04Seed(JSON.parse(bytes.get(item.eventSeedPath)), item, index);
    });

    const hasAuthority = JSON.stringify(value) === JSON.stringify(fixture)
      && manifest.fixtures.every((item, index) => equal([item], [{
        identity: fixtureManifestAnchors[index][0],
        path: fixtureManifestAnchors[index][1],
        sha256: fixtureManifestAnchors[index][2],
      }], ['identity', 'path', 'sha256']))
      && manifest.eventSeeds.every((item, index) => equal([item], [{
        owner: eventSeedManifestAnchors[index][0],
        caseId: eventSeedManifestAnchors[index][1],
        eventSeedId: eventSeedManifestAnchors[index][2],
        path: eventSeedManifestAnchors[index][3],
        sha256: eventSeedManifestAnchors[index][4],
      }], ['owner', 'caseId', 'eventSeedId', 'path', 'sha256']))
      && digest(bytes.get('PB-04.json')) === fixtureManifestAnchors[3][2]
      && eventSeedManifestAnchors.every(([, , , file, sha]) => digest(bytes.get(file)) === sha);
    if (!hasAuthority) pb04Fail('authority');
    return frozen(value);
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('invalid PB-04 fixture:')) throw error;
    return pb04Fail('schema');
  }
}
Object.freeze(validatePB04Fixture);
