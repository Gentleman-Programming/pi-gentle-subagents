import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const validator = path.join(repositoryRoot, 'scripts/parity-baseline/validate-baseline.mjs');
const temporaryRoots: string[] = [];

function createDefinition(overrides: Record<string, unknown> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-baseline-contract-'));
  temporaryRoots.push(root);
  const rows = Array.from({ length: 14 }, (_, index) => ({
    identity: `PB-${String(index + 1).padStart(2, '0')}`,
    surfaceGroup: `Surface ${index + 1}`,
    supportedBoundary: 'Supported boundary',
    fixture: `fixture-${index + 1}`,
    observation: `Observation ${index + 1}`,
  }));
  const definitionPath = path.join(root, 'definition.json');
  fs.writeFileSync(definitionPath, JSON.stringify({ schemaVersion: 1, rows, ...overrides }));
  return definitionPath;
}

function createMatrix(definitionPath: string): { rows: Record<string, unknown>[] } {
  const root = path.dirname(definitionPath);
  const evidence = ['fork.json', 'upstream.json'].map((name) => {
    const file = path.join(root, name);
    fs.writeFileSync(file, '{}');
    return { path: name, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
  });
  const rows = JSON.parse(fs.readFileSync(definitionPath, 'utf8')).rows.map((row: Record<string, unknown>) => ({
    ...row,
    forkEvidence: evidence[0],
    upstreamEvidence: evidence[1],
    outcome: 'equal',
  }));
  return { rows };
}

function validate(definitionPath: string, matrix?: unknown): void {
  const args = [validator, '--definition', definitionPath];
  if (matrix !== undefined) {
    const matrixPath = path.join(path.dirname(definitionPath), 'matrix.json');
    fs.writeFileSync(matrixPath, JSON.stringify(matrix));
    args.push('--matrix', matrixPath);
  }
  execFileSync(process.execPath, args, { stdio: 'pipe' });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('parity baseline contract validator', () => {
  it('accepts the exact ordered PB-01 through PB-14 definition inventory', () => {
    expect(() => validate(createDefinition())).not.toThrow();
  });

  it.each([
    ['missing', (rows: Record<string, unknown>[]) => rows.slice(1)],
    ['extra', (rows: Record<string, unknown>[]) => [...rows, { ...rows[13], identity: 'PB-15' }]],
    ['reordered', (rows: Record<string, unknown>[]) => [rows[1], rows[0], ...rows.slice(2)]],
  ])('rejects a %s definition identity set or order', (_case, change) => {
    const definitionPath = createDefinition();
    const definition = JSON.parse(fs.readFileSync(definitionPath, 'utf8'));
    definition.rows = change(definition.rows);
    fs.writeFileSync(definitionPath, JSON.stringify(definition));
    expect(() => validate(definitionPath)).toThrow();
  });

  it('rejects invalid required fields and illegal matrix outcomes', () => {
    const definitionPath = createDefinition();
    const definition = JSON.parse(fs.readFileSync(definitionPath, 'utf8'));
    definition.rows[0].fixture = '';
    fs.writeFileSync(definitionPath, JSON.stringify(definition));
    expect(() => validate(definitionPath)).toThrow();

    const validDefinitionPath = createDefinition();
    const matrix = createMatrix(validDefinitionPath);
    matrix.rows[0].outcome = 'similar';
    expect(() => validate(validDefinitionPath, matrix)).toThrow();
  });

  it('rejects evidence whose digest does not match its referenced file', () => {
    const definitionPath = createDefinition();
    const matrix = createMatrix(definitionPath);
    matrix.rows[0].forkEvidence = { path: 'fork.json', sha256: 'a'.repeat(64) };
    expect(() => validate(definitionPath, matrix)).toThrow();
  });

  it('rejects matrix fields that drift from the authoritative definition', () => {
    const definitionPath = createDefinition();
    const matrix = createMatrix(definitionPath);
    matrix.rows[0].fixture = 'different fixture';
    expect(() => validate(definitionPath, matrix)).toThrow();
  });

  it('accepts matching evidence and rejects malformed digests', () => {
    const definitionPath = createDefinition();
    const matrix = createMatrix(definitionPath);
    expect(() => validate(definitionPath, matrix)).not.toThrow();
    matrix.rows[0].forkEvidence = { path: 'fork.json', sha256: 'A'.repeat(64) };
    expect(() => validate(definitionPath, matrix)).toThrow();
  });

  it('rejects non-equal outcomes without a resolvable explanation reference', () => {
    const definitionPath = createDefinition();
    const matrix = createMatrix(definitionPath);
    matrix.rows[0].outcome = 'platform-variable';
    expect(() => validate(definitionPath, matrix)).toThrow();
    matrix.rows[0].explanationEvidence = { path: 'missing.json', sha256: 'c'.repeat(64) };
    expect(() => validate(definitionPath, matrix)).toThrow();
  });
});
