import fs from 'node:fs';
import { beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { answerNetwork, server } from '../../../test/support/network.ts';

declare const process: { cwd(): string };

/**
 * Call once at the top of a jsdom test file (a relative URL needs its page's origin). The editor fetches bundled
 * fonts from same-origin `/fonts/<name>` for real; MSW answers with the files in public/fonts, or a 404 for one
 * that is not there. `requested()` lists the font files asked for in the current test.
 */
export function serveFonts() {
  const names: string[] = [];
  answerNetwork();
  beforeEach(() => {
    names.length = 0;
    server.use(http.get('/fonts/:name', ({ params }) => {
      const name = String(params.name);
      names.push(name);
      const path = `${process.cwd()}/public/fonts/${name}`;
      if (!fs.existsSync(path)) return new HttpResponse(null, { status: 404 });
      return HttpResponse.arrayBuffer(new Uint8Array(fs.readFileSync(path)).buffer);
    }));
  });
  return { requested: () => [...names] };
}
