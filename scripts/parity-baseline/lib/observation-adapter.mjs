const controls = /[\0-\x1f\x7f-\x9f]/u;
const fail = () => { throw new TypeError('invalid PB-01'); };
const data = (descriptor) => descriptor && descriptor.enumerable && descriptor.configurable && descriptor.writable && Object.hasOwn(descriptor, 'value');
const guarded = (action) => { try { return action(); } catch { return fail(); } };
export const text = (value) => typeof value === 'string' && value.length > 0 && !controls.test(value);
export function own(value, keys) {
  return guarded(() => {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length) fail();
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== keys.length || keys.some((key) => !names.includes(key))) fail();
    const output = {};
    for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!data(descriptor)) fail(); Object.defineProperty(output, key, { value: descriptor.value, enumerable: true, writable: false, configurable: false }); }
    return Object.freeze(output);
  });
}
export function copy(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' && text(value) || typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  return guarded(() => {
    if (!value || typeof value !== 'object' || seen.has(value) || Object.getOwnPropertySymbols(value).length) fail(); seen.add(value);
    if (Array.isArray(value)) {
      const length = Object.getOwnPropertyDescriptor(value, 'length');
      if (!length || length.enumerable || length.configurable || !Object.hasOwn(length, 'value') || !Number.isSafeInteger(length.value) || length.value < 0 || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertyNames(value).length !== length.value + 1) fail();
      const output = []; for (let i = 0; i < length.value; i += 1) { const descriptor = Object.getOwnPropertyDescriptor(value, String(i)); if (!data(descriptor)) fail(); output.push(copy(descriptor.value, seen)); } return Object.freeze(output);
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) fail(); const output = {};
    for (const key of Object.getOwnPropertyNames(value)) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!data(descriptor)) fail(); Object.defineProperty(output, key, { value: copy(descriptor.value, seen), enumerable: true, writable: false, configurable: false }); }
    return Object.freeze(output);
  });
}
export const exact = (value, keys) => value && typeof value === 'object' && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)) ? value : fail();
export const freeze = Object.freeze;
