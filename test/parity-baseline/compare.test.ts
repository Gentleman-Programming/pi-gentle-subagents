import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { evidencePath, sha256 as evidenceSha256 } from './support/contracts.js';
import type { EvidencePath, ParityIdentity, ParityRow, Sha256 } from './support/contracts.js';

const typedIdentity: ParityIdentity = 'PB-01';
const typedDigest = evidenceSha256('a'.repeat(64));
// @ts-expect-error PB identities are limited to the matrix rows.
const invalidIdentity: ParityIdentity = 'PB-15';
// @ts-expect-error SHA-256 values require runtime construction.
const invalidDigest: Sha256 = 'a'.repeat(64);
// @ts-expect-error Evidence paths require runtime construction.
const invalidPath: EvidencePath = '../outside.json';
void typedIdentity; void typedDigest; void invalidIdentity; void invalidDigest; void invalidPath;
// @ts-expect-error JavaScript evidence helpers are exercised directly by Vitest.
import { assertObservation, assertParityRow } from '../../scripts/parity-baseline/lib/contracts.mjs';
// @ts-expect-error JavaScript evidence helper is exercised directly by Vitest.
import { classifyOutcome } from '../../scripts/parity-baseline/lib/compare.mjs';

const evidence = (digest: string) => ({ path: evidencePath('targets/fork/one.json'), sha256: evidenceSha256(digest), mediaType: 'application/json' });
const observation = (overrides = {}) => ({ identity: 'PB-01', surfaceGroup: 'Package', revision: 'a'.repeat(40), fixtureId: 'fixture', fixtureSha256: 'b'.repeat(64), environmentId: 'env', procedureId: 'procedure', normalizationId: 'normalization', observationSha256: 'c'.repeat(64), ...overrides });

