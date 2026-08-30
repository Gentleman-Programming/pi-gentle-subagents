import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript evidence helper is exercised directly by Vitest.
import { createEvidenceRef, readEvidence } from '../../scripts/parity-baseline/lib/evidence-store.mjs';

const roots: string[] = [];
function root() { const value = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-')); roots.push(value); return value; }
afterEach(() => roots.splice(0).forEach((value) => fs.rmSync(value, { recursive: true, force: true })));

describe('evidence store', () => {
  it('creates and resolves content-addressed relative JSON evidence', () => {
    const directory = root();
    fs.mkdirSync(path.join(directory, 'targets/fork'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'targets/fork/one.json'), '{"ok":true}\n');
    const reference = createEvidenceRef(directory, 'targets/fork/one.json');
    expect(reference).toMatchObject({ path: 'targets/fork/one.json', mediaType: 'application/json' });
    expect(readEvidence(directory, reference).toString()).toBe('{"ok":true}\n');
  });

  it.each(['../outside.json', '/absolute.json'])('rejects unsafe reference path %s', (unsafe) => {
    expect(() => createEvidenceRef(root(), unsafe)).toThrow('relative');
  });

  it('rejects evidence changed after its reference is created', () => {
    const directory = root();
    fs.writeFileSync(path.join(directory, 'one.json'), '{}');
    const reference = createEvidenceRef(directory, 'one.json');
    fs.writeFileSync(path.join(directory, 'one.json'), '{"changed":true}');
    expect(() => readEvidence(directory, reference)).toThrow('digest');
  });

  it('rejects an intermediate-directory symlink that escapes the root', () => {
    const directory = root();
    const outside = root();
    fs.writeFileSync(path.join(outside, 'escape.json'), '{}');
    fs.symlinkSync(outside, path.join(directory, 'linked'));
    expect(() => createEvidenceRef(directory, 'linked/escape.json')).toThrow('symlink');
  });

  it('rejects backslash paths at the evidence-store boundary', () => {
    expect(() => createEvidenceRef(root(), 'targets\\fork\\one.json')).toThrow('relative');
  });

  it('rejects symlinks and digest mismatches', () => {
    const directory = root();
    fs.writeFileSync(path.join(directory, 'real.json'), '{}');
    fs.symlinkSync('real.json', path.join(directory, 'link.json'));
    expect(() => createEvidenceRef(directory, 'link.json')).toThrow('symlink');
    expect(() => readEvidence(directory, { path: 'real.json', sha256: 'a'.repeat(64), mediaType: 'application/json' })).toThrow('digest');
  });
});
