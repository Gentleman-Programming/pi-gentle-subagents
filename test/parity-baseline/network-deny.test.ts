import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript harness has no declaration file.
import { NetworkDeniedError, createNetworkDenyGuard } from '../../scripts/parity-baseline/lib/network-deny.mjs';

const inputs = {
  fetch: { url: 'HTTP://BÜCHER.example:80/a/../b' },
  http: { url: 'http://example.test:80/a' },
  https: { url: 'https://example.test:443/a' },
  net: { host: '127.0.0.1', port: 80 },
  tls: { host: '[2001:0db8::1]', port: 443 },
  dns: { hostname: 'BÜCHER.example.', recordType: 'mx' },
  datagram: { host: '2001:0db8::1', port: 53, family: 'udp6' },
  tooling: { tool: '/usr/bin/NPM', url: 'https://example.test:443/a' },
};
const expected = [
  { sequence: 1, target: 'fork', channel: 'fetch', endpoint: { url: 'http://xn--bcher-kva.example/b' } },
  { sequence: 2, target: 'fork', channel: 'http', endpoint: { url: 'http://example.test/a' } },
  { sequence: 3, target: 'fork', channel: 'https', endpoint: { url: 'https://example.test/a' } },
  { sequence: 4, target: 'fork', channel: 'net', endpoint: { host: '127.0.0.1', port: 80 } },
  { sequence: 5, target: 'fork', channel: 'tls', endpoint: { host: '2001:db8::1', port: 443 } },
  { sequence: 6, target: 'fork', channel: 'dns', endpoint: { hostname: 'xn--bcher-kva.example', recordType: 'MX' } },
  { sequence: 7, target: 'fork', channel: 'datagram', endpoint: { host: '2001:db8::1', port: 53, family: 'udp6' } },
  { sequence: 8, target: 'fork', channel: 'tooling', endpoint: { tool: 'npm', url: 'https://example.test/a' } },
];

function exact(value: Record<string, unknown>) { return Object.fromEntries(Object.entries(value)); }
function fresh(target = 'fork') {
  const calls = Object.fromEntries(Object.keys(inputs).map((key) => [key, 0]));
  const seams = Object.fromEntries(Object.keys(inputs).map((key) => [key, () => { calls[key] += 1; }]));
  return { calls, seams, policy: createNetworkDenyGuard({ target: { id: target }, seams }) };
}
function rejected(channel: string, input: unknown, message = 'invalid network request') {
  const { calls, policy } = fresh();
  expect(() => policy.deny(channel, input)).toThrow(new TypeError(message));
  expect(policy.records()).toEqual([]);
  expect(calls).toEqual({ fetch: 0, http: 0, https: 0, net: 0, tls: 0, dns: 0, datagram: 0, tooling: 0 });
}

