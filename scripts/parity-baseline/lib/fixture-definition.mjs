import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const fields=['schemaVersion','identity','fixtureId','procedureId','normalizationId','cases','seeds'], selectors=['parsedAgents','parsedSubagents','frontmatter','modelSettings','effortSettings','defaults','numericValues','sessionResources','continuation','tools','shortcuts','precedence','provenance','diagnostics'], cases=['global-only','project-only','project-over-global','malformed-source','shadowed-source'];
const seeds=[['fs/pb-03/global/agents/global.md','global-agent-markdown','eeb3fe9d61cacbb7c56ba3407802ee1e7f8bfacae1962f7f87ed74f32f4b5741'],['fs/pb-03/global/profiles.json','global-profiles','22c01b543789973f4033aed47ce3a55f79afc17d9376c384aef09ead4b0abb44'],['fs/pb-03/global/settings.json','global-settings','76dc87110ef415d992564799891222f01dd01089ef221e084a09444a3a4ddb10'],['fs/pb-03/project/.pi/agents/malformed.md','malformed-source','92b921e41332497c8a7cffe3e8ea3f19dd5a4af8d03d0d796741027bffba9b07'],['fs/pb-03/project/.pi/agents/project.md','project-agent-markdown','57f5dd35a33bc3c15f8ed3c351b750a0b1504ddb478fb031d3620b565809e9c0'],['fs/pb-03/project/.pi/agents/shadowed.md','shadowed-source','77bedf9b500110d7f6aea7ae14c5b355f0253557cde0e6ee50ccc67334f6b3bc'],['fs/pb-03/project/.pi/profiles.json','project-profiles','1ad751cc91d318a07cddb4f6d1e010f2f7b97331ddf670b4ca31872fa934a4f1'],['fs/pb-03/project/.pi/settings.json','project-settings','d322ecd7597bfbdfc56ff1e2c01bf3cc3ec70c34c88cf21a6f3e57c09accdd32']];
const hashApply=Reflect.apply, hashUpdate=createHash('sha256').update, hashDigest=createHash('sha256').digest;
const fail=()=>{throw new TypeError('invalid PB-03 fixture')};
const text=value=>typeof value==='string'&&value.length>0&&!/[\u0000-\u001f\u007f]/u.test(value);
const digest=(bytes)=>{const hash=createHash('sha256');hashApply(hashUpdate,hash,[bytes]);return hashApply(hashDigest,hash,['hex']);};
const safePath=value=>text(value)&&!value.startsWith('/')&&!value.includes('\\')
  &&!value.split('/').some(part=>!part||part==='.'||part==='..');
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
  ['PB-05', 'PB-05.json', '355e3775f64c6543fb6bce418ec0bac834a271087dcc82898eccf2ad11b5e02e'],
].map(Object.freeze));
const pb05SeedAnchor = Object.freeze(['fs/pb-05/history-seed.json', 'pb-05-history-seed-v1', '9e79da443d71b4080fac4e47a3b9bcfd79534bb48e1caa8eaf83782c96ae9e29']);
const pb04FullManifestDigest = 'b07223fa7763b471049f557a11221cdadb24e508f45bebf5ebba165a4e1c26f9';

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

const pb05Apply = Reflect.apply;
const pb05Freeze = Object.freeze;
const pb05Keys = Object.keys;
const pb05Error = TypeError;
const pb05Fs = pb05Freeze({ close: fs.closeSync, fstat: fs.fstatSync, lstat: fs.lstatSync,
  open: fs.openSync, read: fs.readFileSync, realpath: fs.realpathSync.native, noFollow: fs.constants.O_NOFOLLOW,
  readOnly: fs.constants.O_RDONLY });
const pb05Path = pb05Freeze({ isAbsolute: path.isAbsolute, join: path.join, resolve: path.resolve });
const pb05Buffer = pb05Freeze({ allocate: Buffer.allocUnsafe, isBuffer: Buffer.isBuffer, owner: Buffer,
  length: Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get,
  set: Uint8Array.prototype.set });
