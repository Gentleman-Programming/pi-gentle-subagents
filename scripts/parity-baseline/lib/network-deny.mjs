import { isIP } from 'node:net';

const controls = /[\0-\x1f\x7f-\x9f]/u;
const encodedControls = /%(?:0[0-9a-f]|1[0-9a-f]|7f|[89][0-9a-f]|c2%(?:8[0-9a-f]|9[0-9a-f]))/iu;
const channels = ['fetch', 'http', 'https', 'net', 'tls', 'dns', 'datagram', 'tooling'];
const types = new Set(['A', 'AAAA', 'CNAME', 'MX', 'NAPTR', 'NS', 'PTR', 'SOA', 'SRV', 'TXT']);
const tools = new Set(['npm', 'pnpm', 'yarn', 'npx', 'git', 'curl', 'wget']);

function fail(message) { throw new TypeError(message); }
function safeText(value) { return typeof value === 'string' && value.length > 0 && !controls.test(value) && value.trim() === value; }
function exact(value, keys, message) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== keys.length) fail(message);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !descriptor.configurable || !descriptor.writable || !Object.hasOwn(descriptor, 'value')) fail(message);
  }
  return value;
}
function copy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(copy));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.keys(value).map((key) => [key, copy(value[key])] )));
  return value;
}
function ipv4(value) {
  const parts = value.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^(?:0|[1-9]\d{0,2})$/u.test(part) || Number(part) > 255)) return null;
  return value;
}
function host(value, message) {
  if (!safeText(value) || /[\\/?#@]/u.test(value)) fail(message);
  const bracketed = value.startsWith('[') || value.endsWith(']');
  const bare = bracketed ? value.slice(1, -1) : value;
  if (!bare || (bracketed && !(value.startsWith('[') && value.endsWith(']')))) fail(message);
  const four = ipv4(bare);
  if (four) return four;
  if (/^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+))*$/iu.test(bare)) fail(message);
  if (isIP(bare) === 6) {
    try { return new URL(`http://[${bare}]`).hostname.slice(1, -1); } catch { fail(message); }
  }
  if (bracketed || bare.includes(':')) fail(message);
  try {
    const normalized = new URL(`http://${bare}`).hostname;
    const terminal = normalized.endsWith('.') ? normalized.slice(0, -1) : normalized;
    if (!terminal || isIP(terminal) || terminal.includes('..')) fail(message);
    return terminal;
  } catch { fail(message); }
}
function rawAuthorityHostname(value, message) {
  const authority = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/u.exec(value)?.[1];
  if (!authority) fail(message);
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']');
    if (end === -1) fail(message);
    return hostPort.slice(0, end + 1);
  }
  const port = hostPort.lastIndexOf(':');
  return port === -1 ? hostPort : hostPort.slice(0, port);
}
function url(value, kind, message) {
  if (!safeText(value) || value.includes('\\') || encodedControls.test(value)) fail(message);
  host(rawAuthorityHostname(value, message), message);
  let parsed;
  try { parsed = new URL(value); } catch { fail(message); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash || !parsed.hostname) fail(message);
  if (kind !== 'fetch' && parsed.protocol !== `${kind}:`) fail(message);
  const normalizedHost = host(parsed.hostname, message);
  const port = (parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443') ? '' : parsed.port;
  return `${parsed.protocol}//${normalizedHost.includes(':') ? `[${normalizedHost}]` : normalizedHost}${port ? `:${port}` : ''}${parsed.pathname}${parsed.search}`;
}
function tool(value, message) {
  if (!safeText(value) || controls.test(value)) fail(message);
  const normalized = value.replace(/\\/gu, '/');
  const parts = normalized.startsWith('/') ? normalized.slice(1).split('/') : normalized.split('/');
  if (normalized.endsWith('/') || parts.some((part) => !part || part === '.' || part === '..')) fail(message);
  const basename = parts.at(-1).toLowerCase();
  if (!tools.has(basename)) fail(message);
  return basename;
}
function address(input, message) {
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) fail(message);
  return { host: host(input.host, message), port: input.port };
}
function endpoint(channel, input) {
  const message = 'invalid network request';
  if (['fetch', 'http', 'https'].includes(channel)) { exact(input, ['url'], message); return { url: url(input.url, channel, message) }; }
  if (['net', 'tls'].includes(channel)) { exact(input, ['host', 'port'], message); return address(input, message); }
  if (channel === 'dns') {
    exact(input, ['hostname', 'recordType'], message);
    if (!safeText(input.recordType) || !types.has(input.recordType.toUpperCase())) fail(message);
    return { hostname: host(input.hostname, message), recordType: input.recordType.toUpperCase() };
  }
  if (channel === 'datagram') {
    exact(input, ['host', 'port', 'family'], message); const result = address(input, message);
    if (!['udp4', 'udp6'].includes(input.family) || (isIP(result.host) && (input.family === 'udp4') !== (isIP(result.host) === 4))) fail(message);
    return { ...result, family: input.family };
  }
  exact(input, ['tool', 'url'], message);
  return { tool: tool(input.tool, message), url: url(input.url, 'fetch', message) };
}

export class NetworkDeniedError extends Error {
  constructor(record) {
    super(`network denied: ${record.channel}`);
    this.name = 'NetworkDeniedError'; this.code = 'NETWORK_DENIED'; this.target = record.target; this.channel = record.channel; this.record = copy(record);
    Object.freeze(this);
  }
}

export function createNetworkDenyGuard(config) {
  exact(config, ['target', 'seams'], 'invalid network policy'); exact(config.target, ['id'], 'invalid network policy'); exact(config.seams, channels, 'invalid network policy');
  if (!safeText(config.target.id) || !/^[A-Za-z0-9_-]+$/u.test(config.target.id) || channels.some((key) => typeof config.seams[key] !== 'function')) fail('invalid network policy');
  const target = config.target.id; const seams = Object.fromEntries(channels.map((key) => [key, config.seams[key]])); const history = []; let sequence = 0;
  const deny = Object.freeze((channel, input) => {
    if (!channels.includes(channel)) fail('unknown network channel');
    const normalized = endpoint(channel, input);
    const record = copy({ sequence: ++sequence, target, channel, endpoint: normalized });
    history.push(record); throw new NetworkDeniedError(record);
  });
  const methods = Object.fromEntries(channels.map((channel) => [channel, Object.freeze((input) => deny(channel, input))]));
  return Object.freeze({ ...methods, deny, records: Object.freeze(() => Object.freeze(history.map(copy))) });
}
