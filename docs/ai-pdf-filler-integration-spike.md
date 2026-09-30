# AI PDF Filler: new OpenAI integration exploration

Date: 2026-09-30. Task: AI-02. Status: local in-memory runner and editor slice implemented;
mocked browser form-to-signed-PDF verification completed in English/Hebrew. Production build
and focused regression checks pass. Live sign-in/inference and account eligibility remain pending.

## What the first experiment must prove

Use the new ChatGPT-plan connection to analyze one non-personal scanned PDF page with synthetic
facts, then turn its output into editable positioned answers and export through PDkef.
The integration is the primary experiment. A mock editor demonstration alone does not answer it.

## Findings from official OpenAI documentation

| Question | Documented answer | What is still unproven here |
| --- | --- | --- |
| Can users fund inference through their plan? | Eligible Responses requests can use a user's authorized ChatGPT plan | This account's eligibility and a completed request |
| Does sign-in provide account memory? | Plan usage does not grant conversations/account context | No personal-memory import is planned |
| Is there a direct OSS flow? | Dynamic per-account registration, no client secret or partner key | Successful registration for this tool |
| Where does that flow return? | HTTP loopback listener on 127.0.0.1; app starts listener before browser sign-in | A pure hosted PWA path is not demonstrated |
| What about remote hosting? | The overview directs remote/paid apps to an interest form | PDkef's hosted eligibility/approved integration |

