# AI PDF Filler: from the local prototype to a hosted beta

Date: 2026-09-30. Input for AI-05. Checkpoint: `codex/ai-pdf-filler` at `e0fa106`.
Status: research only. Nothing hosted has been built, requested or proven.

## Short answer

The official documentation does not offer this open-source app equivalent ChatGPT-plan inference from
a hosted website today. The open-source flow we use locally is documented for "open-source and locally
hosted apps", its only documented callback is a `127.0.0.1` loopback, and paid or remotely hosted apps
are sent to an interest form with no published criteria or timeline. A hosted beta therefore starts
with an application to OpenAI, not with infrastructure.

The lean path recommended below costs nothing to run. We ask OpenAI for hosted access, specifically
for a browser-only client where the page image goes straight from the person's device to OpenAI.
Meanwhile the hosted page stays manual Sign and says AI filling is not on the website yet. Build only
after a written answer. Every AI failure falls back to the manual Sign editor, which already works on
its own.

## Verified facts

Fetched from official documentation on 2026-09-30. Quotes are verbatim. The OpenAI pages also exist
as Markdown (append `.md`, index at `https://developers.openai.com/siwc/llms.txt`).

### Hosted availability, registration and eligibility

| Fact | Source |
| --- | --- |
| The open-source docs are scoped to local apps: "These docs explain ChatGPT plan usage for open-source and locally hosted apps. If you're interested in offering it in a paid or remotely hosted app, complete the interest form." | [Token sharing overview](https://developers.openai.com/siwc/token-sharing-open-source) |
| "ChatGPT plan usage is available to all open-source partners and selected private clients." and "Sign in with ChatGPT is currently available to selected commercial partners through a limited trial." | [Quickstart](https://developers.openai.com/siwc/quickstart) |
| Partner client IDs: "Sign in with ChatGPT is currently offered to a select group of commercial partners. To join the waitlist, complete the Sign in with ChatGPT interest form." | [Request a client ID](https://developers.openai.com/siwc/request-client-id) |
| The open-source flow's callback: "Use an HTTP loopback callback on `127.0.0.1` from initial registration onward", "only the port may vary", "Do not substitute with `localhost`." | [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) |
| Registration uses `client_id=dynamic_agent_client` and "This direct flow needs neither a client secret nor a partner API key." | [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) |
| The only remote-host pattern is a person's own VM, with OAuth still done locally: "A `127.0.0.1` callback reaches the computer running the browser, not the remote VM. Complete OAuth locally", then transfer the credential file "over a secure channel such as SSH". | [Self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms) |
| Eligible people: "Eligible ChatGPT Plus and Pro users can use their ChatGPT plan for AI requests in participating apps". | [Quickstart](https://developers.openai.com/siwc/quickstart) |
| Refusals exist for eligibility and region: `subscription_sharing_user_not_eligible` (403) and a 403 when "a policy or permission check, such as the permitted serving region, prevented admission." | [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery) |
| The website sign-in guide is identity only (`openid profile email`): "For standard identity-only sign-in, the required artifact is `id_token`." It uses an exact registered `https` callback per environment and supports "both public and confidential clients". | [Sign-in on your website](https://developers.openai.com/siwc/website) |

### Where credentials and requests run

| Fact | Source |
| --- | --- |
| "Keep access, refresh, and retained ID tokens in protected local or self-hosted runtime storage. Keep tokens out of browser storage, source control, logs, analytics, and support transcripts." | [Profiles and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions) |
| Inference goes to the public Responses API ("do not point it at ChatGPT's `backend-api` endpoints"), and "Set `store` to `false` and `stream` to `true` on each HTTP inference request in this flow." | [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) |
| Images are accepted; the Files API is not: "Audio/video input, the Files upload API, and the transcription API are not supported by this flow." | [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) |
| Access tokens last an hour (`expires_in: 3600`). | [Token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference) |
| Refresh tokens rotate, and refreshes for one session must be serialised. | [Profiles and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions) |

### Cost and usage

| Fact | Source |
| --- | --- |
| Requests use "usage included in the user's ChatGPT plan or available credits". No page states a fee to the app developer. | [Quickstart](https://developers.openai.com/siwc/quickstart) |
| "OpenAI does not silently switch the request to another billing path." | [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery) |
| Plus users share a five-hour limit across apps ("The five-hour usage limit does not apply for Pro users"), and people can cap an app's weekly usage. | [Profiles and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions) |

### Required user experience

| Fact | Source |
| --- | --- |
| The button reads **Continue with ChatGPT**. The first sign-in shows **You're using your ChatGPT plan** with **Got it**. While in use, show **Using ChatGPT plan** with a **Manage usage** link to `https://chatgpt.com/settings/usage`. | [UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines) |
| "Distinguish ChatGPT plan usage from your app's own subscription or charges." | [UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines) |

### Hosting on Vercel (only relevant if a server is ever needed)

| Fact | Source |
| --- | --- |
| "Hobby teams are restricted to non-commercial personal use only." The same page lists "Proxies and VPNs" under never fair use. | [Fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines) |
| "The maximum payload size for the request body or the response body of a Vercel Function is 4.5 MB". | [Function limitations](https://vercel.com/docs/functions/limitations) |
| Hobby functions: "300s default and maximum" duration. | [Function limitations](https://vercel.com/docs/functions/limitations) |
| Pro: "$20/month Pro platform fee", "$20/month in usage credit". | [Pro plan](https://vercel.com/docs/plans/pro-plan) |
| "If the request is waiting on I/O, CPU billing pauses but memory billing continues." | [Functions usage and pricing](https://vercel.com/docs/functions/usage-and-pricing) |
| "Vercel KV is no longer available"; a Redis integration from the Marketplace replaces it. | [Redis](https://vercel.com/docs/redis) |
| Astro keeps a static site and renders single endpoints on demand with `export const prerender = false` once an adapter is added. | [Astro on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/) |

## Observed, not documented

On 2026-09-30 a CORS preflight (`OPTIONS`, `Origin: https://pdkef.example`) to
`https://api.openai.com/v1/responses` and `https://auth.openai.com/api/accounts/oauth/token` returned
`access-control-allow-origin: *` and allowed `authorization,content-type`. A browser page can
technically reach both. No official page says a browser may call them with a person's token, so this
shows feasibility, not permission.

## What the repository already has

- `scripts/ai-pdf-filler/server.mjs` runs on `127.0.0.1:1455`. It keeps the access token in process
  memory only, never sends it to the browser, and relays one page image to `/v1/responses`.
- The island asks `/api/ai/status`. Without the runner it says AI needs the local runner and leaves
  the whole Sign editor usable (`src/tools/sign/ai/AiPdfFillerPanel.tsx`).
- One live local inference on one account is recorded in the integration notes. Hosted use, Hebrew
  live results, token usage and refresh are not.
- Hosting constraints: `output: 'static'`, one global meta CSP with `connect-src 'self'`
  (`astro.config.mjs`), and the invariant that no file bytes leave the device. The AI page is the
  scoped exception the PRD already anticipates.

## Assumptions

- A static page holding tokens only in tab memory is not "browser storage". That reading is ours;
  OpenAI would have to confirm it.
- A hosted server run by PDkef is neither "local" nor "self-hosted" in the documentation's sense. The
  self-hosted VM page describes a person's own VM.
- "All open-source partners" includes PDkef as an open-source project, but only for the documented
  local flow until OpenAI says otherwise.
- The recommended path needs no new operating cost, because it adds no function and the site already
  deploys as static files. Vercel's commercial-use terms apply to the site as it is today, not newly.

## Unanswered questions

1. Will OpenAI grant hosted ChatGPT-plan usage to a free, open-source website, and how long does the
   interest form take? No criteria or timeline are published.
2. If granted, what client do we get (dynamic or an issued `oaiapp_` ID), and which `https` redirect
   URIs are allowed?
3. May the OAuth exchange and inference run in the browser with tokens in memory, or must tokens be
   held server-side by a confidential client?
4. Which plans beyond Plus and Pro (Business, Enterprise, Edu) and which regions are eligible?
5. Is there ever a fee or billing to the developer, and are there data-use terms specific to this
   flow? No Sign in with ChatGPT terms page exists; the general policies page did not load here.
6. Does the preview request shape (`store:false`, `stream:true`, the omitted parameters) change for
   approved hosted apps?
7. Only if a server is required: does a relay function count as "Proxies and VPNs" under Vercel's
   fair use, and does a free beta count as commercial use?

## Options

| | A. Local runner only | B. Hosted, browser-direct | C. Hosted, server relay |
| --- | --- | --- | --- |
| Allowed by the docs today | Yes | Only with OpenAI approval | Only with OpenAI approval |
| Where tokens live | Runner memory on the device | Tab memory, never storage | PDkef server or sealed cookie |
| Where the page image goes | Device to OpenAI via local runner | Device straight to OpenAI | Device to PDkef server to OpenAI |
| New infrastructure | None | None | Vercel function, maybe Redis |
| Operating cost | None | None | Likely Vercel Pro, $20/month, since Hobby excludes commercial use and proxies |
| Image limit | Runner's 12 MB | OpenAI's own | 4.5 MB function body |
| Privacy change | None on the website | One page adds two OpenAI origins to `connect-src` | Files pass through a PDkef server, which breaks the core invariant |

## Recommendation: apply for B, keep manual Sign as the default

1. **Apply now (maintainer, no code).** Submit the
   [interest form](https://openai.com/form/sign-in-with-chatgpt-interest/) for PDkef as a free,
   open-source, remotely hosted static app. Ask the unanswered questions above, and ask specifically
   for a public PKCE client with an exact `https` callback on the PDkef domain, tokens in tab memory
   only, and requests from the browser straight to `api.openai.com`. Record the date and any reply in
   the integration notes.
2. **Until a written answer, ship nothing AI on the website.** The hosted page stays `noindex` and
   works as manual Sign with honest copy that AI filling is not available there yet. The local runner
   remains a development tool in the repository, not an advertised product.
3. **If OpenAI approves B, build it as AI-05** (plan below). Option B keeps "files never pass through
   a PDkef server" true and adds no running cost.
4. **If OpenAI only allows server-held tokens (C),** stop and bring it back as a separate maintainer
   decision. It changes the core privacy invariant, needs a paid plan and a relay, and deserves its
   own review rather than riding in on AI-05.
5. **If OpenAI declines or does not answer,** AI-05 publishes no AI claim. The page stays manual, and
   the PRD's local-only limitation is stated rather than worked around.

## Proposed AI-05 plan (only after approval for B)

Gate: a written OpenAI answer that covers client type, redirect URI, browser token handling and
eligibility, recorded in the integration notes. Task status changes are for the maintainer.

1. **Record the grant.** Client ID, allowed callback URIs, scopes, eligible plans and regions, any
   terms. Compare the request shape with the preview limits.
2. **Browser transport behind the existing seam.** A browser OAuth module with PKCE, `state`, `nonce`,
   and ID token checks against the discovered JWKS. Tokens stay in memory, and sign-out forgets and
   revokes them. Inference reuses the runner's validation and parsing, so the island still sees one
   typed result. The shared Sign editor does not change.
3. **Scope the CSP to one page.** Allow only `https://auth.openai.com` and `https://api.openai.com`
   on `/ai-pdf-filler/` and keep every other page at `connect-src 'self'`. First verify that Astro's
   CSP support can do this for one prerendered page; if it cannot, stop and decide before widening the
   site-wide policy. Extend `test:csp` to prove the other pages are unchanged.
4. **Disclosure and OpenAI's required UI.** Continue with ChatGPT, the first-run "You're using your
   ChatGPT plan" notice, "Using ChatGPT plan" with Manage usage, and before each Fill a short note
   that this page image and the typed facts go to OpenAI.
5. **Every failure lands in manual Sign.**
   - Expired session (401): reconnect.
   - Not eligible or wrong region (403): explain and continue manually.
   - Usage limit (429): Manage usage as the main action.
   - Unavailable (503), offline, cancel, or invalid output: nothing applies, and edits are kept.
   - No other billing path is offered.
6. **Copy and privacy.** This page states its cloud exception. Site-wide "never leaves your device"
   claims stay true for every other tool. The privacy page gains one scoped paragraph.
7. **Registry and SEO at release only.** `src/data/tools.js` entry, sitemap, Markdown, Beta badge, and
   removing `noindex`, with the existing redirect kept.
8. **Evidence before announcing.** A preview deployment completes a live hosted sign-in and an English
   and a Hebrew fill, then export. The AI-04 trial results are recorded. Browser checks cover
   cancellation, offline, a refused account and manual export.

## Stale statements noticed, not changed here

- `tasks/prd-ai-pdf-filler.md` still says "No live sign-in or inference proven" and "No credential
  exchange has been run yet". The integration notes record both on 2026-09-30.
- The integration notes still call the local experiment "next" and say endpoint reachability has
  "not been tested", which later sections supersede.
- The runner requests `offline_access` but has no refresh or revocation, and it hardcodes endpoints
  rather than using discovery. That is fine for the prototype, but step 2 above should not copy it.
