export type ParityIdentity = 'PB-01' | 'PB-02' | 'PB-03' | 'PB-04' | 'PB-05' | 'PB-06' | 'PB-07' | 'PB-08' | 'PB-09' | 'PB-10' | 'PB-11' | 'PB-12' | 'PB-13' | 'PB-14';
declare const sha256Brand: unique symbol;
export type Sha256 = string & { readonly [sha256Brand]: 'Sha256' };
export function sha256(value: string): Sha256 {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new TypeError('invalid sha256');
  return value as Sha256;
}
declare const evidencePathBrand: unique symbol;
export type EvidencePath = string & { readonly [evidencePathBrand]: 'EvidencePath' };
export function evidencePath(value: string): EvidencePath {
  if (!value || value.startsWith('/') || value.includes('\\') || value.split('/').includes('..')) throw new TypeError('invalid evidence path');
  return value as EvidencePath;
}
export type EvidenceRef = { path: EvidencePath; sha256: Sha256; mediaType: string };
export type ParityOutcome = 'equal' | 'not-applicable' | 'platform-variable' | 'unexplained-difference';
export type Observation = { identity: ParityIdentity; surfaceGroup: string; revision: string; fixtureId: string; fixtureSha256: Sha256; environmentId: string; procedureId: string; normalizationId: string; observationSha256: Sha256 };
export type ParityRow = { identity: ParityIdentity; surfaceGroup: string; supportedBoundary: string; fixture: string; observation: string; outcome: 'equal'; forkEvidence: EvidenceRef; upstreamEvidence: EvidenceRef; explanationEvidence?: never } | { identity: ParityIdentity; surfaceGroup: string; supportedBoundary: string; fixture: string; observation: string; outcome: Exclude<ParityOutcome, 'equal'>; forkEvidence: EvidenceRef; upstreamEvidence: EvidenceRef; explanationEvidence: EvidenceRef };
