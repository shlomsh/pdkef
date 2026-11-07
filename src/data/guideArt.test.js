import { describe, expect, it } from 'vitest';
import { tools } from './tools.js';
import { guideShelf } from './contentPages.js';
import { guideArt } from './guideArt.js';

describe('guideArt', () => {
  it('has a picture for every guide that leads or is picked on a tool page', () => {
    for (const tool of tools) {
      const shelf = guideShelf(tool.slug);
      if (!shelf) continue;
      for (const page of [shelf.lead, ...shelf.picks]) {
        expect(guideArt(page.href.replace(/\//g, '')), `${tool.slug}: ${page.href}`).toMatch(/^<svg [^>]*aria-hidden="true"/);
      }
    }
  });
});
