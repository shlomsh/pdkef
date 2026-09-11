// Markdown twin of 404.astro. middleware.ts serves this (with a 404 status)
// when a request for a path with no real route negotiates Accept:
// text/markdown - see HTTP-404-01 in CLAUDE.md's URL canonicalization
// section for why nonexistent paths need to reach a real 404 at all.
import { MARKDOWN_404_BODY } from '../lib/markdownRender.js';

export async function GET() {
  return new Response(MARKDOWN_404_BODY, {
    status: 404,
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
