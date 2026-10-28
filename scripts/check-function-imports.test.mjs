import { describe, it, expect } from 'vitest';
import { findFunctionImportViolations, functionFiles } from './check-function-imports.mjs';

describe('findFunctionImportViolations', () => {
  const run = (specs) => findFunctionImportViolations('src/site-lib/errorReportStore.ts', specs);

  it('flags the alias and the .ts specifier that crashed /api/report', () => {
    const v = run(['#lib/telemetry/errorReportSchema.ts']);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toMatch(/alias/);
    expect(run(['../lib/telemetry/errorReportSchema.ts'])[0].reason).toMatch(/\.ts specifier/);
  });
  it('flags a relative import with no extension', () => {
    expect(run(['../lib/telemetry/errorReportSchema'])).toHaveLength(1);
  });
  it('accepts relative .js imports, packages and node: builtins', () => {
    expect(run(['../lib/telemetry/errorReportSchema.js', './ratingStore.js', '@vercel/functions', 'node:crypto'])).toEqual([]);
  });
});

describe('the real function closure', () => {
  it('reaches the report endpoint and its stores', () => {
    const files = functionFiles();
    expect(files).toContain('api/report.ts');
    expect(files).toContain('src/site-lib/errorReportStore.ts');
    expect(files).toContain('src/lib/telemetry/errorReportSchema.ts');
  });
});
