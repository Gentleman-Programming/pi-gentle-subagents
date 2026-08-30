#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const identities = Array.from({ length: 14 }, (_, index) => `PB-${String(index + 1).padStart(2, '0')}`);
const outcomes = new Set(['equal', 'not-applicable', 'platform-variable', 'unexplained-difference']);
const definitionFields = ['identity', 'surfaceGroup', 'supportedBoundary', 'fixture', 'observation'];

function fail(message) {
  throw new Error(message);
}

function requireText(value, field, identity) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${identity}: missing required ${field}`);
}

function validateRows(rows, fields, label) {
  if (!Array.isArray(rows) || rows.length !== identities.length) fail(`${label}: expected exactly ${identities.length} rows`);
  rows.forEach((row, index) => {
    const identity = row?.identity ?? `row ${index + 1}`;
    if (identity !== identities[index]) fail(`${label}: expected ${identities[index]} at position ${index + 1}`);
    for (const field of fields) requireText(row?.[field], field, identity);
  });
}

function validateEvidence(reference, identity, field, resolveEvidence) {
  if (!reference || typeof reference !== 'object') fail(`${identity}: missing ${field}`);
  requireText(reference.path, `${field}.path`, identity);
  requireText(reference.sha256, `${field}.sha256`, identity);
  if (!/^[a-f0-9]{64}$/.test(reference.sha256)) fail(`${identity}: invalid ${field}.sha256`);
  if (typeof resolveEvidence === 'function' && !resolveEvidence(reference)) fail(`${identity}: unresolvable ${field}`);
}

export function validateDefinition(definition) {
  if (!definition || definition.schemaVersion !== 1) fail('definition: expected schemaVersion 1');
  validateRows(definition.rows, definitionFields, 'definition');
  return true;
}

export function validateMatrix(matrix, definition, resolveEvidence) {
  validateDefinition(definition);
  validateRows(matrix?.rows, [...definitionFields, 'outcome'], 'matrix');
  matrix.rows.forEach((row, index) => {
    for (const field of definitionFields.slice(1)) {
      if (row[field] !== definition.rows[index][field]) fail(`${row.identity}: ${field} differs from definition`);
    }
    if (!outcomes.has(row.outcome)) fail(`${row.identity}: illegal outcome ${row.outcome}`);
    validateEvidence(row.forkEvidence, row.identity, 'forkEvidence', resolveEvidence);
    validateEvidence(row.upstreamEvidence, row.identity, 'upstreamEvidence', resolveEvidence);
    if (row.outcome !== 'equal') validateEvidence(row.explanationEvidence, row.identity, 'explanationEvidence', resolveEvidence);
  });
  return true;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) values.set(argv[index], argv[index + 1]);
  if (!values.get('--definition')) fail('usage: --definition <file> [--matrix <file>]');
  return values;
}

if (import.meta.main) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const definition = readJson(args.get('--definition'));
    if (args.get('--matrix')) validateMatrix(readJson(args.get('--matrix')), definition, (reference) => {
      try {
        const bytes = fs.readFileSync(path.resolve(path.dirname(args.get('--matrix')), reference.path));
        return createHash('sha256').update(bytes).digest('hex') === reference.sha256;
      } catch {
        return false;
      }
    });
    else validateDefinition(definition);
    process.stdout.write('Parity baseline contract is valid.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
