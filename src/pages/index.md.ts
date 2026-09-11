// Markdown twin of the home page ("/" -> "/index.md"), same source as
// index.astro (src/data/homeContent.js) so the two can't drift. See
// [slug].md.ts for the equivalent on every tool/content/static page.
import { tools } from '../data/tools.js';
import { homeContent } from '../data/homeContent.js';
import { homeToMarkdown } from '../lib/markdownRender.js';

const body = homeToMarkdown({ ...homeContent, tools });

export async function GET() {
  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
