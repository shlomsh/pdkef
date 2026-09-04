# Sign Tool product decisions

Confirmed by the product owner on **2026-08-28** after the architecture review.
This record defines product scope; implementation status and priorities belong in the canonical
[task files](../backlog/tasks/) and generated [backlog board](../BACKLOG.md). It supersedes conflicting
assumptions in older design proposals, not the evidence or history in those documents.

## Confirmed requirements

1. **Languages apply to PDF content.** Multi-language support means the PDF tools can work with
   documents containing the target language. Translating the interface is not part of this work;
   keep the current English interface.
2. **Fidelity includes text and its behavior.** Assess visual text, fonts, searchable/selectable
   text, and RTL/LTR behavior in both the editor and the exported PDF. Glyph coverage alone is not
   proof of support. Preserve real text; do not rasterize text as a shaping workaround.
3. **Direction follows the typed language.** Derive the base direction from the text, with English
   (LTR) as the default when no language can be inferred. Digits must retain their correct order.
   A previously used RTL field must not change the default for an empty new field.
4. **One language per text element, plus digits.** Each element supports a font face, weight,
   italic style, and font size. Arbitrary mixtures of languages or independently styled runs
   within one element are not required. This does not authorize rejecting existing multilingual
   source PDFs or silently altering pasted text. Ordinary punctuation must remain usable.
5. **Undo must cover add and delete.** Maintain these operations reliably. Broader undo for edits,
   moves, or styling is optional follow-up work, not a prerequisite for this scope.
6. **Processing works offline.** Once the app and its required assets are available locally, tools
   must work with the internet disconnected. No processing server is required. Network access for
   version updates must not be necessary to open, edit, or export a document.
7. **Persistence may be scoped to the current user; tabs share the same data.** User-scoped keys
   are permitted. Tabs in the same user scope must see the same stored data; do not create isolated
   per-tab accounts or silently overwrite newer revisions. The current app has no account system.
8. **Chrome is the required browser; all popular languages are the target.** Establish a named,
   phased language matrix and prove rendering, extraction/search, direction, digits, and supported
   typography against real PDF output. Additional browser support is not a release gate here.
9. **Anonymous maintenance telemetry is permitted and should improve.** Usage patterns and errors
   may be recorded without awareness of a user or their data. Keep PDF bytes, filenames, entered
   text, signature images, document identifiers, persistent user identifiers, and raw exception
   payloads out of telemetry. Use allowlisted event names, coarse measurements, and sanitized
   error codes. Telemetry failure must never block offline tools. No telemetry expansion is
   implemented by this decision record.
10. **Non-default fonts use opt-in family packs.** The app shell and Arimo Regular remain part of
    the initial offline install. Every other selectable family is provisioned only when the user
    chooses “Make offline” in the font picker; provisioning downloads every real face in that
    family and shows “Ready offline” only after all of them are in the current app cache. This
    avoids imposing the roughly 37 MB catalogue on every visitor while making disconnected
    readiness explicit. An uncached family stays selectable online, but while disconnected the
    picker says to connect before downloading rather than implying that browser fallback is an
    offline guarantee. App-cache upgrades revalidate installed pack files and retain the prior
    cached bytes if activation itself is offline.

## Engineering decisions still needed

- **Language rollout:** define what “popular” includes, acceptance samples, and a signal for
  regional distinctions that cannot be inferred from text alone (for example shared Han glyphs).
  Define handling for unsupported characters and unavailable font styles without silent changes.
- **Local user boundary:** today the practical boundary is the browser profile and origin. Decide
  whether another local profile mechanism is needed, plus retention, deletion, and cross-tab
  conflict policy. This decision does not require adding login or a backend.
- **Scope of fidelity:** distinguish newly added real text from existing source content, scanned
  pages, and raster signature images. OCR and searchable typed signatures are not implicitly
  approved by the general searchable-text requirement.
- **Telemetry governance:** choose the event schema, aggregation, retention, endpoint, and clear
  privacy disclosure before adding events. Do not send raw messages, URLs, or text as a shortcut.

## Review implications

Prioritize content preservation, correct coordinates, reliable export recovery and persistence,
offline assets, and the language/font acceptance matrix. Defer interface locale files, language
switchers, translation-key conventions, arbitrary rich-text runs, and non-Chrome release gates
unless a later product decision expands the scope. Keep existing incremental architecture work;
these decisions do not call for an editor rewrite.
