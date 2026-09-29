# AI PDF Filler: new OpenAI integration exploration

Date: 2026-09-29. Task: AI-02. Status: official mechanics verified; local in-memory runner construction started. No live sign-in or inference run.

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
| Initial display hint | `agent_name_hint=AI PDF Filler` |
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

Before calling the experiment proven, record one authorized connection, one account catalog,
one completed image response and a reviewed exported PDF. Mocks can verify invalid state,
nonce/audience/signature rejection, interrupted SSE and cancellation; they do not establish
live access. A local success still leaves hosted production eligibility unresolved.
