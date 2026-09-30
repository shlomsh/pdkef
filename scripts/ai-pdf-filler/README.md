# Local AI PDF Filler exploration

This disposable developer runner explores the new OpenAI ChatGPT-plan flow. It does
not establish compatibility with hosted PDkef or commit the product to an installer.

Build the site first (`npm run build`), then run from the repository root:

```sh
node scripts/ai-pdf-filler/server.mjs
```

Open `http://127.0.0.1:1455/ai-pdf-filler/`. Select **Continue with ChatGPT** yourself.
The callback must use that exact loopback hostname and `/auth/callback`. Another
app already using port 1455 must be stopped before this runner can listen.

Only the host UUID is saved, owner-only, under `node_modules/.cache/ai-pdf-filler/host.json`.
Tokens and issued account registration stay in process memory and disappear on exit.
Restart therefore registers/signs in again; expired access requires reconnecting.
No credentials are read from Codex, ChatGPT, or another app. No maintainer API key.
The runner never logs upstream responses, facts, page images, or credentials.

Analysis sends one supplied PNG/JPEG page and explicit facts to OpenAI using an
account-available model chosen in the UI. Plan usage/credits and eligibility apply.
It does not access ChatGPT memories/history. The returned proposals require review;
server validation cannot establish factual correctness or precise field placement.
No answers/signatures are automatically applied by the runner.

The API exposes status/models and validated proposals only. Mutations require exact
same-origin requests. Static files are restricted to built `dist`, including symlink
resolution. Browser cancellation aborts provider inference; requests also time out.
The server binds only 127.0.0.1, with no CORS or remote listening option.

The runner replaces `/sw.js` with a tiny recovery worker which removes this local
origin's caches, claims existing tabs, and unregisters itself. It has no fetch handler.
This prevents the production offline worker caching OAuth callbacks or connection
status. A previously controlled tab may need one reload after recovery activates
if it displayed cached status before the replacement took control. No production
service-worker behavior is changed.

Run focused mocked checks (no authorization/network):

```sh
npx vitest run scripts/ai-pdf-filler/*.test.mjs
```

Live sign-in/inference remains unproven until tested with an explicitly participating
user and a non-personal form. The official flow is documented at
https://developers.openai.com/siwc/token-sharing-open-source/sign-in and
https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.

### Opt-in local development diagnostics

On a future runner start, use `AI_PDF_FILLER_DIAGNOSTICS=1 node scripts/ai-pdf-filler/server.mjs`.
Do not restart an active signed-in process to inspect a previous call: logging cannot reconstruct earlier requests, and restarting loses process-only credentials.
Logs: `node_modules/.cache/ai-pdf-filler/diagnostics.jsonl`, owner-only, ignored by Git, at most 1 MiB plus one rotated `.1` file.
Server and client events share a random request UUID. Events record elapsed milliseconds, fixed outcome codes, HTTP statuses and field/question counts only; no document names, page images, facts, labels, answers, credentials, account identifiers, URLs or upstream bodies.
The local status response enables a same-origin, 512-byte, allowlisted client diagnostics endpoint only when opted in. Client review readiness, stale discards, cancellation, and apply outcomes enter the same log; telemetry failures do not block editing.
Use `tail -n 40 node_modules/.cache/ai-pdf-filler/diagnostics.jsonl` locally. `completed` means upstream stream completion, `schema_valid` means validated proposals, and client `review_ready` means the UI accepted them: these are different milestones. A later `applied` event means shared-editor insertion, not a claim of answer accuracy. No hosted collector is installed.
