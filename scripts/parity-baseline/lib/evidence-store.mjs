import fs from 'node:fs';
import path from 'node:path';
import { assertEvidenceRef } from './contracts.mjs';
import { sha256 } from './canonical-json.mjs';

function resolve(root, relative) {
  if (typeof relative !== 'string' || relative.startsWith('/') || relative.includes('\\') || relative.split('/').includes('..')) throw new TypeError('evidence path must be relative');
  const base = path.resolve(root);
  const file = path.resolve(base, relative);
  if (!file.startsWith(`${base}${path.sep}`)) throw new TypeError('evidence path escapes root');
  let current = base;
  for (const component of relative.split('/')) {
    current = path.join(current, component);
    if (fs.lstatSync(current).isSymbolicLink()) throw new TypeError('evidence path contains symlink');
  }
  return file;
}

function regular(file) {
  if (!fs.statSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new TypeError('evidence must be a regular file');
}

export function createEvidenceRef(root, relative, mediaType = 'application/json') {
  const file = resolve(root, relative); regular(file);
  return { path: relative, sha256: sha256(fs.readFileSync(file)), mediaType };
}

export function readEvidence(root, reference) {
  assertEvidenceRef(reference);
  const file = resolve(root, reference.path); regular(file);
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== reference.sha256) throw new TypeError('evidence digest mismatch');
  return bytes;
}
