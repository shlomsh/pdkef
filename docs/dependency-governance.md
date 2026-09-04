# Dependency vulnerability and update governance

`package-lock.json` is the release dependency graph. CI installs it only with
`npm ci`; update pull requests must change `package.json` and the lockfile
together. This document governs vulnerability response. It is separate from
the browser-package license inventory and approval policy in
`THIRD_PARTY_LICENSES.md`.

## Ownership and cadence

The repository maintainer (currently [@shlomsh](https://github.com/shlomsh))
owns dependency-alert triage. A contributor who opens or receives an update PR
owns its review through merge, but cannot self-approve a security exception.

- Dependabot checks npm every Monday at 09:00 Asia/Jerusalem. It groups
  minor/patch browser-runtime updates (including the PDF stack) separately from
  patch-only build-tool updates. Minor and major build-tool updates, and major
  runtime updates, remain individual pull requests.
- The GitHub Advisory Database review runs on every dependency PR and blocks a
  newly introduced high or critical advisory in development, runtime, or
  unknown scope.
- The scheduled Monday advisory scan runs `npm audit --json` against the locked
  graph, including development tooling. It fails only for high/critical
  findings that have not been actively triaged; it is not an always-on audit
  gate for unrelated pull requests. Its raw report is retained as a workflow
  artifact.
- Review Dependabot PRs within five business days. Triage a high/critical
  advisory within one business day; medium/low findings are reviewed in the
  next weekly maintenance pass unless they affect a browser-exposed parser,
  renderer, or build compromise path.

## Review requirements

Every dependency update uses `npm ci`, then the normal CI pipeline. That
includes unit tests, type checking, editor-boundary checks, font alignment and
license inventory checks, production build, CSP, SEO, CSS, page-weight,
offline/language build checks, and Playwright checks. PDF parser, renderer,
font, signature, browser-runtime, and production build-stack updates require a
human review of the affected export/render result. Do not recapture an
export-render baseline merely to make an update green: inspect the decoded
result and commit a deliberate baseline change only when the user-visible
output is intended.

`npm run test:dependency-governance` is a local wiring dry-run. It confirms
that an npm update PR triggers both the advisory review and the existing
platform-bound release gates; CI runs the same check. After enabling this
configuration on the default branch, use Dependabot's **Check for updates**
control (or review its first generated PR) and retain its successful CI link in
the PR. This is the enablement evidence. The only lockfile changes bundled
with this governance work are the minimal fixed resolutions discovered by its
live advisory scan; no direct package upgrade is being smuggled in.

## Exceptions and advisories without a fix

Never suppress an advisory by lowering the severity threshold, deleting the
lockfile entry, or adding a license allowlist. If an advisory has no fixed
release, the maintainer must first establish whether the vulnerable code is
reachable in this static browser application. Record a narrow exception in
[`security/dependency-advisory-exceptions.json`](../security/dependency-advisory-exceptions.json)
only after that review. Each entry must have this shape:

```json
{
  "package": "affected-package",
  "advisory": "GHSA-xxxx-yyyy-zzzz",
  "expires": "2026-10-01",
  "rationale": "Why the vulnerable path is unreachable or why the risk is accepted temporarily.",
  "owner": "@github-handle",
  "nextReview": "Upstream issue URL and the date/condition for reassessment."
}
```

Exceptions are per package and advisory, must expire within 30 days, and need a
fresh review to renew. The scheduled scan rejects expired, malformed, or
unowned exceptions. A fixed release means open or update the Dependabot PR and
remove the exception; no fixed release means keep the exception short-lived,
monitor the upstream issue, and document the reachability assessment in the PR
or security advisory discussion.
