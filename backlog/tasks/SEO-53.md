---
id: "SEO-53"
title: "URL Inspection's live test fails with \"Robots.txt unreachable\" while robots.txt serves 200"
status: "done"
priority: "P1"
epic: "search-and-languages"
depends_on: []
---

# SEO-53 · The live test cannot fetch robots.txt

*Filed 2026-10-30* from Shlomi's URL Inspection of `/scan-to-pdf/`.

## What we saw

- Live test of `https://pdkef.com/scan-to-pdf/`, twice (16:49 and 16:52 Israel time, 14:49 and 14:52 UTC):
  "URL is not available to Google", "Not available due to a site-wide issue", Page fetch "Failed: Robots.txt
  unreachable", crawled as Google Inspection Tool smartphone. Google treats an unreachable robots.txt (a 5xx,
  a 429 or a timeout) as a reason to stop crawling the host.
- Crawl stats the same afternoon: 1.83K requests over three months, rising through late October; host
  `pdkef.com` shows "Problems in the past" with a green mark, `www.pdkef.com` "No problems". So ordinary
  Googlebot fetches of robots.txt succeed now; the live test's do not. SEO-47 recorded "robots.txt not
  available 0.47%" over the 90 days to 2026-10-21.

## What it is not (checked 2026-10-30)

- **The file:** `https://pdkef.com/robots.txt` returns 200 in about 0.3 s from Vercel's cache (fra1), plain
  text, to Googlebot's and Google-InspectionTool's user agents and to curl. Five lines; the only change since
  July is the `Content-Signal` line (d1feb331, 2026-10-05), which Google's parser skips as an unknown
  directive, and an unreadable line is a parse matter, not "unreachable".
- **DNS:** two A records, no AAAA, Vercel nameservers; Google Public DNS answers NOERROR in 10 ms.
- **TLS:** Let's Encrypt YR1, chain to ISRG Root YR cross-signed by ISRG Root X1, verifies, TLS 1.3, valid to
  2026-12-05.
- **Middleware:** its matcher skips any path with a file extension, so it never runs on robots.txt.
- **Firewall rules:** one custom rule, the rate limit on `/api/report`. The CLI cannot show the rest on the
  Hobby plan (`firewall overview` answers 402), and runtime logs do not include cached static files.
- **A deploy:** none reached production on 2026-10-30; the day's pushes were cancelled builds.
- **A Google incident:** none open on the Search Status Dashboard.

## Leading suspect

Vercel's automatic traffic filtering (system mitigations or bot protection) challenging Google's inspection
fetcher from a US address, which this machine cannot imitate. Vercel has challenged scripted requests to
pdkef.com before (403 `x-vercel-mitigated: challenge`). Inferred, not seen.

## Reads, 2026-10-30 afternoon

- **Vercel Firewall, past day:** Bot Protection inactive, System Mitigations active, one custom rule. Allowed
  24.5k, Denied 134, Challenged 283, Rate limited 13; the DDoS Mitigation rule acted 417 times. The challenged
  and denied spikes on the chart sit in the afternoon, near the live tests. Who they hit is not yet read.
- **Crawl stats, `www.pdkef.com` host status** (last updated 10-28): no problems in 90 days, robots.txt fetch
  at 0%. The "Problems in the past" is on the `pdkef.com` host, whose page is still to read.

- **Vercel Traffic filtered to DDoS Mitigation, past day:** top AS Techoff Srv 249, then 93, 35, Partner
  (this machine's checks, `curl/8.7.1`) 33, Leibniz-Rechenzentrum 2; top agents a Windows browser string 242,
  WP-Safe-Scanner 35, curl 32, a WebKit string 10, cohere-ai 8; top paths `/sw.js` 31, `/` 17, `/config.js`,
  `/config.json` and `/env.js` 4 each. No Google AS, no Google user agent and no `/robots.txt` in any top five.
  Each list stops at five rows, so two live-test fetches could sit below the cut: this argues against the
  Vercel suspect without excluding it.
- **Vercel project overview:** the one persistent firewall action is a Challenge from about 23:30 on 10-29,
  33 requests, which matches the Partner address (Shlomi's connection, during the MEM-29 scripted checks),
  not Google. Production is 952b691; later pushes changed only tickets and docs, so their builds cancelled.

## The checks planned (all three were read; see Result)

1. Crawl stats, click host `pdkef.com`: the robots.txt fetch chart and its failures (dates, response).
2. Vercel dashboard, Firewall, traffic around 14:45 to 14:55 UTC on 2026-10-30: any challenged or denied
   request to `/robots.txt`, and whether bot protection is on.
3. A live test of `https://pdkef.com/` to tell a site-wide failure from one URL.

If Vercel challenged the fetch, the fix is a firewall bypass for `/robots.txt` (or for verified crawlers),
tested with a live inspection afterwards.

## Context

The September 2026 spam update ran from 2026-09-24 to 2026-10-08 (Search Status Dashboard), and `/merge/`'s
page-one sample stopped on 10-08 (SEO-45, SEO-52). A date coincidence, recorded so the 11-07 read weighs it.

## Result (2026-10-30, 17:03 Israel time, read in Search Console directly)

- **The failure was a window of about a quarter of an hour, not a standing fault.** Live tests at 17:03 of
  `https://pdkef.com/` and of `/scan-to-pdf/` both pass: "URL is available to Google", page can be indexed.
  Nothing changed on our side between 16:52 and 17:03.
- **Host status, `pdkef.com`** (last updated 10-28): "Host had problems in the past". robots.txt fetch failed
  on 100% of its fetches on Mon 2026-08-17 and Tue 2026-09-29 (small blips around 08-21 and 09-27), DNS
  resolution on 100% on Sat 2026-10-03 (a blip around 09-14), server connectivity clean throughout, and all
  three acceptable since. At about 16 crawl requests a day, robots.txt is fetched about once a day, so a
  100% day can be a single failed fetch.
- **Vercel's status history** has no CDN or DNS incident on any of those days (08-17's incident was the
  dashboard only), and its firewall shows no Google traffic among what it denied or challenged.
- `/scan-to-pdf/` itself is "Discovered - currently not indexed", never crawled, found through the sitemap
  and `/how-to-scan-a-document-to-pdf/`; that is SCAN-01's 11-23 read, not this.

No change to make: the cause of the brief failures is not visible from either side, and none is recurring.
The 2026-11-07 read (SEO-40) looks at the `pdkef.com` host status again; a robots.txt or DNS failure day
after 10-03 reopens this with its date.

## Acceptance

- [x] The failure's cause is named with evidence: brief and not recurring (Search Console host status and
      two passing live tests); no Google or Vercel record names a cause, and Vercel's shows no incident
- [x] A live test of `/scan-to-pdf/` passes the page fetch (17:03)
- [x] Crawl stats show no robots.txt failure since 2026-09-29 (no fix was needed)
