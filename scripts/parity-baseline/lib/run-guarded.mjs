const controls = /[\0-\x1f\x7f-\x9f]/u;
const fail = () => { throw new TypeError('invalid guarded run'); };
const guarded = (action) => { try { return action(); } catch { return fail(); } };
const safeText = (value) => typeof value === 'string' && !controls.test(value);
const plain = (value) => guarded(() => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype);

function dataValues(value, frozen = false) {
  return guarded(() => {
    if (!plain(value) || Object.getOwnPropertySymbols(value).length || (frozen !== null && Object.isFrozen(value) !== frozen)) fail();
    const result = {}; const names = Object.getOwnPropertyNames(value);
    for (const key of names) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || (frozen !== null && (descriptor.configurable === frozen || descriptor.writable === frozen))) fail();
      Object.defineProperty(result, key, { value: descriptor.value, enumerable: true });
    }
    return Object.freeze(result);
  });
}
function exactData(values, keys) {
  if (Object.keys(values).length !== keys.length || keys.some((key) => !Object.hasOwn(values, key))) fail();
  return values;
}
function ownData(value, keys, frozen = false) { return exactData(dataValues(value, frozen), keys); }

function copy(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) || (typeof value === 'string' && safeText(value))) return value;
  if (!value || typeof value !== 'object') fail();
  return guarded(() => {
    if (seen.has(value) || Object.getOwnPropertySymbols(value).length) fail();
    seen.add(value);
    if (Array.isArray(value)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (!lengthDescriptor || lengthDescriptor.enumerable || lengthDescriptor.configurable || typeof lengthDescriptor.writable !== 'boolean' || !Object.hasOwn(lengthDescriptor, 'value') || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) fail();
      const length = lengthDescriptor.value;
      if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertyNames(value).length !== length + 1) fail();
      const result = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || descriptor.configurable !== descriptor.writable || !Object.hasOwn(descriptor, 'value')) fail();
        Object.defineProperty(result, String(index), { value: copy(descriptor.value, seen), enumerable: true, configurable: true, writable: true });
      }
      return Object.freeze(result);
    }
    if (!plain(value)) fail();
    const names = Object.getOwnPropertyNames(value);
    const result = {};
    for (const key of names) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || descriptor.configurable !== descriptor.writable || !Object.hasOwn(descriptor, 'value')) fail();
      Object.defineProperty(result, key, { value: copy(descriptor.value, seen), enumerable: true, configurable: true, writable: true });
    }
    return Object.freeze(result);
  });
}

const frozen = (value) => Object.freeze(value);
const record = (kind, fields = {}) => frozen({ kind, ...fields });
const errorFields = (error, fallback) => {
  try {
    if (!(error instanceof Error)) return frozen({ name: 'Error', message: fallback });
    const name = error.name; const message = error.message;
    if (!safeText(name) || !safeText(message)) return frozen({ name: 'Error', message: fallback });
    return frozen({ name, message });
  } catch { return frozen({ name: 'Error', message: fallback }); }
};
const primaryThrow = (error) => record('threw', errorFields(error, 'invalid thrown error'));
const settlement = (stage, error) => record('settlement', { stage, ...errorFields(error, 'invalid settlement failure') });

export class GuardedRunError extends Error {
  constructor(primary, contamination) {
    super('guarded run failed'); this.name = 'GuardedRunError'; this.code = 'GUARDED_RUN_FAILED'; this.primary = primary; this.contamination = contamination; Object.freeze(this);
  }
}
Object.freeze(GuardedRunError);

export function runGuarded(config) {
  let input; let guard; let execute; let capture; let compare;
  try {
    input = ownData(config, ['guard', 'execute']); guard = input.guard; execute = input.execute;
    if (typeof execute !== 'function') fail();
    const guardInput = ownData(guard, ['capture', 'compare'], true); capture = guardInput.capture; compare = guardInput.compare;
    if (typeof capture !== 'function' || typeof compare !== 'function' || !Object.isFrozen(capture) || !Object.isFrozen(compare)) fail();
  } catch { fail(); }
  let before;
  try { before = capture(); } catch (error) { throw new GuardedRunError(record('before-capture', errorFields(error, 'invalid before capture failure')), null); }
  let primary = null; let value; let outcome;
  try { outcome = execute(); } catch (error) { primary = primaryThrow(error); }
  if (!primary) {
    try {
      const values = dataValues(outcome);
      const envelope = exactData(values, ['kind', ...(values.kind === 'returned' ? ['value'] : values.kind === 'crashed' ? ['error'] : values.kind === 'timed-out' ? ['timeoutMs'] : [])]);
      if (envelope.kind === 'returned') value = copy(envelope.value);
      else if (envelope.kind === 'crashed') { const crash = ownData(envelope.error, ['name', 'message']); if (!safeText(crash.name) || !safeText(crash.message)) fail(); primary = record('crashed', crash); }
      else if (envelope.kind === 'timed-out' && Number.isSafeInteger(envelope.timeoutMs) && envelope.timeoutMs > 0) primary = record('timed-out', { timeoutMs: envelope.timeoutMs });
      else fail();
    } catch { primary = record('malformed', { reason: 'invalid outcome' }); }
  }
  let contamination = null;
  try {
    const after = capture();
    try {
      const rawReport = compare(before, after); const report = exactData(dataValues(rawReport, null), ['clean', 'differences']);
      if (typeof report.clean !== 'boolean' || !Array.isArray(report.differences)) fail();
      const safeReport = copy(report);
      if (safeReport.clean !== (safeReport.differences.length === 0)) fail();
      if (safeReport.clean) { if (!primary) return frozen({ value, report: safeReport }); }
      else contamination = safeReport;
    } catch (error) { contamination = settlement('compare', error); }
  } catch (error) { contamination = settlement('after-capture', error); }
  throw new GuardedRunError(primary, contamination);
}
Object.freeze(runGuarded);
