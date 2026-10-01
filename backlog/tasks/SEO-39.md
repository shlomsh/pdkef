---
id: "SEO-39"
title: "The 2026-10-08 Search Console read"
status: "blocked"
priority: "P1"
epic: "seo-awaiting-read"
phase: "near-term"
depends_on: []
---

# SEO-39 · The 2026-10-08 Search Console read

One dated read replaces seven separate tickets. Everything below is shipped and waiting; nothing is left to build before the read.

## What to export on 2026-10-08

- Performance, three months: queries and pages, with clicks, impressions, CTR and position.
- Pages, Not indexed: the reasons and the URL list.
- AI features: the report as exported.
- Crawl dates: the Coverage Valid export's `Last crawled` column into `docs/seo-last-crawled.json`, then `npm run seo:crawl-staleness`.

Then run `npm run seo:refresh` on the Performance export and record the numbers in the SEO-02 table.

## Checklist, one line per folded ticket

- [ ] SEO-09: read the `/split/` extract cluster (`extract pdf`, `pdf extract`, `pdf extractor`, about 92 impressions at position 85 before) after confirming `/split/` was recrawled. Decision: close, or reopen with a finding on the extract vocabulary.
- [ ] SEO-10: read `/merge/` on the no-limit queries (`merge pdf online free no limit`), position and CTR against the SEO-02 table. Check its crawl date first: it is an unrequested control URL, so if it is still on its August date decide then whether to request indexing.
- [ ] SEO-25: read the CTR effect on the compress-quality cluster after the before-and-after preview (PDF and image modes). Decision: did the preview move CTR, and does it stay as built.
- [ ] SEO-28: compare the crawl dates of `/redact/` and `/split/` against the `/merge/` and `/unlock/` controls. Decision by outcome: crawl trust rising on its own (close), recrawl bought by the request (keep watching), or still stale (escalate to Crawl Stats, robots, canonicals and SEO-03). `/unlock/` was edited on 2026-09-19, so it is no longer a clean control.
- [ ] SEO-33: read positions on `pdf size reducer`, `shrink pdf size` and `resize pdf` for `/compress/`, alongside SEO-05. Decision: whether the reduce/shrink/resize vocabulary earned anything.
- [ ] SEO-34: read `pdf tools` and `free pdf tools` impressions and the home page's position and CTR. Decision: whether targeting `pdf tools` on `/` worked.
- [ ] SEO-35: read the combine vocabulary on `/merge/` together with SEO-10. The expected verdict is "small or none"; record it and stop on Merge copy (SEO-16 treats Merge as settled by this).

## Stays separate

SEO-04, SEO-05 and SEO-06 stay separate tickets, because each verdict may spawn work. SEO-17, SEO-18 and LOC-03 get a crawl-state first look at this refresh; their eight-week reads are in SEO-40 and their own tickets.
