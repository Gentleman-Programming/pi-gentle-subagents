import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageJson = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as Record<string, any>;

describe('pi package manifest', () => {
  it('has the canonical public npm package identity and metadata', () => {
    expect(packageJson.name).toBe('pi-gentle-subagents');
    expect(packageJson.packageManager).toBe('pnpm@11.1.1');
    expect(packageJson.private).not.toBe(true);
    expect(packageJson.license).toBe('MIT');
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/Gentleman-Programming/pi-gentle-subagents.git',
    });
    expect(packageJson.homepage).toBe('https://github.com/Gentleman-Programming/pi-gentle-subagents#readme');
    expect(packageJson.bugs).toEqual({
      url: 'https://github.com/Gentleman-Programming/pi-gentle-subagents/issues',
    });
    expect(packageJson.keywords).toEqual(expect.arrayContaining([
      'pi-package',
      'pi-extension',
      'subagents',
      'pi-gentle-subagents',
    ]));
  });

  it('declares pi resources for install and gallery discovery', () => {
    expect(packageJson.pi).toMatchObject({
      extensions: ['./index.ts'],
      skills: ['./skills'],
    });
    expect(packageJson.description).toMatch(/subagents/i);
  });

  it('does not bundle pi core runtime packages', () => {
    expect(packageJson.peerDependencies).toMatchObject({
      '@earendil-works/pi-coding-agent': '*',
      typebox: '*',
    });
    expect(packageJson.peerDependenciesMeta).toMatchObject({
      '@earendil-works/pi-coding-agent': { optional: true },
      typebox: { optional: true },
    });
    expect(packageJson.dependencies?.typebox).toBeUndefined();
  });

  it('limits the npm package to runtime resources and docs', () => {
    expect(packageJson.files).toEqual(expect.arrayContaining([
      'index.ts',
      'src',
      'skills',
      'scripts/verify-package-files.mjs',
      '.releaserc.json',
      'README.md',
      'LICENSE',
    ]));
    expect(packageJson.files).not.toContain('node_modules');
    expect(packageJson.files).not.toContain('test');
  });
});