describe('createNetworkDenyGuard', () => {
  it('freezes the public callable surface and records every direct channel call before any seam', () => {
    const { calls, policy } = fresh();
    expect(Object.isFrozen(policy)).toBe(true);
    for (const method of [...Object.keys(inputs), 'deny', 'records']) {
      expect(Object.isFrozen((policy as any)[method])).toBe(true);
      expect(() => { (policy as any)[method] = () => undefined; }).toThrow();
    }
    for (const [channel, input] of Object.entries(inputs)) {
      expect(() => (policy as any)[channel](exact(input))).toThrow(NetworkDeniedError);
    }
    expect(policy.records()).toEqual(expected);
    expect(calls).toEqual({ fetch: 0, http: 0, https: 0, net: 0, tls: 0, dns: 0, datagram: 0, tooling: 0 });
    const records = policy.records();
    expect(Object.isFrozen(records)).toBe(true);
    expect(Object.isFrozen(records[0])).toBe(true);
    expect(Object.isFrozen(records[0].endpoint)).toBe(true);
    expect(() => { records[0].endpoint = {}; }).toThrow();
    expect(policy.records()).not.toBe(records);
  });

  it('normalizes only canonical hosts, URLs, and allowlisted tooling basenames', () => {
    const valid = [
      ['dns', { hostname: 'Example.TEST.', recordType: 'a' }], ['dns', { hostname: 'BÜCHER.example', recordType: 'aaaa' }],
      ['net', { host: '2001:0db8::1', port: 1 }], ['net', { host: '[2001:db8::1]', port: 1 }],
      ['tooling', { tool: '\\usr\\bin\\pnpm', url: 'https://example.test/a' }], ['tooling', { tool: 'git', url: 'https://example.test/a' }],
    ];
    for (const [channel, input] of valid) {
      const { policy } = fresh();
      expect(() => policy.deny(channel, input)).toThrow(NetworkDeniedError);
    }
    for (const [channel, input] of [
      ['fetch', { url: 'https://user@example.test/a' }], ['fetch', { url: 'https://:password@example.test/a' }], ['fetch', { url: 'https://example.test/a#x' }],
      ['fetch', { url: 'https://example.test\\a' }], ['fetch', { url: 'https://example.test/%00' }], ['fetch', { url: 'https://example.test/%7f' }], ['fetch', { url: 'https://example.test/%c2%80' }],
      ['fetch', { url: '/a' }], ['fetch', { url: 'ftp://example.test/a' }], ['http', { url: 'https://example.test/a' }], ['https', { url: 'http://example.test/a' }],
      ['net', { host: '127.1', port: 1 }], ['net', { host: '127.0.0.01', port: 1 }], ['net', { host: '0x7f.0.0.1', port: 1 }],
      ['net', { host: '[2001:db8::1', port: 1 }], ['net', { host: 'fe80::1%eth0', port: 1 }], ['net', { host: 'host name', port: 1 }], ['net', { host: '', port: 1 }],
      ['tooling', { tool: '/usr/bin/', url: 'https://example.test/a' }], ['tooling', { tool: '../npm', url: 'https://example.test/a' }], ['tooling', { tool: 'npm/../git', url: 'https://example.test/a' }], ['tooling', { tool: 'sh', url: 'https://example.test/a' }],
    ]) rejected(channel as string, input);
  });

  it('rejects ambiguous raw numeric IPv4 URL authorities before recording or any seam', () => {
    const ambiguous = ['127.1', '127.0.0.01', '0177.0.0.1', '0x7f.0.0.1', '2130706433'];
    for (const hostname of ambiguous) {
      const requests: Array<[string, Record<string, string>]> = [
        ['fetch', { url: `http://${hostname}/a` }],
        ['http', { url: `http://${hostname}:8080/a` }],
        ['https', { url: `https://${hostname}/a` }],
        ['tooling', { tool: 'npm', url: `https://${hostname}:8443/a` }],
      ];
      for (const [channel, input] of requests) rejected(channel, input);
    }
  });

  it('accepts adjacent canonical URL authorities without over-rejection', () => {
    const requests: Array<[string, Record<string, string>, Record<string, string>]> = [
      ['fetch', { url: 'http://127.0.0.1/a' }, { url: 'http://127.0.0.1/a' }],
      ['http', { url: 'http://[2001:db8::1]:8080/a' }, { url: 'http://[2001:db8::1]:8080/a' }],
      ['https', { url: 'https://BÜCHER.example.:8443/a' }, { url: 'https://xn--bcher-kva.example:8443/a' }],
      ['tooling', { tool: 'npm', url: 'https://example.test:8443/a' }, { tool: 'npm', url: 'https://example.test:8443/a' }],
    ];
    for (const [channel, input, endpoint] of requests) {
      const { calls, policy } = fresh();
      expect(() => (policy as any)[channel](input)).toThrow(NetworkDeniedError);
      expect(policy.records()).toEqual([{ sequence: 1, target: 'fork', channel, endpoint }]);
      expect(calls).toEqual({ fetch: 0, http: 0, https: 0, net: 0, tls: 0, dns: 0, datagram: 0, tooling: 0 });
    }
  });

  it('fails closed for every malformed descriptor, config, port, family, and channel without mutation or global state', () => {
    const before = (globalThis as any).createNetworkDenyGuard;
    for (const [channel, input] of [
      ['unknown', {}], ['fetch', { url: 'https://example.test', extra: true }], ['fetch', Object.create({ url: 'https://example.test' })], ['fetch', { url: new String('https://example.test') }], ['fetch', { url: 'https://example.test\u0000' }],
      ['net', { host: 'host', port: NaN }], ['net', { host: 'host', port: 1.5 }], ['net', { host: 'host', port: '1' }], ['net', { host: 'host', port: 0 }], ['net', { host: 'host', port: 65536 }],
      ['dns', { hostname: 'unknown host', recordType: 'A' }], ['dns', { hostname: 'host', recordType: 'bogus' }], ['datagram', { host: '127.0.0.1', port: 1, family: 'udp6' }], ['datagram', { host: '::1', port: 1, family: 'udp4' }], ['datagram', { host: 'host', port: 1, family: 'udp5' }],
    ]) rejected(channel as string, input, channel === 'unknown' ? 'unknown network channel' : undefined);
    const { seams } = fresh(); const hidden = { ...seams }; Object.defineProperty(hidden, 'fetch', { enumerable: false, value: () => undefined });
    const accessor = { ...seams }; Object.defineProperty(accessor, 'fetch', { enumerable: true, get: () => () => undefined });
    for (const bad of [null, { target: { id: 'a' }, seams: { ...seams, extra: () => undefined } }, { target: { id: 'a' }, seams: { ...seams, fetch: 1 } }, { target: { id: 'a' }, seams: hidden }, { target: { id: 'a' }, seams: accessor }, { target: {}, seams }, { target: { id: new String('a') }, seams }]) expect(() => createNetworkDenyGuard(bad)).toThrow('invalid network policy');
    expect((globalThis as any).createNetworkDenyGuard).toBe(before);
  });

  it('snapshots config and seams, keeps errors and targets independent, and preserves record ordering', () => {
    const { calls, seams, policy } = fresh('left');
    const config = { target: { id: 'right' }, seams };
    const stable = createNetworkDenyGuard(config);
    config.target.id = 'changed'; config.seams.fetch = () => { throw Error('called'); };
    for (const item of [{ url: 'https://example.test/a' }, { url: 'https://example.test/b' }]) expect(() => stable.fetch(item)).toThrow(NetworkDeniedError);
    expect(stable.records().map((record: any) => record.target)).toEqual(['right', 'right']);
    expect(calls.fetch).toBe(0);
    let error: any;
    try { policy.fetch({ url: 'https://example.test/a' }); } catch (value) { error = value; }
    expect(error).toMatchObject({ name: 'NetworkDeniedError', code: 'NETWORK_DENIED', target: 'left', channel: 'fetch' });
    expect(Object.isFrozen(error)).toBe(true);
    expect(Object.isFrozen(error.record)).toBe(true);
    const other = fresh('other').policy;
    expect(other.records()).toEqual([]);
    expect(() => other.fetch({ url: 'https://example.test/a' })).toThrow(NetworkDeniedError);
    expect(policy.records()[0]).not.toBe(other.records()[0]);
  });
});