describe('parity comparison', () => {
  it('classifies matching canonical observations as equal', () => expect(classifyOutcome({ fork: observation(), upstream: observation() })).toBe('equal'));
  it('rejects equal outcomes carrying explanation evidence directly', () => expect(() => classifyOutcome({ outcome: 'equal', explanationEvidence: evidence('d'.repeat(64)), fork: observation(), upstream: observation() })).toThrow('explanationEvidence'));
  it('rejects unsafe evidence-path and non-canonical SHA construction', () => {
    expect(() => evidencePath('../outside.json')).toThrow('evidence path');
    expect(() => evidencePath('targets\\fork\\one.json')).toThrow('evidence path');
    expect(() => evidenceSha256('A'.repeat(64))).toThrow('sha256');
  });
  it('rejects a genuinely non-64-character SHA at the public construction boundary', () => {
    expect(() => evidenceSha256('a'.repeat(63))).toThrow('sha256');
  });
  it('fails closed for a supported difference and rejects illegal outcomes', () => {
    expect(classifyOutcome({ fork: observation(), upstream: observation({ observationSha256: 'd'.repeat(64) }) })).toBe('unexplained-difference');
    expect(() => classifyOutcome({ outcome: 'similar', fork: observation(), upstream: observation() })).toThrow('illegal outcome');
  });
  it('does not allow caller-declared equal to bypass missing or mismatched provenance', () => {
    expect(() => classifyOutcome({ outcome: 'equal', fork: observation(), upstream: observation({ revision: 'd'.repeat(40) }) })).toThrow('equal requires matching');
    expect(() => classifyOutcome({ outcome: 'equal', fork: observation(), upstream: observation({ procedureId: undefined }) })).toThrow('invalid upstream');
    for (const change of [{ identity: 'PB-02' }, { fixtureId: 'other' }, { fixtureSha256: 'd'.repeat(64) }, { environmentId: 'other' }, { procedureId: 'other' }, { normalizationId: 'other' }, { observationSha256: 'd'.repeat(64) }]) {
      expect(() => classifyOutcome({ outcome: 'equal', fork: observation(), upstream: observation(change) })).toThrow('equal requires matching');
    }
  });
  it('requires explanation evidence for every non-equal outcome and same environment for platform variance', () => {
    expect(() => classifyOutcome({ outcome: 'not-applicable', fork: observation(), upstream: observation() })).toThrow('explanationEvidence');
    expect(() => classifyOutcome({ outcome: 'platform-variable', explanationEvidence: evidence('d'.repeat(64)), fork: observation(), upstream: observation({ environmentId: 'darwin' }) })).toThrow('same environment');
  });
  it('rejects unknown fields and equal explanations consistently across schema, runtime, and types', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../evidence/parity-baseline/schemas/contracts.schema.json'), 'utf8'));
    expect(schema.$defs.evidenceRef.additionalProperties).toBe(false);
    expect(schema.$defs.observation.additionalProperties).toBe(false);
    expect(schema.$defs.parityRow.additionalProperties).toBe(false);
    expect(new RegExp(schema.$defs.evidenceRef.properties.path.pattern).test('targets\\fork\\one.json')).toBe(false);
    expect(() => assertObservation({ ...observation(), extra: true }, 'observation')).toThrow('invalid observation');
    expect(() => assertObservation(({ ...observation(), surfaceGroup: undefined }), 'observation')).toThrow('surfaceGroup');
    expect(() => assertParityRow({ identity: 'PB-01', supportedBoundary: 'supported', fixture: 'fixture', observation: 'observation', outcome: 'equal', forkEvidence: evidence('a'.repeat(64)), upstreamEvidence: evidence('b'.repeat(64)) })).toThrow('surfaceGroup');
    expect(() => assertParityRow({ identity: 'PB-01', surfaceGroup: 'Package', supportedBoundary: 'supported', fixture: 'fixture', observation: 'observation', outcome: 'equal', forkEvidence: evidence('a'.repeat(64)), upstreamEvidence: evidence('b'.repeat(64)), explanationEvidence: evidence('c'.repeat(64)) })).toThrow('explanationEvidence');
    expect(() => assertParityRow({ identity: 'PB-01', surfaceGroup: 'Package', supportedBoundary: 'supported', fixture: 'fixture', observation: 'observation', outcome: 'equal', forkEvidence: { ...evidence('a'.repeat(64)), extra: true }, upstreamEvidence: evidence('b'.repeat(64)) })).toThrow('invalid forkEvidence');
    expect(() => assertParityRow({ identity: 'PB-01', surfaceGroup: 'Package', supportedBoundary: 'supported', fixture: 'fixture', observation: 'observation', outcome: 'equal', forkEvidence: evidence('a'.repeat(64)), upstreamEvidence: evidence('b'.repeat(64)), extra: true })).toThrow('invalid parity row');
    expect(() => assertParityRow({ identity: 'PB-01', surfaceGroup: 'Package', supportedBoundary: 'supported', fixture: 'fixture', observation: 'observation', outcome: 'equal', forkEvidence: { ...evidence('a'.repeat(64)), path: 'targets\\fork\\one.json' }, upstreamEvidence: evidence('b'.repeat(64)) })).toThrow('invalid forkEvidence');
  });

  it('rejects a representative evidence record without required surfaceGroup through JSON Schema validation', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../evidence/parity-baseline/schemas/contracts.schema.json'), 'utf8'));
    const record = { identity: 'PB-01', surfaceGroup: 'Package', supportedBoundary: 'supported', fixture: 'fixture', observation: 'observation', outcome: 'equal', forkEvidence: evidence('a'.repeat(64)), upstreamEvidence: evidence('b'.repeat(64)) };
    const parityRowSchema = { $defs: schema.$defs, ...schema.$defs.parityRow };
    expect(Value.Check(parityRowSchema, record)).toBe(true);
    const { surfaceGroup: _removed, ...missingSurfaceGroup } = record;
    expect(Value.Check(parityRowSchema, missingSurfaceGroup)).toBe(false);
  });

  it('keeps schema, runtime, and type parity-row obligations aligned', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../evidence/parity-baseline/schemas/contracts.schema.json'), 'utf8'));
    expect(schema.$defs.parityRow.additionalProperties).toBe(false);
    expect(schema.$defs.parityRow.allOf[0].else.required).toEqual(['explanationEvidence']);
    expect(() => assertParityRow({ identity: 'PB-01', surfaceGroup: 'Package', outcome: 'not-applicable', forkEvidence: evidence('a'.repeat(64)), upstreamEvidence: evidence('b'.repeat(64)) })).toThrow('supportedBoundary');
    const typed: ParityRow = { identity: 'PB-01', surfaceGroup: 'Package', supportedBoundary: 'supported', fixture: 'fixture', observation: 'observation', outcome: 'not-applicable', forkEvidence: evidence('a'.repeat(64)), upstreamEvidence: evidence('b'.repeat(64)), explanationEvidence: evidence('c'.repeat(64)) };
    expect(typed.outcome).toBe('not-applicable');
  });
});
