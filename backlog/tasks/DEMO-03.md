---
id: "DEMO-03"
title: "Close the loop: accept a PDF shared into PDkef from another app"
status: "open"
priority: "P1"
epic: "landing-story-demo"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# DEMO-03 · Close the loop: accept a PDF shared into PDkef from another app

## Scope and acceptance

**Half the story already works and half of it does not.** Sign and Redact both call `navigator.share` with the finished file, so handing a signed PDF back to a messaging app is real today. Getting the form *in* is not: `public/manifest.webmanifest` declares no `share_target` and no `file_handlers`, so on Android a PDF sitting in a chat cannot be shared into PDkef at all, and the user has to save it, open the site, and go find it in their downloads. That is the friction the whole story is supposed to remove, and DEMO-02 would be depicting a flow that does not exist.

Add a `share_target` entry to the manifest (`method: "POST"`, `enctype: "multipart/form-data"`, accepting `application/pdf`) and a `file_handlers` entry so an installed PDkef is offered as a target for PDFs. Route the received file into the Sign tool's existing `loadPdf()` path, the same one a fresh pick and a draft restore already share.

Two real complications to solve rather than skip. **There is no server**, so a `POST` share target has to be caught by `public/sw.js` and handed to the page rather than answered by an origin; that worker has three documented invariants (no `skipWaiting()`, best-effort precaching, self-uninstall on a 404 manifest) and none of them may be quietly reverted to make this work. **iOS does not implement Web Share Target**, so the honest answer there is the Files/share-sheet-into-Safari path, and the copy must not claim an Android-only capability everywhere.

**Acceptance.** With PDkef installed on Android Chrome, a PDF in a chat can be shared into it and opens in the Sign editor ready to sign. Desktop and iOS keep working exactly as they do now, with no regression to the ordinary file-pick path. No file bytes leave the device at any point; the share is an OS handoff, not an upload. `npm run test:e2e`'s service-worker and hydration guards still pass, and the three `sw.js` invariants are intact.
