import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript harness module has no declarations.
import { adaptPB03 } from '../../scripts/parity-baseline/adapters/PB-03.mjs';

const root = new URL('../../', import.meta.url);
const fixturePath = new URL('evidence/parity-baseline/fixtures/', root).pathname;
const fixture = () => JSON.parse(readFileSync(new URL('evidence/parity-baseline/fixtures/PB-03.json', root), 'utf8'));
const families = [
  ['parsedAgents', 'name', 'description', 'agent'], ['parsedSubagents', 'name', 'body', 'agent'],
  ['frontmatter', 'agent field', 'value', 'agent'], ['modelSettings', 'agent', 'model', 'profile'],
  ['effortSettings', 'agent', 'effort', 'profile'], ['defaults', 'field', 'value', 'settings'],
  ['numericValues', 'field', 'value', 'settings'], ['sessionResources', 'agent', 'resource', 'settings'],
  ['continuation', 'agent', 'enabled', 'settings'], ['tools', 'agent name', 'enabled', 'settings'],
  ['shortcuts', 'agent key', 'command', 'settings'],
] as const;
const keys = [...families.map(([name]) => name), 'precedence', 'provenance', 'diagnostics'];
const seed = (role: string) => fixture().seeds.find((item: any) => item.role === role);
const scope = (item: any) => item.role.startsWith('global-') ? 'global' : 'project';
const frozen = (value: any): boolean => value === null || typeof value !== 'object' || Object.isFrozen(value)
  && Reflect.ownKeys(value).every((key) => frozen(value[key]));

function direct(name: string, identity: string, value: any, source: any) {
  const fields: any = name === 'frontmatter' ? { agent: identity, field: 'model' } : name === 'tools'
    ? { agent: identity, name: 'read' } : name === 'shortcuts' ? { agent: identity, key: 'g' }
        : ['parsedAgents', 'parsedSubagents'].includes(name) ? { name: identity }
          : ['modelSettings', 'effortSettings', 'sessionResources', 'continuation'].includes(name)
            ? { agent: identity } : { field: identity };
  const valueKey = name === 'parsedAgents' ? 'description' : name === 'parsedSubagents' ? 'body'
    : name === 'modelSettings' ? 'model' : name === 'effortSettings' ? 'effort'
      : name === 'sessionResources' ? 'resource' : name === 'shortcuts' ? 'command'
        : ['continuation', 'tools'].includes(name) ? 'enabled' : 'value';
  const pathKey = ['parsedAgents', 'parsedSubagents', 'frontmatter', 'modelSettings', 'effortSettings'].includes(name)
    ? 'sourcePath' : 'path';
  const result = { ...fields, [valueKey]: value, [pathKey]: source.path };
  return ['parsedAgents', 'parsedSubagents'].includes(name)
    ? { ...result, sourceDigest: source.sha256 } : result;
}

