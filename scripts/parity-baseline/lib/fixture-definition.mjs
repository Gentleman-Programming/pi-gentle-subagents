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