Sources: [OSS overview](https://developers.openai.com/siwc/token-sharing-open-source),
[registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

This is a distribution mismatch to investigate, not evidence that the feature is impossible.
A static browser app cannot bind a local HTTP listener. A locally running exploration can follow
the documented flow, but that alone cannot validate production hosted-PDkef access.
The separate [website identity guide](https://developers.openai.com/siwc/website) must not be
treated as proof of ChatGPT-plan inference permission. The [client-ID page](https://developers.openai.com/siwc/request-client-id)
describes selected partner availability; no application/interest form has been submitted.

## Minimum supported inference mechanics

Use the registered account's OAuth bearer token and account-specific `/v1/models` catalog;
complete a streamed request at the public `/v1/responses` route. Do not use ChatGPT backend-api
endpoints or an existing app's credentials. Set `store:false`, `stream:true`, and array input.
Page-image input is supported when the selected model accepts it; the Files upload API is not.
Validate the returned field/value data locally and keep prompts/results tied to the selected page.

Sources: [models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference),
[preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Small executable experiment, next

1. Establish the documented connection in a local exploration, or a supported hosted path if one
   becomes available. Keep this distinct from choosing a permanent companion distribution.
2. Let the person sign in and grant plan usage; validate state, PKCE, ID token/nonce and scopes.
   Never ask for credentials in chat or borrow Codex's login.
3. List available models and run one image request with a synthetic name/address/date and a
   licensed/non-personal scanned page. Explicitly disclose the selected page/facts sent.
4. Parse a small result: page-local field ID, label/kind, declared image-coordinate bounds,
   proposed value or unresolved question. Reject invalid bounds and unsupported commands.
5. Map through the recorded render transform; preview/apply ordinary editor elements; correct,
   explicitly sign, and export. Verify the saved PDF, not only response text.
6. Record eligibility, latency, returned fields/placement, missing facts, corrections and actual
   completion; keep tokens and personal content out of repository evidence.

Success is a live user-funded form-to-export loop. Hosted compatibility is a separate recorded
result. If hosted access is unavailable, state the limitation and continue learning locally;
do not silently replace the new integration with a maintainer-paid API.

Plan: [lean PRD](../tasks/prd-ai-pdf-filler.md). Nothing in this record claims that live proof has
already occurred or that the public beta is ready.

## Exact connection settings for the local experiment

Verified against official OpenAI documentation on 2026-09-29; endpoint reachability and
account eligibility have not been tested.

| Setting | Value |
| --- | --- |
| Authorization | `https://auth.openai.com/api/accounts/authorize` |
| Code exchange | `https://auth.openai.com/api/accounts/oauth/token` |
| Initial client | `dynamic_agent_client` |
| Initial display hint | `agent_name_hint=PDkef AI PDF Filler` |
| Host | Persist `ext_agent_host_id=urn:uuid:<UUIDv4>` |
| Callback | `http://127.0.0.1:<available-port>/auth/callback` |
| Resource | `https://api.openai.com/v1` |
| Scopes | `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct` |
| Authorization | `response_type=code`, fresh `state`, `nonce`, `code_challenge_method=S256`, PKCE challenge |

Exchange using form fields `grant_type=authorization_code`, issued callback `client_id`,
`code`, `code_verifier`, exact `redirect_uri`, `resource`; no secret. Validate callback state
and errors first. Require the issued ID initially; retain it on subsequent sign-ins, reject
a changed ID, and omit the initial display hint. Check the token response's granted scopes.
[Registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

Discover endpoints at `https://auth.openai.com/.well-known/openid-configuration`.
The documented issuer is `https://auth.openai.com`; JWKS is
`https://auth.openai.com/.well-known/jwks.json`. Verify signature using the discovered keys,
issuer, issued-client audience, expiry and saved nonce; require a nonempty verified `sub`.
Use a maintained JWT library. Retain issuer/client/subject together rather than identifying
accounts by email. Discovery failures must stop sign-in, not bypass verification.
[Identity validation example](https://developers.openai.com/siwc/website).

Refresh with form-encoded `grant_type=refresh_token`, issued `client_id`, current
`refresh_token`, and the same `resource`; omit `scope`. Serialize refreshes and replace
rotated credentials atomically. Sign-out stops requests and revokes the refresh token at
discovery's `revocation_endpoint` with `token`, `token_type_hint=refresh_token`, and issued
`client_id`. Clear credentials locally and distinguish unconfirmed remote revocation.
Keep tokens in protected runtime storage, never browser storage or logs.
[Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).
The token response supplies expiry and refresh timing; no expiry should be guessed from
decoded access-token metadata.
[Token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference).

## Minimal implementation recommendation

Use one optional Node loopback exploration process serving the built PDkef distribution and
same-origin authorization/inference routes, with the existing browser editor as its UI. This is an experiment on the user's machine, not a
new hosted backend or a commitment to shipping an installer. Do not add a general agent
runtime, ChatGPT conversation browser, or provider framework.

- Bind only `127.0.0.1`; expire and consume each pending OAuth transaction once.
- Keep auth credentials in memory only for this first runner; persist only a stable opaque host
  identifier. Restart requires a fresh sign-in. Never reuse Codex credentials or put tokens
  into browser storage. Durable credential storage/refresh across restarts is later scope.
- Serve the built local UI and API from the same origin. Validate Host and mutation Origin,
  restrict methods/routes and content type, bound request bodies, and never proxy arbitrary
  upstream URLs. No cross-origin bridge or per-run browser secret is needed for this layout.
- Send only the selected rendered page and explicit facts after the user's Fill action.
  Ordinary Sign remains independent of the bridge. Cancellation aborts upstream inference.
- Obtain account models from `GET https://api.openai.com/v1/models`: its response uses
  `models`, with `visibility`, `display_name`, and `slug` (not the ordinary API's `data/id`
  assumption). Preserve visible server ordering and use the selected slug.
- Stream `POST https://api.openai.com/v1/responses` with bearer access token, array input,
  `store:false`, `stream:true`. Complete only on `response.completed`; failure, incomplete
  or interrupted streams cannot yield applicable proposals.

The last two requirements come from
[models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).
Use instructions/developer messages and inline page-image input. Omit unsupported controls
including `temperature`, `max_output_tokens`, `metadata`, `previous_response_id`, and explicit
system message items. No Files upload API is needed. A simple JSON-text answer plus strict local
validation is enough initially; avoid assuming every standard API structured-output option
works on this preview route.
[Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Implemented exploration, not yet live proof

2026-09-30 completed local browser verification (mocked analysis, not live OpenAI):
one production build passed; runner 6 tests, focused UI 17 tests and architecture/actual
Sign seam 42 tests passed. Four existing Chromium Sign regressions passed: legacy
click-to-select/double-click-to-edit, undo/redo stacking, drag undo/redo, and current
desktop fill-mode text geometry. Ordinary Sign loaded no AI panel/provider API assets.

English and Hebrew synthetic image-only two-page PDFs completed real browser opening,
selected-page rasterization, mocked positioned text/check proposals, review/apply,
manual text correction, applied-checkbox movement, delete/Undo, cancellation/manual
continuation, explicit typed signature and download. PDF.js reopened and rendered both
exports: names land inside the intended rectangle, Hebrew is readable/right-aligned
RTL, signatures are visible, and the second page is preserved. Both journeys recorded
zero CSP violations and page errors. No PDF/facts request occurred before explicit Fill;
no live authentication, provider traffic or account eligibility was tested.

Temporary evidence (local paths, deliberately not committed):
`/private/tmp/ai-pdf-filler-verification/report.json`, `recovery-report.json`,
`verify.mjs`, `en-filled.pdf`, `he-filled.pdf`, `en-proposals.png`, `he-proposals.png`,
`en-manual.png`, `he-manual.png`, `en-export-render.png`, `he-export-render.png`.
The runner remains available at `http://127.0.0.1:1455/ai-pdf-filler/` for user-controlled
sign-in; launch from the implementation checkout with
`node scripts/ai-pdf-filler/server.mjs`. The local module-worker MIME issue is fixed.
Vercel analytics scripts return local 404 warnings; editor operation was unaffected.

The recovery probe removed seeded stale local auth/status cache entries and observed
actual disconnected status with `Cache-Control: no-store` and a rejected synthetic
callback (400). The replacement worker has no fetch handler. One worker registration
was still reported; replacement of an already controlling production worker remains
unverified by this cache-seeding probe. Real user-authorized registration, account-model
availability, completed plan-funded image inference and hosted compatibility remain
pending. AI-02 and AI-03 remain in progress; scripted mocks do not satisfy live milestones.

The isolated implementation checkout is `/private/tmp/pdkef-ai-pdf-filler`.
Its `scripts/ai-pdf-filler/README.md` explains how to build and launch the loopback runner.
No dependencies were added for it. The first spike uses Node crypto with a narrow RS256
allowlist and verified JWKS, issuer, audience, nonce and expiry; this implementation choice
still requires independent review. Durable accounts, refresh and remote revocation are deferred:
tokens live only in process memory, expiry requires reconnecting, and restart discards credentials.

The runner serves the built distribution on `http://127.0.0.1:1455`, exposes only status,
account models and validated proposals to the browser, and requires same-origin analysis.
The local `/sw.js` is replaced with a no-fetch recovery worker which removes local caches
and unregisters itself; IndexedDB/document memory and the production worker are untouched.
This prevents the ordinary offline worker caching connection status or authorization callbacks.
Canonical completed Responses output is preferred over intermediate deltas.

Six focused mocked runner tests pass. The UI contributor reports 17 focused UI tests passing.
The production build passed. Independent architecture review found the optional Sign seam
suitable for this lean exploration. Actual browser verification exposed a local-server
module MIME issue; `.mjs` JavaScript and font MIME mappings were corrected and regression
checked before retrying browser verification. These checks validate local mechanics and reviewed mocked exports; they do not demonstrate
account eligibility, live provider behavior or general placement accuracy.

Before calling the experiment proven, record one authorized connection, one account catalog,
one completed image response and a reviewed exported PDF. Mocks can verify invalid state,
nonce/audience/signature rejection, interrupted SSE and cancellation; they do not establish
live access. A local success still leaves hosted production eligibility unresolved.

## Separate Claude fixture contribution

2026-09-30 independent review of [Claude PR #29](https://github.com/shlomsh/pdkef/pull/29),
head `9bfe98ac19c7485a38fa7d54eb355c3adf44f81d`: **required changes; do not merge this revision**.
The four fixtures are valid/reproducible with the recorded platform caveat, but the PR
also changes shared editor shaping, FONT-09, guidance and backlog scope. Its PDF.js
extraction changes typed `א(ב)` to `א)ב(`, and `sign.test.js:670` accepts that regression.
Split the shared-editor/FONT-09 work from the QA contribution, keep fixture generation
independent (its text helper currently imports the new `shapeRun`), correct the QA-only
scope claim in documentation/PR description, and distinguish detection metrics from
actionable text/check fields. Derived fixture truth is not independent accuracy evidence.
The reported 76 passing Claude tests do not approve that extraction regression. PR #29
remains separate and unmerged; no live accuracy trial has been completed.


2026-09-30 final requested-change checkpoint: GitHub still reports head
`9bfe98ac19c7485a38fa7d54eb355c3adf44f81d` (last update 2026-09-29 20:31:48 UTC),
open and non-draft. The current diff has 38 files: 28 QA files, six shared-editor files,
fonts/text guidance, FONT-09, and generated BACKLOG/TODO. The PR body still says QA-only;
`qa/ai-pdf-filler/README.md:38` still says no src changes. No separate FONT-09 PR exists
in the repository PR list. No reviews or inline review comments exist; only Vercel and
Vercel Preview Comments are green, not a product/font/export CI suite.
**Required changes remain unaddressed; this revision is not ready to merge.**
Current-source inspection reconfirms the new shaping import at `lib/text.mjs:13`, mirrored
logical codepoints at `src/editor/text/shapeRun.ts:22-28`, and the PDF.js extraction
regression accepted at `src/editor/adapters/pdf/sign.test.js:670`. The checklist still
scores all targets together (`TRIAL-CHECKLIST.md:15-21`) and expects comb placement
(`:41`), although the active AI slice accepts only text/check proposals and deliberately
excludes signatures. Separate detection coverage from actionable supported fields and
manual signature/comb work. Reuse the preceding same-head fixture validation as prior
evidence, including platform-dependent scan hashes, rather than claiming new generation
or accuracy results; broad suites were not repeated for an unchanged revision.
AI-04 stays open: the live four-form trial, recorded answers/positions, correction effort,
manual comparison and complete exported-PDF review are still pending. No fixture branch merge
or push, GitHub comment, authorization flow or live inference was performed. Only these
review notes were committed and pushed on `codex/ai-pdf-filler` for cloud visibility.
