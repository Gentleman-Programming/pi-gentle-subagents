import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript evidence helper is exercised directly by Vitest.
import { canonicalJson, sha256 } from '../../scripts/parity-baseline/lib/canonical-json.mjs';

describe('canonical JSON', () => {
  it('sorts object keys and preserves exact strings and event order', () => {
    expect(canonicalJson({ z: 'line\r\nexact', a: [{ event: 'second' }, { event: 'first' }] }))
      .toBe('{"a":[{"event":"second"},{"event":"first"}],"z":"line\\r\\nexact"}\n');
  });

  it('sorts only declared set-valued arrays and yields stable byte digests', () => {
    const first = canonicalJson({ tags: ['z', 'a'], events: ['z', 'a'] }, { setPaths: ['tags'] });
    const second = canonicalJson({ events: ['z', 'a'], tags: ['a', 'z'] }, { setPaths: ['tags'] });
    expect(first).toBe('{"events":["z","a"],"tags":["a","z"]}\n');
    expect(sha256(first)).toBe(sha256(second));
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('sorts declared nested sets without reordering sibling event arrays', () => {
    expect(canonicalJson({ data: { tags: ['b', 'a'] }, events: [2, 1] }, { setPaths: ['data.tags'] }))
      .toBe('{"data":{"tags":["a","b"]},"events":[2,1]}\n');
  });

  it('uses code-unit ordering rather than locale ordering for declared sets', () => {
    expect(canonicalJson({ tags: ['z', 'ä', 'a'] }, { setPaths: ['tags'] })).toBe('{"tags":["a","z","ä"]}\n');
  });

  it('rejects non-finite values and undefined values', () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow('finite');
    expect(() => canonicalJson({ value: undefined })).toThrow('undefined');
  });
});
