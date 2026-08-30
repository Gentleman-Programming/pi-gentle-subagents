import { assertEvidenceRef, assertObservation, assertOutcome } from './contracts.mjs';

const comparableFields = ['identity', 'surfaceGroup', 'revision', 'fixtureId', 'fixtureSha256', 'environmentId', 'procedureId', 'normalizationId', 'observationSha256'];

function sameEvidence(fork, upstream) {
  assertObservation(fork, 'fork');
  assertObservation(upstream, 'upstream');
  return comparableFields.every((field) => fork[field] === upstream[field]);
}

export function classifyOutcome({ outcome, explanationEvidence, fork, upstream }) {
  const equal = sameEvidence(fork, upstream);
  if (outcome !== undefined) {
    assertOutcome(outcome);
    if (outcome === 'equal') {
      if (explanationEvidence !== undefined) throw new TypeError('equal forbids explanationEvidence');
      if (!equal) throw new TypeError('equal requires matching comparable evidence');
      return 'equal';
    }
    assertEvidenceRef(explanationEvidence, 'explanationEvidence');
    if (outcome === 'platform-variable' && fork.environmentId !== upstream.environmentId) throw new TypeError('platform-variable requires same environment');
    return outcome;
  }
  return equal ? 'equal' : 'unexplained-difference';
}
