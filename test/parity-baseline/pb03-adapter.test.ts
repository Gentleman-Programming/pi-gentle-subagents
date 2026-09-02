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
const rejects = (mutate: (value: any) => void) => expect(() => invoke(
  'project-over-global', () => { const value = output(); mutate(value); return value; },
)).toThrow('invalid PB-03');

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
  it('rejects top-level schema changes', () => {
    rejects((value) => delete value.tools);
    rejects((value) => { value.extra = true; });
  });
});