function output(caseId = 'project-over-global') {
  const global = seed('global-agent-markdown'), isGlobal = caseId === 'global-only';
  const source = {
    agent: isGlobal ? global : seed('project-agent-markdown'), profile: seed(isGlobal ? 'global-profiles' : 'project-profiles'),
    settings: seed(isGlobal ? 'global-settings' : 'project-settings'),
  };
  const value: any = { ...Object.fromEntries(families.map(([name]) => [name, []])), precedence: [], provenance: [], diagnostics: [] };
  for (const [name, identity, valueKey, sourceType] of families) {
    const values = name === 'numericValues' ? [2, 3]
      : ['continuation', 'tools'].includes(name) ? [true, false] : ['value\uE000', 'value\u{10000}'];
    value[name] = ['name\uE000', 'name\u{10000}'].map((key, index) => direct(name, key, values[index], source[sourceType]));
    for (const item of value[name]) {
      const field = `${name}:${identity.split(' ').map((key) => item[key]).join(':')}`;
      const selected = item.sourcePath ?? item.path;
      const globalSource = sourceType === 'agent' ? global
        : seed(sourceType === 'profile' ? 'global-profiles' : 'global-settings');
      const candidates = caseId === 'project-over-global'
        ? [{ sourcePath: globalSource.path, value: item[valueKey] }, { sourcePath: selected, value: item[valueKey] }]
        : [{ sourcePath: selected, value: item[valueKey] }];
      value.precedence.push({ field, candidates, selectedSourcePath: selected, selectedValue: item[valueKey] });
      value.provenance.push({
        field, sourceKind: scope(source[sourceType]), path: selected, seedDigest: source[sourceType].sha256,
      });
    }
  }
  if (caseId === 'malformed-source') value.diagnostics = [{
    code: 'PB03_MALFORMED_SOURCE', severity: 'error', path: seed('malformed-source').path,
    message: 'Malformed PB-03 source.',
  }];
  if (caseId === 'shadowed-source') {
    value.diagnostics = [{
      code: 'PB03_SHADOWED_SOURCE', severity: 'warning', path: seed('shadowed-source').path,
      message: 'Shadowed PB-03 source.',
    }];
    value.precedence[0].candidates.push({
      sourcePath: seed('shadowed-source').path, value: value.precedence[0].selectedValue,
    });
  }
  return value;
}

const invoke = (caseId = 'project-over-global', observe: any = () => output(caseId)) => adaptPB03({
  fixtureRoot: fixturePath, fixture: fixture(), caseId, target: { observe },
});
const rejects = (mutate: (value: any) => void) => {
  const value = output();
  expect(invoke('project-over-global', () => value).observation).toBeTruthy();
  mutate(value);
  expect(() => invoke('project-over-global', () => value)).toThrow('invalid PB-03');
};

