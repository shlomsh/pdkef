import { describe, expect, it } from 'vitest';
import { documentationSourceFiles, gitFileLastModifiedIso, lastModifiedFor } from './gitLastModified.js';

describe('documentationSourceFiles', () => {
  it('dates an English page by its YAML and the shared route template', () => {
    expect(documentationSourceFiles('how-to-sign-a-pdf-on-mac')).toEqual([
      'src/content/content-pages/how-to-sign-a-pdf-on-mac.yaml',
      'src/pages/[contentPage].astro',
    ]);
  });

  it('dates a localized edition by its own translation file', () => {
    expect(documentationSourceFiles('install-pdf-app', 'he')).toEqual([
      'src/content/localized-pages/he/install-pdf-app.yaml',
    ]);
  });
});

describe('lastModifiedFor', () => {
  it('reads a real commit date for a tracked file and picks the latest of a set', () => {
    const yaml = gitFileLastModifiedIso('src/content/content-pages/how-to-sign-a-pdf-on-mac.yaml');
    const template = gitFileLastModifiedIso('src/pages/[contentPage].astro');
    expect(yaml).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(template).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(lastModifiedFor(documentationSourceFiles('how-to-sign-a-pdf-on-mac'))).toBe(
      yaml > template ? yaml : template,
    );
  });

  it('falls back to a build timestamp rather than nothing when no file has history', () => {
    expect(gitFileLastModifiedIso('src/does-not-exist.yaml')).toBeNull();
    expect(lastModifiedFor(['src/does-not-exist.yaml'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
