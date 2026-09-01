import path from 'node:path';

const controls = /[\0-\x1f\x7f-\x9f]/;
const operand = /^(?:[A-Za-z0-9][A-Za-z0-9._:=+,%-]*|\/[A-Za-z0-9][A-Za-z0-9._/:=+,%-]*)$/u;
const wrapperAtoms = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'cmd', 'cmd.exe', 'powershell', 'pwsh', 'env', 'node', 'node.exe']);
const wrapperAtom = (value) => wrapperAtoms.has(value.toLowerCase()) || wrapperAtoms.has(path.basename(value).toLowerCase());
const fail = (message) => { throw new TypeError(message); };
const text = (value) => typeof value === 'string' && value.length > 0 && !controls.test(value);
const absolute = (value) => text(value) && path.isAbsolute(value) && path.normalize(value) === value;
const inside = (root, value) => root === path.sep ? value.startsWith(path.sep) && value !== root : value.startsWith(`${root}${path.sep}`);

function exact(object, keys, message, prototype = Object.prototype) {
  if (!object || typeof object !== 'object' || Object.getPrototypeOf(object) !== prototype || Object.getOwnPropertySymbols(object).length || Object.getOwnPropertyNames(object).length !== keys.length) fail(message);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !descriptor.enumerable || !descriptor.configurable || !descriptor.writable || !Object.hasOwn(descriptor, 'value')) fail(message);
  }
  return object;
}

function canonical(value, resolve, message) {
  let result;
  try { result = resolve(value); } catch { fail(message); }
  if (!absolute(result)) fail(message);
  return result;
}

function roots(config, canonicalize) {
  const lexical = ['repositoryRoot', 'toolRoot', 'sourceRoot', 'executionRoot'].map((key) => config[key]);
  if (lexical.some((value) => !absolute(value))) fail('invalid roots');
  const physical = lexical.map((value) => canonical(value, canonicalize, 'invalid roots'));
  for (const values of [lexical, physical]) {
    for (let index = 0; index < values.length; index += 1) {
      for (let other = index + 1; other < values.length; other += 1) {
        if (values[index] === values[other] || inside(values[index], values[other]) || inside(values[other], values[index])) fail('invalid roots');
      }
    }
  }
  return { lexical, physical };
}

function list(value, message) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(message);
  const length = Object.getOwnPropertyDescriptor(value, 'length');
  if (!length || length.enumerable || length.configurable || !length.writable || !Object.hasOwn(length, 'value') || length.value !== value.length || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1) fail(message);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !descriptor.configurable || !descriptor.writable || !Object.hasOwn(descriptor, 'value') || !text(descriptor.value)) fail(message);
  }
  return [...value];
}

function environment(value, message) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length || !Object.isFrozen(value)) fail(message);
  const output = Object.create(null);
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || descriptor.configurable || descriptor.writable || !Object.hasOwn(descriptor, 'value') || !text(key) || !text(descriptor.value)) fail(message);
    Object.defineProperty(output, key, { value: descriptor.value, enumerable: true, writable: false, configurable: false });
  }
  return Object.freeze(output);
}

function argumentsPolicy(script, value) {
  const output = list(value, 'invalid argument policy');
  if (!output.length || output[0] !== script || output.slice(1).some((atom) => atom === script || atom.startsWith('-') || atom.startsWith('@') || wrapperAtom(atom) || !operand.test(atom))) fail('invalid argument policy');
  return Object.freeze(output);
}

function result(value) {
  exact(value, ['pid', 'status', 'signal', 'stdout', 'stderr'], 'invalid spawn result');
  const exited = Number.isInteger(value.status) && value.status >= 0 && value.signal === null;
  const signalled = value.status === null && typeof value.signal === 'string' && /^[A-Z][A-Z0-9]*$/u.test(value.signal) && !controls.test(value.signal);
  if (!Number.isInteger(value.pid) || value.pid <= 0 || !text(value.stdout) && value.stdout !== '' || !text(value.stderr) && value.stderr !== '' || (!exited && !signalled)) fail('invalid spawn result');
  return Object.freeze({ pid: value.pid, status: value.status, signal: value.signal, stdout: value.stdout, stderr: value.stderr });
}

export function createProcessGuard(config) {
  exact(config, ['target', 'repositoryRoot', 'toolRoot', 'sourceRoot', 'executionRoot', 'executable', 'script', 'arguments', 'environment', 'canonicalize', 'spawn'], 'invalid process policy');
  exact(config.target, ['id'], 'invalid process policy');
  if (!text(config.target.id) || !/^[A-Za-z0-9_-]+$/u.test(config.target.id) || typeof config.canonicalize !== 'function' || typeof config.spawn !== 'function') fail('invalid process policy');
  const canonicalize = config.canonicalize;
  const spawn = config.spawn;
  const rootSet = roots(config, canonicalize);
  const [repository, tool, source, execution] = rootSet.lexical;
  const physical = rootSet.physical;
  if (!absolute(config.executable) || canonical(config.executable, canonicalize, 'invalid executable policy') !== config.executable || !inside(tool, config.executable) || !inside(physical[1], config.executable) || !/^node(?:\.exe)?$/iu.test(path.basename(config.executable))) fail('invalid executable policy');
  const scriptPhysical = canonical(config.script, canonicalize, 'invalid script policy');
  if (!absolute(config.script) || scriptPhysical !== config.script || !inside(source, config.script) || !inside(physical[2], config.script) || !config.script.endsWith('.mjs')) fail('invalid script policy');
  const args = argumentsPolicy(config.script, config.arguments);
  const env = environment(config.environment, 'invalid environment policy');
  const policy = Object.freeze({ target: config.target.id, executable: config.executable, arguments: args, cwd: execution, environment: env, options: Object.freeze({ shell: false, detached: false, stdio: 'pipe', windowsHide: true }) });
  const records = [];
  return Object.freeze({
    run(request) {
      exact(request, ['executable', 'arguments', 'cwd', 'environment'], 'invalid process request');
      const argsCopy = list(request.arguments, 'invalid process request');
      const requestEnv = environment(request.environment, 'invalid process request');
      if (request.executable !== policy.executable || canonical(request.executable, canonicalize, 'invalid process request') !== policy.executable || request.cwd !== policy.cwd || canonical(request.cwd, canonicalize, 'invalid process request') !== physical[3] || canonical(argsCopy[0], canonicalize, 'invalid process request') !== scriptPhysical || argsCopy.length !== args.length || argsCopy.some((value, index) => value !== args[index]) || Object.getOwnPropertyNames(requestEnv).length !== Object.getOwnPropertyNames(env).length || Object.getOwnPropertyNames(env).some((key) => requestEnv[key] !== env[key])) fail('invalid process request');
      const run = Object.freeze({ executable: policy.executable, arguments: Object.freeze([...args]), cwd: policy.cwd, environment: env, options: policy.options });
      const spawned = spawn(run);
      const record = Object.freeze({ target: policy.target, executable: run.executable, arguments: Object.freeze([...run.arguments]), cwd: run.cwd, environment: run.environment, options: run.options, result: result(spawned) });
      records.push(record);
      return record;
    },
    records() { return Object.freeze([...records]); },
  });
}