describe('PB-03 adapter semantic core', () => {
  it.each(['global-only', 'project-only', 'project-over-global', 'malformed-source', 'shadowed-source'])(
    'returns the exact rich shape for %s', (caseId) => {
      let calls = 0;
      let descriptor: any;
      const result = invoke(caseId, (input: any) => {
        calls += 1;
        descriptor = input;
        return output(caseId);
      });
      expect(calls).toBe(1);
      expect(Object.keys(result.observation)).toEqual(keys);
      families.forEach(([name]) => expect(result.observation[name]).toHaveLength(2));
      expect(descriptor).toEqual({ caseId, seeds: fixture().seeds });
      expect(frozen(descriptor)).toBe(true);
      expect(frozen(result)).toBe(true);
    },
  );
  it('accepts a nonempty one-record precursor', () => {
    const value = output('project-only');
    for (const [name] of families) value[name] = [value[name][0]];
    value.precedence = value.precedence.filter((_: any, index: number) => index % 2 === 0);
    value.provenance = value.provenance.filter((_: any, index: number) => index % 2 === 0);
    expect(invoke('project-only', () => value).observation.parsedAgents).toHaveLength(1);
  });
  it('retains the complete rich observer output in reverse-code-unit order', () => {
    let observed: any;
    const expected = output();
    expect(invoke('project-over-global', () => (observed = output()))).toEqual(
      expect.objectContaining({ observation: expected }),
    );
    expect(observed).toEqual(expected);
    expect(observed.parsedAgents.slice(0, 2).map((item: any) => item.name)).toEqual(['name\uE000', 'name\u{10000}']);
  });
  it('rejects a legal root proxy with reversed schema order without live reads', () => {
    const source = output(), manifest = Reflect.ownKeys(source).reverse(); let ownKeys = 0, gets = 0;
    const descriptors: PropertyKey[] = [];
    expect(invoke('project-over-global', () => source).observation).toBeTruthy();
    const reversed = new Proxy(source, {
      ownKeys() { ownKeys += 1; return manifest; },
      getOwnPropertyDescriptor(value, key) {
        descriptors.push(key); return Reflect.getOwnPropertyDescriptor(value, key);
      },
      get() { gets += 1; throw Error('live get'); },
    });
    expect(() => invoke('project-over-global', () => reversed)).toThrow('invalid PB-03');
    expect(ownKeys).toBe(1);
    expect(descriptors).toEqual(manifest);
    expect(gets).toBe(0);
  });
  it('returns an exact fresh deep-frozen copy without observer-input aliasing', () => {
    const values = [output(), output()];
    const results = values.map((value) => invoke('project-over-global', () => value));
    expect(results[0]).toEqual({
      identity: 'PB-03',
      fixtureId: 'pb-03-configuration-fixture-v1',
      procedureId: 'pb-03-seeded-configuration-v1',
      normalizationId: 'pb-03-configuration-observation-v1',
      caseId: 'project-over-global',
      observation: output(),
    });
    expect(results[0]).not.toBe(results[1]);
    expect(frozen(results[0])).toBe(true);
    values[0].parsedAgents[0].name = 'changed';
    expect(results[0].observation.parsedAgents[0].name).toBe('name\uE000');
  });
  it('uses fresh frozen descriptors and rejects an observe accessor independently of live gets', () => {
    const seen: any[] = [];
    const observe = (input: any) => { seen.push(input); return output(); };
    invoke('project-over-global', observe);
    invoke('project-over-global', observe);
    expect(seen[0]).not.toBe(seen[1]);
    expect(() => { seen[0].caseId = 'bad'; }).toThrow();
    const accessor: any = {};
    Object.defineProperty(accessor, 'observe', { enumerable: true, get: () => observe });
    expect(() => adaptPB03({
      fixtureRoot: fixturePath,
      fixture: fixture(),
      caseId: 'project-over-global',
      target: accessor,
    })).toThrow('invalid PB-03');
    const target = new Proxy({ observe }, {
      get(value, key) {
        if (key === 'observe') throw new Error('live');
        return Reflect.get(value, key);
      },
    });
    expect(adaptPB03({
      fixtureRoot: fixturePath,
      fixture: fixture(),
      caseId: 'project-over-global',
      target,
    }).observation).toBeTruthy();
  });
  it.each([
    ['every direct family empty', (value: any) => families.forEach(([name]) => { value[name] = []; })],
    ['parsed agent assigned a settings seed role', (value: any) => {
      const source = seed('project-settings'), item = value.precedence[0];
      Object.assign(value.parsedAgents[0], { sourcePath: source.path, sourceDigest: source.sha256 });
      item.candidates[1].sourcePath = source.path;
      item.selectedSourcePath = source.path;
      Object.assign(value.provenance[0], { path: source.path, seedDigest: source.sha256 });
    }],
    ['ghost provenance field', (value: any) => { value.provenance[0].field = 'ghost:field'; }],
    ['bad provenance digest', (value: any) => { value.provenance[0].seedDigest = '0'.repeat(64); }],
    ['duplicate effective field ID', (value: any) => value.parsedAgents.push({ ...value.parsedAgents[0] })],
    ['duplicate precedence field ID', (value: any) => value.precedence.push({ ...value.precedence[0] })],
    ['malformed seed as direct effective source', (value: any) => Object.assign(value.parsedAgents[0], {
      sourcePath: seed('malformed-source').path, sourceDigest: seed('malformed-source').sha256,
    })],
    ['malformed seed as precedence candidate', (value: any) => value.precedence[0].candidates.push({
      sourcePath: seed('malformed-source').path, value: value.precedence[0].selectedValue,
    })],
    ['shadowed seed as direct effective source', (value: any) => Object.assign(value.parsedAgents[0], {
      sourcePath: seed('shadowed-source').path, sourceDigest: seed('shadowed-source').sha256,
    })],
    ['shadowed seed as provenance source', (value: any) => Object.assign(value.provenance[0], {
      path: seed('shadowed-source').path, seedDigest: seed('shadowed-source').sha256,
    })],
    ['shadowed seed as selected source', (value: any) => {
      const item = value.precedence[0];
      item.candidates.push({ sourcePath: seed('shadowed-source').path, value: item.selectedValue });
      item.selectedSourcePath = seed('shadowed-source').path;
    }],
  ])('rejects %s with a valid precursor', (_, mutate) => rejects(mutate));
  it('rejects a duplicate provenance field ID from an independent valid precursor', () => {
    const value = output('project-only');
    expect(invoke('project-only', () => value).observation.provenance).toHaveLength(value.provenance.length);
    value.provenance[1].field = value.provenance[0].field;
    expect(() => invoke('project-only', () => value)).toThrow('invalid PB-03');
  });
  it('enforces malformed and shadowed diagnostics and permits exactly one unselected shadowed loser', () => {
    for (const caseId of ['malformed-source', 'shadowed-source'] as const) {
      expect(() => invoke(caseId, () => {
        const value = output(caseId);
        value.diagnostics = [];
        return value;
      })).toThrow('invalid PB-03');
    }
    expect(invoke('shadowed-source').observation.diagnostics).toHaveLength(1);
  });
  it('enforces exact schemas from a fresh valid precursor at every top and nested record', () => {
    const records = (value: any) => [value.precedence[0], value.precedence[0].candidates[0], value.provenance[0], value.diagnostics[0]];
    const mutate = [
      ['wrong container', (value: any, key: string) => { value[key] = {}; }],
      ['null container', (value: any, key: string) => { value[key] = null; }],
      ['string container', (value: any, key: string) => { value[key] = 'bad'; }],
      ['holey container', (value: any, key: string) => { delete value[key][0]; }],
      ['extra own property', (value: any, key: string) => { value[key].extra = true; }],
      ['symbol property', (value: any, key: string) => { value[key][Symbol('bad')] = true; }],
    ] as const;
    for (const key of keys) for (const [label, change] of mutate) {
      const caseId = key === 'diagnostics' ? 'malformed-source' : 'project-over-global', value = output(caseId);
      expect(invoke(caseId, () => value).observation).toBeTruthy();
      change(value, key); expect(() => invoke(caseId, () => value), `${key}: ${label}`).toThrow('invalid PB-03');
    }
    for (const [index, key] of records(output('malformed-source')).flatMap((record, index) => Object.keys(record).map((key) => [index, key] as const))) {
      const value = output('malformed-source'); expect(invoke('malformed-source', () => value).observation).toBeTruthy();
      delete records(value)[index][key];
      expect(() => invoke('malformed-source', () => value), `nested ${index}: missing ${key}`).toThrow('invalid PB-03');
    }
  });

  it('rejects hostile snapshot boundaries without invoking accessors', () => {
    const hostile: [string, (value: any) => void][] = [
      ['root nonenumerable', (value) => Object.defineProperty(value, 'hidden', { value: true })],
      ['family array hole', (value) => delete value.parsedAgents[0]],
      ['direct record symbol', (value) => { value.parsedAgents[0][Symbol('bad')] = true; }],
      ['candidate nonenumerable', (value) => Object.defineProperty(value.precedence[0].candidates[0], 'hidden', { value: true })],
      ['custom prototype', (value) => Object.setPrototypeOf(value.provenance[0], null)],
      ['root cycle', (value) => { value.parsedAgents[0].loop = value; }],
      ['nested cycle', (value) => { value.parsedAgents[0].loop = value.parsedAgents[0]; }],
      ['shared DAG', (value) => { value.parsedSubagents[0] = value.parsedAgents[0]; }],
      ['NaN', (value) => { value.numericValues[0].value = NaN; }],
      ['Infinity', (value) => { value.numericValues[0].value = Infinity; }],
      ['negative Infinity', (value) => { value.numericValues[0].value = -Infinity; }],
      ['negative zero', (value) => { value.numericValues[0].value = -0; }],
    ];
    for (const [label, mutate] of hostile) rejects((value) => mutate(value));
    for (const [label, locate, key] of [
      ['root', (value: any) => value, 'parsedAgents'],
      ['family array', (value: any) => value.parsedAgents, '0'],
      ['direct record', (value: any) => value.parsedAgents[0], 'name'],
      ['candidate', (value: any) => value.precedence[0].candidates[0], 'value'],
    ] as const) {
      const value = output(), target = locate(value), original = Object.getOwnPropertyDescriptor(target, key)!; let calls = 0;
      Object.defineProperty(target, key, { enumerable: true, configurable: true, get: () => { calls += 1; throw Error('get'); } });
      expect(() => invoke('project-over-global', () => value), `${label} accessor`).toThrow('invalid PB-03');
      expect(calls, `${label} getter`).toBe(0);
      Object.defineProperty(target, key, original);
    }
    // Effective fields are primitive-only, so the direct-record accessor is the nearest allowed traversal substitution.
  });

  it('uses primitive wrong-type matrices only for effective records and deep bindings for polymorphic values', () => {
    const binding = (value: any, family: string) => value.precedence.find((item: any) => item.field.startsWith(`${family}:`));
    const matrix: [string, (value: any) => void][] = [
      ['string effective boolean', (value) => { value.parsedAgents[0].name = false; }],
      ['string effective object', (value) => { value.parsedAgents[0].name = {}; }],
      ['boolean effective string', (value) => { value.continuation[0].enabled = 'true'; }],
      ['numeric effective string', (value) => { value.numericValues[0].value = '2'; }],
      ['numeric effective object', (value) => { value.numericValues[0].value = {}; }],
      ['string candidate binding', (value) => { binding(value, 'parsedAgents').candidates[1].value = false; }],
      ['boolean candidate binding', (value) => { binding(value, 'continuation').candidates[1].value = 'true'; }],
      ['numeric candidate binding', (value) => { binding(value, 'numericValues').candidates[1].value = {}; }],
      ['string selected binding', (value) => { binding(value, 'parsedAgents').selectedValue = false; }],
      ['boolean selected binding', (value) => { binding(value, 'continuation').selectedValue = 'true'; }],
      ['numeric selected binding', (value) => { binding(value, 'numericValues').selectedValue = {}; }],
    ];
    for (const [label, mutate] of matrix) rejects((value) => mutate(value));
    for (const [family] of families) for (const field of Object.keys(output()[family][0])) {
      const value = output(); delete value[family][0][field];
      expect(() => invoke('project-over-global', () => value), `${family}.${field}: omission`).toThrow('invalid PB-03');
    }
    for (const numeric of [NaN, Infinity, -Infinity, -0]) {
      const value = output(); value.numericValues[0].value = numeric;
      expect(() => invoke('project-over-global', () => value), `numeric snapshot boundary: ${numeric}`).toThrow('invalid PB-03');
    }
  });

  it('exhausts every container hostile shape from accepted cardinalities', () => {
    for (const key of keys) for (const [label, mutate] of [
      ['type', (value: any) => { value[key] = {}; }], ['hole', (value: any) => delete value[key][0]],
      ['symbol', (value: any) => { value[key][Symbol(key)] = true; }],
      ['nonenumerable', (value: any) => Object.defineProperty(value[key], 'hidden', { value: true })],
      ['accessor', (value: any) => Object.defineProperty(value[key], '0', { enumerable: true, get: () => true })],
    ] as const) {
      const caseId = key === 'diagnostics' ? 'malformed-source' : 'project-over-global', value = output(caseId);
      expect(invoke(caseId, () => value).observation).toBeTruthy(); mutate(value);
      expect(() => invoke(caseId, () => value), `${key}: ${label}`).toThrow('invalid PB-03');
    }
  });

  it('rejects fresh branch-isolated precedence and provenance contradictions', () => {
    const rebind = (value: any, path: string) => {
      const item = value.precedence[0], source = fixture().seeds.find((seed: any) => seed.path === path);
      item.selectedSourcePath = path; item.selectedValue = value.parsedAgents[0].description;
      item.candidates = [{ sourcePath: path, value: item.selectedValue }];
      Object.assign(value.parsedAgents[0], { sourcePath: path, sourceDigest: source.sha256 });
      Object.assign(value.provenance[0], { path, seedDigest: source.sha256, sourceKind: scope(source) });
    };
    const mutations: [string, (value: any) => void][] = [
      ['empty candidates', (value) => { value.precedence[0].candidates = []; }],
      ['orphan precedence field', (value) => { value.precedence[0].field = 'orphan:field'; }],
      ['duplicate candidate record', (value) => { value.precedence[0].candidates.push({ ...value.precedence[0].candidates[1] }); }],
      ['zero selected match', (value) => { value.precedence[0].selectedSourcePath = 'missing.md'; }],
      ['selected-value mismatch', (value) => { value.precedence[0].selectedValue = 'other'; }],
      ['effective mismatch', (value) => { value.parsedAgents[0].description = 'other'; }],
      ['valid wrong provenance kind', (value) => { value.provenance[0].sourceKind = 'global'; }],
      ['other-seed digest mismatch', (value) => { value.provenance[0].seedDigest = seed('global-agent-markdown').sha256; }],
      ['digest-only mismatch', (value) => { value.provenance[0].seedDigest = '0'.repeat(64); }],
      ['rebound wrong allowed source', (value) => rebind(value, seed('project-settings').path)],
    ];
    for (const [label, mutate] of mutations) {
      const value = output(); mutate(value);
      expect(() => invoke('project-over-global', () => value), label).toThrow('invalid PB-03');
    }
    // Two selected path matches are necessarily duplicate candidate paths; no separate structural branch exists.
  });

  it('rejects nested schema and semantic enum mutations after snapshot capture', () => {
    const entries = (value: any) => [value.precedence[0], value.precedence[0].candidates[0], value.provenance[0], value.diagnostics[0]];
    for (const [index, field] of entries(output('malformed-source')).flatMap((item, index) => Object.keys(item).map((field) => [index, field] as const))) {
      for (const mutate of [(item: any) => delete item[field], (item: any) => { item.extra = true; }]) {
        const value = output('malformed-source'); mutate(entries(value)[index]);
        expect(() => invoke('malformed-source', () => value), `nested ${index}.${field}`).toThrow('invalid PB-03');
      }
    }
    for (const [path, field, replacement, boundary] of [
      ['provenance', 'sourceKind', 'invalid', 'semantic'], ['diagnostics', 'severity', 'invalid', 'semantic'],
      ['diagnostics', 'message', 'bad\u0000', 'snapshot boundary'],
    ] as const) {
      const value = output('malformed-source'); value[path][0][field] = replacement;
      expect(() => invoke('malformed-source', () => value), `${path}.${field} ${boundary}`).toThrow('invalid PB-03');
    }
  });

  it('rejects malformed and shadowed sources at their first reachable guards', () => {
    const guard = {
      effective: 'direct-record/whole effective source admission', candidate: 'candidate admission',
      selected: 'candidate admission preempts selected-source case guard',
      provenance: 'provenance binding mismatch preempts case exclusion',
    };
    for (const role of ['malformed-source', 'shadowed-source']) for (const family of ['parsedAgents', 'modelSettings', 'defaults'] as const) {
      for (const placement of ['effective', 'candidate', 'selected', 'provenance'] as const) {
        const value = output(), source = seed(role), item = value.precedence.find((entry: any) => entry.field.startsWith(`${family}:`));
        const direct = value[family][0], pathKey = 'sourcePath' in direct ? 'sourcePath' : 'path';
        expect(invoke('project-over-global', () => value).observation).toBeTruthy();
        if (placement === 'effective') Object.assign(direct, {
          [pathKey]: source.path, ...(pathKey === 'sourcePath' ? { sourceDigest: source.sha256 } : {}),
        });
        if (placement === 'candidate') item.candidates.push({ sourcePath: source.path, value: item.selectedValue });
        if (placement === 'selected') {
          item.candidates.push({ sourcePath: source.path, value: item.selectedValue });
          item.selectedSourcePath = source.path;
        }
        if (placement === 'provenance') Object.assign(
          value.provenance.find((entry: any) => entry.field === item.field),
          { path: source.path, seedDigest: source.sha256 },
        );
        expect(() => invoke('project-over-global', () => value), `${role}/${family}/${placement}: ${guard[placement]}`).toThrow('invalid PB-03');
      }
    }
    // These labels identify the first reachable guard; later case guards are intentionally not claimed.
    expect(invoke('shadowed-source').observation.precedence[0].candidates.filter((candidate: any) => candidate.sourcePath === seed('shadowed-source').path)).toHaveLength(1);
  });

  it('rejects traversal-relevant hostile shapes at root, array, direct-record, and candidate placements', () => {
    const locate = [
      ['root', (value: any) => value], ['family array', (value: any) => value.parsedAgents],
      ['direct record', (value: any) => value.parsedAgents[0]],
      ['candidate', (value: any) => value.precedence[0].candidates[0]],
    ] as const;
    for (const [placement, targetOf] of locate) for (const [shape, mutate] of [
      ['symbol', (value: any, target: any) => { target[Symbol('bad')] = true; }],
      ['nonenumerable', (_: any, target: any) => Object.defineProperty(target, 'hidden', { value: true })],
      ['custom prototype', (_: any, target: any) => Object.setPrototypeOf(target, null)],
      ['cycle', (_: any, target: any) => {
        if (Array.isArray(target)) target[0] = target; else target.loop = target;
      }],
      ['shared DAG', (value: any, target: any) => {
        if (placement === 'root') value.parsedSubagents[0] = value.parsedAgents[0];
        else if (placement === 'family array') target[1] = target[0];
        else if (placement === 'direct record') value.parsedSubagents[0] = target;
        else target.value = value.parsedAgents[0];
      }],
    ] as const) {
      const value = output();
      expect(invoke('project-over-global', () => value).observation).toBeTruthy();
      mutate(value, targetOf(value));
      expect(() => invoke('project-over-global', () => value), `${placement}: ${shape}`).toThrow('invalid PB-03');
    }
    for (const [placement, targetOf, key] of [
      ['root', (value: any) => value, 'parsedAgents'], ['family array', (value: any) => value.parsedAgents, '0'],
      ['direct record', (value: any) => value.parsedAgents[0], 'name'],
      ['candidate', (value: any) => value.precedence[0].candidates[0], 'value'],
    ] as const) {
      const value = output(), target = targetOf(value); let calls = 0;
      expect(invoke('project-over-global', () => value).observation).toBeTruthy();
      Object.defineProperty(target, key, { enumerable: true, configurable: true, get: () => { calls += 1; throw Error('get'); } });
      expect(() => invoke('project-over-global', () => value), `${placement}: accessor`).toThrow('invalid PB-03');
      expect(calls, `${placement}: getter`).toBe(0);
    }
    const hole = output();
    expect(invoke('project-over-global', () => hole).observation).toBeTruthy();
    delete hole.parsedAgents[0];
    expect(() => invoke('project-over-global', () => hole), 'family array: hole').toThrow('invalid PB-03');
    for (const numeric of [NaN, -0]) {
      const value = output();
      expect(invoke('project-over-global', () => value).observation).toBeTruthy();
      value.numericValues[0].value = numeric;
      expect(() => invoke('project-over-global', () => value), `numeric direct record: ${numeric}`).toThrow('invalid PB-03');
    }
    // Holes only occupy family arrays; nonfinite/-0 values only occupy numeric direct records.
  });

  it('rejects hostile array manifests without live reads', () => {
    const source = output(), target = source.parsedAgents, manifest = ['x', '1', 'length'];
    expect(invoke('project-over-global', () => source).observation).toBeTruthy();
    let ownKeys = 0, gets = 0; const descriptors: PropertyKey[] = [];
    const hostile = new Proxy(target, {
      ownKeys() { ownKeys += 1; return manifest; },
      getOwnPropertyDescriptor(value, key) {
        descriptors.push(key); return Reflect.getOwnPropertyDescriptor(value, key);
      },
      get() { gets += 1; throw Error('live get'); },
    });
    expect(() => invoke('project-over-global', () => ({ ...source, parsedAgents: hostile }))).toThrow('invalid PB-03');
    expect(ownKeys).toBe(1);
    expect(descriptors).toEqual(manifest);
    expect(gets).toBe(0);
  });

  it('rejects a nonwritable array length manifest without live reads', () => {
    const source = output(), target = source.parsedAgents;
    expect(invoke('project-over-global', () => source).observation).toBeTruthy();
    Object.defineProperty(target, 'length', { writable: false });
    const manifest = Reflect.ownKeys(target), descriptors: PropertyKey[] = []; let ownKeys = 0, gets = 0;
    const hostile = new Proxy(target, {
      ownKeys() { ownKeys += 1; return manifest; },
      getOwnPropertyDescriptor(value, key) {
        descriptors.push(key); return Reflect.getOwnPropertyDescriptor(value, key);
      },
      get() { gets += 1; throw Error('live get'); },
    });
    expect(() => invoke('project-over-global', () => ({ ...source, parsedAgents: hostile }))).toThrow('invalid PB-03');
    expect(ownKeys).toBe(1);
    expect(descriptors).toEqual(manifest);
    expect(gets).toBe(0);
  });

  it('captures stable root, family-array, direct-record, and candidate proxies exactly once', () => {
    const locations: [string, (value: any, proxy: any) => any, (value: any) => object][] = [
      ['root', (_, proxy) => proxy, (value) => value],
      ['family array', (value, proxy) => ({ ...value, parsedAgents: proxy }), (value) => value.parsedAgents],
      ['direct record', (value, proxy) => ({
        ...value, parsedAgents: [proxy, value.parsedAgents[1]],
      }), (value) => value.parsedAgents[0]],
      ['candidate', (value, proxy) => ({
        ...value,
        precedence: [{ ...value.precedence[0], candidates: [proxy, value.precedence[0].candidates[1]] }, ...value.precedence.slice(1)],
      }), (value) => value.precedence[0].candidates[0]],
    ];
    for (const [label, place, locate] of locations) {
      const source = output(), target = locate(source); let ownKeys = 0, descriptors = 0, gets = 0;
      const proxy = new Proxy(target, {
        ownKeys(value) { ownKeys += 1; return Reflect.ownKeys(value); },
        getOwnPropertyDescriptor(value, key) {
          descriptors += 1; return Reflect.getOwnPropertyDescriptor(value, key);
        },
        get() { gets += 1; throw Error('live get'); },
      });
      expect(invoke('project-over-global', () => place(source, proxy)).observation).toEqual(output());
      expect(ownKeys, label).toBe(1);
      expect(descriptors, label).toBe(Reflect.ownKeys(target).length);
      expect(gets, label).toBe(0);
    }
    const throwingDescriptor = new Proxy({ observe: () => output() }, {
      getOwnPropertyDescriptor() { throw Error('descriptor'); },
    });
    expect(() => adaptPB03({
      fixtureRoot: fixturePath, fixture: fixture(), caseId: 'project-over-global', target: throwingDescriptor,
    })).toThrow('invalid PB-03');
    let calls = 0, descriptors = 0, gets = 0, stable = true;
    const target = new Proxy({ observe: () => output() }, {
      getOwnPropertyDescriptor(value, key) {
        descriptors += 1;
        return stable ? Reflect.getOwnPropertyDescriptor(value, key) : { value: 1, enumerable: true, configurable: true };
      },
      get() { gets += 1; throw Error('live get'); },
    });
    expect(adaptPB03({ fixtureRoot: fixturePath, fixture: fixture(), caseId: 'project-over-global', target }).observation).toBeTruthy();
    stable = false; calls += 1;
    expect(() => adaptPB03({ fixtureRoot: fixturePath, fixture: fixture(), caseId: 'project-over-global', target })).toThrow('invalid PB-03');
    expect(calls).toBe(1); expect(descriptors).toBe(2); expect(gets).toBe(0);
  });

  it('rejects top-level schema changes', () => {
    rejects((value) => delete value.tools);
    rejects((value) => { value.extra = true; });
  });
});
