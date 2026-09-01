import { copy, exact, freeze, own, text } from '../lib/observation-adapter.mjs';
const fail = () => { throw new TypeError('invalid PB-01'); };
const keys = ['packageIdentity', 'packedFiles', 'entryPoints', 'extensionDeclarations', 'skillDeclarations', 'peerDeclarations', 'verificationResult', 'installResult', 'updateResult', 'loadResult'];
const selectors = [...keys];
const fixtureValues = { schemaVersion: 1, identity: 'PB-01', fixtureId: 'pb-01-local-package-lifecycle-v1', procedureId: 'pb-01-local-package-lifecycle-v1', normalizationId: 'pb-01-package-observation-v1', caseId: 'local-package-lifecycle' };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const unique = (items) => new Set(items).size === items.length;
const safePath = (value) => text(value) && !/^[a-z]:\//iu.test(value) && !value.includes('\\') && !value.startsWith('/') && !value.split('/').some((part) => !part || part === '.' || part === '..');
const list = (value) => Array.isArray(value) && value.every(text) && unique(value);
const status = (value) => value === 'passed' || value === 'failed';
const result = (value, installed) => { exact(value, installed ? ['status', 'exit', 'installedPath'] : ['status', 'exit', 'resourceCount']); if (!status(value.status) || !Number.isSafeInteger(value.exit) || value.exit < 0 || (installed ? !safePath(value.installedPath) : !Number.isSafeInteger(value.resourceCount) || value.resourceCount < 0)) fail(); return value; };
function validFixture(value) {
  exact(value, ['schemaVersion', 'identity', 'fixtureId', 'procedureId', 'normalizationId', 'cases']);
  if (Object.entries(fixtureValues).some(([key, expected]) => key === 'caseId' ? false : value[key] !== expected) || !Array.isArray(value.cases) || value.cases.length !== 1) fail();
  const item = value.cases[0]; exact(item, ['id', 'requiredSubObservations']);
  if (item.id !== fixtureValues.caseId || !Array.isArray(item.requiredSubObservations) || item.requiredSubObservations.length !== selectors.length || item.requiredSubObservations.some((item, index) => item !== selectors[index])) fail(); return value;
}
function observation(value) {
  exact(value, keys); exact(value.packageIdentity, ['name', 'version', 'nodeRange', 'piRange']); if (!Object.values(value.packageIdentity).every(text)) fail();
  for (const item of value.packedFiles) { exact(item, ['path', 'sha256', 'size']); if (!safePath(item.path) || !/^[a-f0-9]{64}$/u.test(item.sha256) || !Number.isSafeInteger(item.size) || item.size < 0) fail(); } if (!unique(value.packedFiles.map((item) => item.path))) fail();
  for (const item of value.entryPoints) { exact(item, ['name', 'path']); if (!text(item.name) || !safePath(item.path)) fail(); } if (!unique(value.entryPoints.map((item) => item.name))) fail();
  if (![value.extensionDeclarations, value.skillDeclarations].every(list)) fail();
  for (const item of value.peerDeclarations) { exact(item, ['name', 'range', 'optional']); if (!text(item.name) || !text(item.range) || typeof item.optional !== 'boolean') fail(); } if (!unique(value.peerDeclarations.map((item) => item.name))) fail();
  result(value.verificationResult); result(value.installResult, true); result(value.updateResult, true); exact(value.loadResult, ['status', 'exit', 'extensionLoadEvidence', 'skillLoadEvidence']); if (!status(value.loadResult.status) || !Number.isSafeInteger(value.loadResult.exit) || value.loadResult.exit < 0 || ![value.loadResult.extensionLoadEvidence, value.loadResult.skillLoadEvidence].every(list)) fail();
  return freeze({ packageIdentity: value.packageIdentity, packedFiles: freeze([...value.packedFiles].sort((a, b) => compare(a.path, b.path))), entryPoints: freeze([...value.entryPoints].sort((a, b) => compare(a.name, b.name))), extensionDeclarations: freeze([...value.extensionDeclarations].sort(compare)), skillDeclarations: freeze([...value.skillDeclarations].sort(compare)), peerDeclarations: freeze([...value.peerDeclarations].sort((a, b) => compare(a.name, b.name))), verificationResult: value.verificationResult, installResult: value.installResult, updateResult: value.updateResult, loadResult: value.loadResult });
}
export function adaptPB01(input) { const request = own(input, ['fixture', 'observation']); const fixed = validFixture(copy(request.fixture)); return freeze({ identity: fixed.identity, fixtureId: fixed.fixtureId, procedureId: fixed.procedureId, normalizationId: fixed.normalizationId, observation: observation(copy(request.observation)) }); }
Object.freeze(adaptPB01);