const pb05Hash = pb05Freeze({
  create: createHash,
  digest: createHash('sha256').digest,
  update: createHash('sha256').update,
});
const pb05Json = JSON, pb05Parse = JSON.parse;
const pb05Decode = TextDecoder.prototype.decode, pb05TextDecoder = TextDecoder;
const pb05Directory = fs.Stats.prototype.isDirectory;
const pb05File = fs.Stats.prototype.isFile;
const pb05Link = fs.Stats.prototype.isSymbolicLink;
const pb05StartsWith = String.prototype.startsWith;
const pb05Files = pb05Freeze(['manifest.json', 'PB-05.json', pb05SeedAnchor[0]]);

const pb05Call = (callable, receiver, args) => pb05Apply(callable, receiver, args);
const pb05Fail = () => { throw new pb05Error('invalid PB-03 fixture'); };
const pb05Same = (left, right) => left.real === right.real
  && left.dev === right.dev
  && left.ino === right.ino
  && left.size === right.size;
const pb05Digest = (bytes) => {
  const hash = pb05Call(pb05Hash.create, undefined, ['sha256']);
  pb05Call(pb05Hash.update, hash, [bytes]); return pb05Call(pb05Hash.digest, hash, ['hex']);
};
const pb05CopyBuffer = (value) => {
  if (!pb05Call(pb05Buffer.isBuffer, pb05Buffer.owner, [value])) pb05Fail();
  let length;
  try { length = pb05Call(pb05Buffer.length, value, []); } catch { pb05Fail(); }
  const copy = pb05Call(pb05Buffer.allocate, undefined, [length]);
  pb05Call(pb05Buffer.set, copy, [value]);
  return copy;
};
const pb05Frozen = (value) => {
  if (value && typeof value === 'object') {
    const keys = pb05Call(pb05Keys, Object, [value]);
    for (let index = 0; index < keys.length; index += 1) pb05Frozen(value[keys[index]]);
    pb05Call(pb05Freeze, Object, [value]);
  }
  return value;
};
function pb05Root(root) {
  if (typeof root !== 'string' || !root || !pb05Call(pb05Path.isAbsolute, pb05Path, [root])) pb05Fail();
  const lexical = pb05Call(pb05Path.resolve, pb05Path, [root]);
  const stat = pb05Call(pb05Fs.lstat, fs, [lexical]);
  if (pb05Call(pb05Link, stat, []) || !pb05Call(pb05Directory, stat, [])) pb05Fail();
  const real = pb05Call(pb05Fs.realpath, fs, [lexical]), resolved = pb05Call(pb05Fs.lstat, fs, [real]);
  if (pb05Call(pb05Link, resolved, []) || !pb05Call(pb05Directory, resolved, [])
    || !pb05Same(
      { real, dev: stat.dev, ino: stat.ino, size: stat.size },
      { real, dev: resolved.dev, ino: resolved.ino, size: resolved.size },
    )) pb05Fail();
  return { lexical, real, dev: stat.dev, ino: stat.ino, size: stat.size };
}
function pb05Route(root, file) {
  const inspect = (candidate, directory) => {
    const stat = pb05Call(pb05Fs.lstat, fs, [candidate]);
    if (pb05Call(pb05Link, stat, []) || !pb05Call(directory ? pb05Directory : pb05File, stat, [])) pb05Fail();
    const real = pb05Call(pb05Fs.realpath, fs, [candidate]);
    if (!pb05Call(pb05StartsWith, real, [`${root.real}/`])) pb05Fail();
    return { real, dev: stat.dev, ino: stat.ino, size: stat.size };
  };
  const route = pb05Call(pb05Path.join, pb05Path, [root.lexical, file]);
  const first = pb05Call(pb05Path.join, pb05Path, [root.lexical, 'fs']), second = pb05Call(pb05Path.join, pb05Path, [first, 'pb-05']);
  const intermediates = file === pb05Files[2]
    ? [[first, inspect(first, true)], [second, inspect(second, true)]]
    : [];
  const beforeRoot = pb05Root(root.lexical), before = inspect(route, false); let fd; let bytes; let error;
  if (!pb05Same(root, beforeRoot)) pb05Fail();
  try {
    fd = pb05Call(pb05Fs.open, fs, [route, pb05Fs.readOnly | pb05Fs.noFollow]);
    const opened = pb05Call(pb05Fs.fstat, fs, [fd]);
    if (!pb05Call(pb05File, opened, []) || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) pb05Fail();
    const read = pb05Call(pb05Fs.read, fs, [fd]);
    if (!pb05Call(pb05Buffer.isBuffer, pb05Buffer.owner, [read])) pb05Fail();
    bytes = pb05CopyBuffer(read);
    const afterOpened = pb05Call(pb05Fs.fstat, fs, [fd]);
    const afterRoot = pb05Root(root.lexical), after = inspect(route, false);
    if (!pb05Same(root, beforeRoot) || !pb05Same(root, afterRoot) || !pb05Same(before, after)
      || opened.dev !== afterOpened.dev || opened.ino !== afterOpened.ino
      || opened.size !== afterOpened.size) pb05Fail();
    for (let index = 0; index < intermediates.length; index += 1) if (!pb05Same(intermediates[index][1], inspect(intermediates[index][0], true))) pb05Fail();
  } catch (caught) { error = caught; }
  finally { if (fd !== undefined) try { pb05Call(pb05Fs.close, fs, [fd]); } catch (caught) { if (!error) error = caught; } }
  if (error) throw error; return bytes;
}
export function loadPB05Authority(root) {
  try {
    const rootState = pb05Root(root), manifestBytes = pb05Route(rootState, pb05Files[0]);
    if (pb05Digest(manifestBytes) !== pb04FullManifestDigest) pb05Fail();
    const decode = (bytes) => pb05Call(pb05Decode, new pb05TextDecoder('utf-8', { fatal: true }), [bytes]);
    const manifest = pb05Call(pb05Parse, pb05Json, [decode(manifestBytes)]), fixtureBytes = pb05Route(rootState, pb05Files[1]), seedBytes = pb05Route(rootState, pb05Files[2]);
    const manifestDigest = pb05Digest(manifestBytes), fixtureDigest = pb05Digest(fixtureBytes), seedDigest = pb05Digest(seedBytes);
    if (fixtureDigest !== fixtureManifestAnchors[4][2] || seedDigest !== pb05SeedAnchor[2]
      || manifestDigest === fixtureDigest || manifestDigest === seedDigest
      || fixtureDigest === seedDigest) pb05Fail();
    return pb05Frozen({
      manifest,
      fixture: pb05Call(pb05Parse, pb05Json, [decode(fixtureBytes)]),
      seed: pb05Call(pb05Parse, pb05Json, [decode(seedBytes)]),
      fixtureDigest,
      seedDigest,
    });
  } catch { return pb05Fail(); }
}
pb05Call(pb05Freeze, Object, [loadPB05Authority]);

