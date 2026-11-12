import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyticsEnv, analyticsOrigin } from './analyticsOrigin.mjs';

const HOST = 'https://e.example.test';

describe('analyticsOrigin', () => {
  it('is null when both variables are unset or empty', () => {
    expect(analyticsOrigin({})).toBeNull();
    expect(analyticsOrigin({ PUBLIC_ANALYTICS_HOST: '', PUBLIC_ANALYTICS_KEY: '' })).toBeNull();
  });

  it('returns the origin of an https host when both are set', () => {
    expect(analyticsOrigin({ PUBLIC_ANALYTICS_HOST: `${HOST}/x`, PUBLIC_ANALYTICS_KEY: 'k' })).toBe(HOST);
  });

  it('throws, naming both variables, when only one is set', () => {
    expect(() => analyticsOrigin({ PUBLIC_ANALYTICS_HOST: HOST })).toThrow(/PUBLIC_ANALYTICS_HOST.*PUBLIC_ANALYTICS_KEY/);
    expect(() => analyticsOrigin({ PUBLIC_ANALYTICS_KEY: 'k' })).toThrow(/PUBLIC_ANALYTICS_HOST.*PUBLIC_ANALYTICS_KEY/);
  });

  it('throws, naming the variable, for http or garbage hosts', () => {
    expect(() => analyticsOrigin({ PUBLIC_ANALYTICS_HOST: 'http://e.example.test', PUBLIC_ANALYTICS_KEY: 'k' })).toThrow(/PUBLIC_ANALYTICS_HOST/);
    expect(() => analyticsOrigin({ PUBLIC_ANALYTICS_HOST: 'nonsense', PUBLIC_ANALYTICS_KEY: 'k' })).toThrow(/PUBLIC_ANALYTICS_HOST/);
  });
});

describe('analyticsEnv', () => {
  it('reads .env.local, and the process env wins', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-env-'));
    fs.writeFileSync(path.join(cwd, '.env.local'), `PUBLIC_ANALYTICS_HOST=${HOST}\nPUBLIC_ANALYTICS_KEY=filekey\n`);
    expect(analyticsEnv(cwd, {})).toMatchObject({ PUBLIC_ANALYTICS_HOST: HOST, PUBLIC_ANALYTICS_KEY: 'filekey' });
    expect(analyticsEnv(cwd, { PUBLIC_ANALYTICS_KEY: 'envkey' })).toMatchObject({ PUBLIC_ANALYTICS_KEY: 'envkey' });
  });
});
