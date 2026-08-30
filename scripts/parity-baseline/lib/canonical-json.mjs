import { createHash } from 'node:crypto';

function normalize(value, path, setPaths) {
  if (value === undefined) throw new TypeError(`undefined value at ${path || '$'}`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(`non-finite number at ${path || '$'}`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) {
    const entries = value.map((entry, index) => normalize(entry, `${path}[${index}]`, setPaths));
    return setPaths.has(path) ? entries.sort((a, b) => {
          const left = JSON.stringify(a); const right = JSON.stringify(b);
          return left < right ? -1 : left > right ? 1 : 0;
        }) : entries;
  }
  if (typeof value !== 'object') throw new TypeError(`unsupported value at ${path || '$'}`);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key], path ? `${path}.${key}` : key, setPaths)]));
}

export function canonicalJson(value, { setPaths = [] } = {}) {
  return `${JSON.stringify(normalize(value, '', new Set(setPaths)))}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