const authorityPaths = Object.freeze([
  ...fixtureManifestAnchors.slice(0, 4).map(([, file]) => file),
  ...eventSeedManifestAnchors.map(([, , , file]) => file),
]);

const exactOrdered = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key, index) => actual[index] === key);
};

function readAuthorityBytes(root) {
  if (!text(root)) fail();
  const rootState = pb05Root(root);
  return new Map(authorityPaths.map((file) => [file, pb05Route(rootState, file)]));
}

function validateFixtureEntry(item, index, bytes, pb05) {
  const [identity, file, sha256] = fixtureManifestAnchors[index];
  if (!exactOrdered(item, ['identity', 'path', 'sha256'])) fail();
  if (item.identity !== identity || item.path !== file || item.sha256 !== sha256) fail();
  if ((index === 4 ? pb05.fixtureDigest : digest(bytes.get(file))) !== sha256) fail();
}

function validateEventSeedEntry(item, index, bytes) {
  const [owner, caseId, eventSeedId, file, sha256] = eventSeedManifestAnchors[index];
  if (!exactOrdered(item, ['owner', 'caseId', 'eventSeedId', 'path', 'sha256'])) fail();
  if (item.owner !== owner || item.caseId !== caseId || item.eventSeedId !== eventSeedId) fail();
  if (item.path !== file || item.sha256 !== sha256 || digest(bytes.get(file)) !== sha256) fail();
}

