import { copy, exact, freeze, own, text } from '../lib/observation-adapter.mjs';
const fail = () => { throw new TypeError('invalid PB-02'); };
const keys = ['tools', 'commands', 'warnings', 'shortcuts', 'messageRenderers', 'sessionHandlers', 'listeners', 'widgets', 'terminalInputListeners', 'cleanup', 'fallback'];
const ids = ['full-capability', 'absent-message-renderer', 'absent-shortcut', 'absent-lifecycle-listener', 'absent-widget', 'absent-terminal-input'];
const optional = { 'message-renderer': ['messageRenderers'], shortcut: ['shortcuts'], 'lifecycle-listener': ['sessionHandlers', 'listeners'], widget: ['widgets'], 'terminal-input': ['terminalInputListeners'] };
const fixtureValues = { schemaVersion: 1, identity: 'PB-02', fixtureId: 'pb-02-registration-lifecycle-v1', procedureId: 'pb-02-registration-lifecycle-v1', normalizationId: 'pb-02-registration-observation-v1' };
const tuple = (item, fields) => JSON.stringify(fields.map((field) => item[field]));
function records(value, fields, absent = false) {
  if (!Array.isArray(value) || (absent ? value.length !== 0 : value.length < 2)) fail();
  const identities = new Set();
  for (const item of value) { exact(item, fields); if (!fields.filter((field) => field !== 'handler').every((field) => text(item[field])) || 'handler' in item && typeof item.handler !== 'boolean') fail(); const identity = tuple(item, fields.filter((field) => field !== 'handler')); if (identities.has(identity)) fail(); identities.add(identity); }
  return value;
}
function validFixture(value) {
  exact(value, ['schemaVersion', 'identity', 'fixtureId', 'procedureId', 'normalizationId', 'cases']);
  if (Object.entries(fixtureValues).some(([key, expected]) => value[key] !== expected) || !Array.isArray(value.cases) || value.cases.length !== ids.length) fail();
  for (const [index, id] of ids.entries()) { const item = value.cases[index]; const absentCapability = id === ids[0] ? null : id.slice(7); exact(item, ['id', 'absentCapability', 'requiredSubObservations']); if (item.id !== id || item.absentCapability !== absentCapability || !Array.isArray(item.requiredSubObservations) || item.requiredSubObservations.length !== keys.length || item.requiredSubObservations.some((key, offset) => key !== keys[offset])) fail(); }
  return value;
}
function observation(value, capability) {
  exact(value, keys);
  records(value.tools, ['name', 'description', 'handler']); records(value.commands, ['name', 'description', 'handler']); records(value.warnings, ['severity', 'message']); if (value.warnings.some((item) => item.severity !== 'warning')) fail();
  records(value.shortcuts, ['key', 'description', 'handler'], capability === 'shortcut'); records(value.messageRenderers, ['name', 'handler'], capability === 'message-renderer'); records(value.sessionHandlers, ['event', 'handler'], capability === 'lifecycle-listener'); records(value.listeners, ['event', 'handler'], capability === 'lifecycle-listener'); records(value.widgets, ['name', 'handler'], capability === 'widget'); records(value.terminalInputListeners, ['event', 'handler'], capability === 'terminal-input'); records(value.cleanup, ['event', 'owner']);
  if (capability === null) { if (value.fallback !== null) fail(); } else { exact(value.fallback, ['capability', 'behavior']); if (value.fallback.capability !== capability || !text(value.fallback.behavior)) fail(); }
  return freeze(value);
}
export function adaptPB02(input) { try { const request = own(input, ['fixture', 'caseId', 'observation']); const fixed = validFixture(copy(request.fixture)); if (!text(request.caseId) || !ids.includes(request.caseId)) fail(); const item = fixed.cases[ids.indexOf(request.caseId)]; return freeze({ identity: fixed.identity, fixtureId: fixed.fixtureId, procedureId: fixed.procedureId, normalizationId: fixed.normalizationId, caseId: item.id, observation: observation(copy(request.observation), item.absentCapability) }); } catch { return fail(); } }
Object.freeze(adaptPB02);
