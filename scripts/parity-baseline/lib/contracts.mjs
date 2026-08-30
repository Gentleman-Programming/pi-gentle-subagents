const digest = /^[a-f0-9]{64}$/;
const revision = /^[a-f0-9]{40}$/;
const identity = /^PB-(0[1-9]|1[0-4])$/;
const outcomes = new Set(['equal', 'not-applicable', 'platform-variable', 'unexplained-difference']);
const observationFields = ['identity', 'surfaceGroup', 'revision', 'fixtureId', 'fixtureSha256', 'environmentId', 'procedureId', 'normalizationId', 'observationSha256'];

function exact(value, fields, field) {
  if (!value || typeof value !== 'object' || Object.keys(value).some((key) => !fields.includes(key))) throw new TypeError(`invalid ${field}`);
}

function text(value, field) {
  if (typeof value !== 'string' || !value) throw new TypeError(`invalid ${field}`);
  return value;
}

export function assertEvidenceRef(value, field = 'evidence') {
  exact(value, ['path', 'sha256', 'mediaType'], field);
  text(value.path, `${field}.path`); text(value.mediaType, `${field}.mediaType`);
  if (!digest.test(value.sha256) || value.path.startsWith('/') || value.path.split('/').includes('..') || value.path.includes('\\')) throw new TypeError(`invalid ${field}`);
  return value;
}

export function assertObservation(value, field = 'observation') {
  exact(value, observationFields, field);
  if (!identity.test(value.identity) || !revision.test(value.revision)) throw new TypeError(`invalid ${field}`);
  text(value.surfaceGroup, `${field}.surfaceGroup`);
  for (const name of observationFields.slice(3)) {
    if ((name.endsWith('Sha256') && !digest.test(value[name])) || (!name.endsWith('Sha256') && !text(value[name], `${field}.${name}`))) throw new TypeError(`invalid ${field}.${name}`);
  }
  return value;
}

export function assertOutcome(value) {
  if (!outcomes.has(value)) throw new TypeError(`illegal outcome ${value}`);
  return value;
}

export function assertParityRow(row) {
  exact(row, ['identity', 'surfaceGroup', 'supportedBoundary', 'fixture', 'observation', 'outcome', 'forkEvidence', 'upstreamEvidence', 'explanationEvidence'], 'parity row');
  if (!identity.test(row.identity)) throw new TypeError('invalid identity');
  for (const name of ['surfaceGroup', 'supportedBoundary', 'fixture', 'observation']) text(row[name], name);
  assertOutcome(row.outcome); assertEvidenceRef(row.forkEvidence, 'forkEvidence'); assertEvidenceRef(row.upstreamEvidence, 'upstreamEvidence');
  if (row.outcome === 'equal' && Object.hasOwn(row, 'explanationEvidence')) throw new TypeError('invalid explanationEvidence');
  if (row.outcome !== 'equal') assertEvidenceRef(row.explanationEvidence, 'explanationEvidence');
  return row;
}