export function validateFixtureManifest(root, input) {
  try {
    const pb05 = loadPB05Authority(root);
    const bytes = readAuthorityBytes(root);
    const value = copy(input);
    if (pb05.seed.seedId !== pb05SeedAnchor[1]) fail();
    if (!exactOrdered(value, ['schemaVersion', 'fixtures', 'eventSeeds'])) fail();
    if (value.schemaVersion !== 1 || !Array.isArray(value.fixtures)) fail();
    if (!Array.isArray(value.eventSeeds)) fail();
    if (value.fixtures.length !== fixtureManifestAnchors.length) fail();
    if (value.eventSeeds.length !== eventSeedManifestAnchors.length) fail();
    value.fixtures.forEach((item, index) => validateFixtureEntry(item, index, bytes, pb05));
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
    && manifest.fixtures.length === 5
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
      && digest(bytes.get('manifest.json')) === pb04FullManifestDigest
      && eventSeedManifestAnchors.every(([, , , file, sha]) => digest(bytes.get(file)) === sha);
    if (!hasAuthority) pb04Fail('authority');
    return frozen(value);
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('invalid PB-04 fixture:')) throw error;
    return pb04Fail('schema');
  }
}
Object.freeze(validatePB04Fixture);

const pb05Snapshot = Object.freeze({
  array: Array.isArray, arrayOwner: Array, arrayPrototype: Array.prototype, data: { enumerable: true, writable: true, configurable: true },
  define: Object.defineProperty, descriptor: Object.getOwnPropertyDescriptor, extensible: Object.isExtensible, freeze: Object.freeze,
  integer: Number.isSafeInteger, number: Number.isFinite, numberOwner: Number, objectIs: Object.is, objectOwner: Object, objectPrototype: Object.prototype,
  every: Array.prototype.every, forEach: Array.prototype.forEach, keys: Reflect.ownKeys, reflectOwner: Reflect, set: Set,
  setAdd: Set.prototype.add, setHas: Set.prototype.has, prototype: Object.getPrototypeOf, slice: Array.prototype.slice,
  some: Array.prototype.some, string: String, stringOwner: String, apply: Reflect.apply, error: TypeError,
});
const pb05SnapshotCall = (callable, receiver, args) => pb05Snapshot.apply(callable, receiver, args);
const pb05FixtureKeys = ['schemaVersion', 'identity', 'fixtureId', 'procedureId', 'normalizationId', 'cases'];
const pb05CaseKeys = ['id', 'runtime', 'seedPath', 'seedId', 'seedDigest'];
const pb05SeedKeys = ['schemaVersion', 'seedId', 'task', 'attempt', 'event', 'snapshot'];
const pb05TaskKeys = ['id', 'agent', 'mode', 'status', 'task', 'created_at', 'attempt', 'last_activity_at', 'thread_snapshot'];
const pb05AttemptKeys = ['task_id', 'attempt', 'status', 'task', 'created_at', 'last_activity_at'];
const pb05EventKeys = ['task_id', 'attempt', 'status', 'activity', 'created_at'];
const pb05ThreadKeys = ['version', 'source', 'items'];
const pb05ExpectedCases = [
  ['node-sqlite-crud', 'node-sqlite'], ['bun-sqlite-crud', 'bun-sqlite'],
  ['locked-database', 'node-sqlite'], ['permission-denied', 'node-sqlite'],
];
const pb05ExpectedManifest = fixtureManifestAnchors;
const pb05Invalid = () => { throw new pb05Snapshot.error('invalid PB-05 fixture'); };
const pb05Ordered = (value, names) => {
  const keys = pb05SnapshotCall(pb05Snapshot.keys, pb05Snapshot.reflectOwner, [value]);
  if (keys.length !== names.length) return false;
  for (let index = 0; index < keys.length; index += 1) if (typeof keys[index] !== 'string' || keys[index] !== names[index]) return false;
  return true;
};
function pb05Copy(value, seen = new pb05Snapshot.set(), profile) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!pb05SnapshotCall(pb05Snapshot.number, pb05Snapshot.numberOwner, [value]) || pb05SnapshotCall(pb05Snapshot.objectIs, pb05Snapshot.objectOwner, [value, -0])) pb05Invalid();
    return value;
  }
  if (typeof value !== 'object' || pb05SnapshotCall(pb05Snapshot.setHas, seen, [value])) pb05Invalid();
  const array = pb05SnapshotCall(pb05Snapshot.array, pb05Snapshot.arrayOwner, [value]);
  if (pb05SnapshotCall(pb05Snapshot.prototype, pb05Snapshot.objectOwner, [value]) !== (array ? pb05Snapshot.arrayPrototype : pb05Snapshot.objectPrototype)) pb05Invalid();
  pb05SnapshotCall(pb05Snapshot.setAdd, seen, [value]);
  const extensible = pb05SnapshotCall(pb05Snapshot.extensible, pb05Snapshot.objectOwner, [value]);
  if (profile !== undefined && profile !== extensible) pb05Invalid();
  const keys = pb05SnapshotCall(pb05Snapshot.keys, pb05Snapshot.reflectOwner, [value]);
  if (pb05SnapshotCall(pb05Snapshot.some, keys, [(key) => typeof key !== 'string'])) pb05Invalid();
  const names = array ? pb05SnapshotCall(pb05Snapshot.slice, keys, [0, -1]) : keys;
  if (array && (keys[keys.length - 1] !== 'length' || pb05SnapshotCall(pb05Snapshot.some, names,
    [(key, index) => key !== pb05SnapshotCall(pb05Snapshot.string, pb05Snapshot.stringOwner, [index])]))) pb05Invalid();
  const output = array ? [] : {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index], descriptor = pb05SnapshotCall(pb05Snapshot.descriptor, pb05Snapshot.objectOwner, [value, key]);
    if (!descriptor || !('value' in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) pb05Invalid();
    const length = array && key === 'length';
    if (descriptor.enumerable !== !length || descriptor.configurable !== (length ? false : extensible) || descriptor.writable !== extensible) pb05Invalid();
    if (length) {
      if (!pb05SnapshotCall(pb05Snapshot.integer, pb05Snapshot.numberOwner, [descriptor.value]) || descriptor.value !== names.length) pb05Invalid();
    } else pb05SnapshotCall(pb05Snapshot.define, pb05Snapshot.objectOwner, [output, key, { ...pb05Snapshot.data, value: pb05Copy(descriptor.value, seen, extensible) }]);
  }
  return output;
}
const pb05SameSnapshot = (left, right) => {
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return left === right;
  const leftArray = pb05SnapshotCall(pb05Snapshot.array, pb05Snapshot.arrayOwner, [left]);
  if (leftArray !== pb05SnapshotCall(pb05Snapshot.array, pb05Snapshot.arrayOwner, [right])) return false;
  const keys = pb05SnapshotCall(pb05Snapshot.keys, pb05Snapshot.reflectOwner, [left]);
  if (!pb05Ordered(right, keys)) return false;
  return pb05SnapshotCall(pb05Snapshot.every, keys, [(key) => pb05SameSnapshot(
    pb05SnapshotCall(pb05Snapshot.descriptor, pb05Snapshot.objectOwner, [left, key]).value,
    pb05SnapshotCall(pb05Snapshot.descriptor, pb05Snapshot.objectOwner, [right, key]).value,
  )]);
};
const pb05Has = (value, names) => pb05Ordered(value, names);
function pb05FixtureSchema(fixture) {
  if (!pb05Has(fixture, pb05FixtureKeys) || fixture.schemaVersion !== 1 || fixture.identity !== 'PB-05'
    || fixture.fixtureId !== 'pb-05-history-fixture-v1' || fixture.procedureId !== 'pb-05-history-observation-v1'
    || fixture.normalizationId !== 'pb-05-history-observation-v1' || !pb05SnapshotCall(pb05Snapshot.array, pb05Snapshot.arrayOwner, [fixture.cases])
    || fixture.cases.length !== pb05ExpectedCases.length) pb05Invalid();
  pb05SnapshotCall(pb05Snapshot.forEach, fixture.cases, [(item, index) => {
    const expectedCase = pb05ExpectedCases[index], id = expectedCase[0], runtime = expectedCase[1];
    if (!pb05Has(item, pb05CaseKeys) || item.id !== id || item.runtime !== runtime || item.seedPath !== pb05SeedAnchor[0]
      || item.seedId !== pb05SeedAnchor[1] || item.seedDigest !== pb05SeedAnchor[2]) pb05Invalid();
  }]);
}
function pb05SeedSchema(seed) {
  if (!pb05Has(seed, pb05SeedKeys) || seed.schemaVersion !== 1 || seed.seedId !== pb05SeedAnchor[1]) pb05Invalid();
  const task = seed.task, attempt = seed.attempt, event = seed.event, snapshot = seed.snapshot;
  if (!pb05Has(task, pb05TaskKeys) || !pb05Has(attempt, pb05AttemptKeys) || !pb05Has(event, pb05EventKeys)
    || !pb05Has(snapshot, pb05ThreadKeys) || !pb05Has(task.thread_snapshot, pb05ThreadKeys)
    || !pb05SnapshotCall(pb05Snapshot.array, pb05Snapshot.arrayOwner, [snapshot.items]) || snapshot.items.length !== 0
    || !pb05SameSnapshot(snapshot, task.thread_snapshot)) pb05Invalid();
  if (task.id !== 'pb05-task-1' || task.agent !== 'pb05-agent' || task.mode !== 'task' || task.status !== 'completed'
    || task.task !== 'PB-05 deterministic task' || task.created_at !== '2024-01-02T03:04:05.000Z' || task.attempt !== 1
    || task.last_activity_at !== '2024-01-02T03:04:06.000Z' || snapshot.version !== 1 || snapshot.source !== 'events') pb05Invalid();
  if (attempt.task_id !== task.id || attempt.attempt !== task.attempt || attempt.status !== task.status || attempt.task !== task.task
    || attempt.created_at !== task.created_at || attempt.last_activity_at !== task.last_activity_at || event.task_id !== task.id
    || event.attempt !== task.attempt || event.status !== task.status || event.activity !== 'pb05-complete' || event.created_at !== task.last_activity_at) pb05Invalid();
}
function pb05ManifestSchema(manifest) {
  if (!pb05Has(manifest, ['schemaVersion', 'fixtures', 'eventSeeds']) || manifest.schemaVersion !== 1
    || !pb05SnapshotCall(pb05Snapshot.array, pb05Snapshot.arrayOwner, [manifest.fixtures]) || manifest.fixtures.length !== pb05ExpectedManifest.length
    || !pb05SnapshotCall(pb05Snapshot.array, pb05Snapshot.arrayOwner, [manifest.eventSeeds]) || manifest.eventSeeds.length !== eventSeedManifestAnchors.length) pb05Invalid();
  pb05SnapshotCall(pb05Snapshot.forEach, manifest.fixtures, [(item, index) => {
    const expectedFixture = pb05ExpectedManifest[index], identity = expectedFixture[0], itemPath = expectedFixture[1], sha256 = expectedFixture[2];
    if (!pb05Has(item, ['identity', 'path', 'sha256']) || item.identity !== identity || item.path !== itemPath || item.sha256 !== sha256) pb05Invalid();
  }]);
  pb05SnapshotCall(pb05Snapshot.forEach, manifest.eventSeeds, [(item, index) => {
    const expectedSeed = eventSeedManifestAnchors[index], owner = expectedSeed[0], caseId = expectedSeed[1], seedId = expectedSeed[2];
    const itemPath = expectedSeed[3], sha256 = expectedSeed[4];
    if (!pb05Has(item, ['owner', 'caseId', 'eventSeedId', 'path', 'sha256']) || item.owner !== owner || item.caseId !== caseId
      || item.eventSeedId !== seedId || item.path !== itemPath || item.sha256 !== sha256) pb05Invalid();
  }]);
}
export function validatePB05Fixture(root, input) {
  try {
    const authority = loadPB05Authority(root);
    const fixture = pb05Copy(input), manifest = pb05Copy(authority.manifest), expected = pb05Copy(authority.fixture), seed = pb05Copy(authority.seed);
    pb05FixtureSchema(fixture); pb05FixtureSchema(expected); pb05SeedSchema(seed); pb05ManifestSchema(manifest);
    if (!pb05SameSnapshot(fixture, expected) || authority.fixtureDigest !== fixtureManifestAnchors[4][2] || authority.seedDigest !== pb05SeedAnchor[2]) pb05Invalid();
    const result = { fixture, seed, fixtureDigest: authority.fixtureDigest, seedDigest: authority.seedDigest };
    return pb05Frozen(result);
  } catch { return pb05Invalid(); }
}
pb05SnapshotCall(pb05Snapshot.freeze, pb05Snapshot.objectOwner, [validatePB05Fixture]);
