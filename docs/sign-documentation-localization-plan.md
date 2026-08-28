# Sign Tool documentation and localization design

Date: 2026-08-28. Scope: repository review, product/SEO recommendation, translation samples, and implementation specification. This is not a shipped feature or a replacement task tracker; execution state belongs in `TODO.md`.

## Recommendation

Keep one Sign Tool implementation and one shared documentation template. Preserve `/sign/` as the English default. Add a **Documentation language** selector and statically generated language URLs when their documentation is reviewed, starting with `/he/sign/`, then `/hi/sign/`. The page looks and works the same across versions; its documentation, title, headings, and surrounding page navigation are translated. The PDF editor remains English, explicitly labeled as such. Choosing a documentation language must never change a PDF's text, font, direction, or saved state.

Start by correcting the English source and adding a compact country-to-language reference below the editor on `/sign/`. Represent all 12 screenshot countries there, with separate documentation and PDF-support states. Do not create 12 near-identical country pages. Do not advertise unfinished translations as available choices.

The current request expands documentation scope beyond the earlier language-support work recorded in `docs/sign-tool-product-decisions.md`. It does not authorize an editor translation, new language-rendering guarantees, or a processing server. Existing uncommitted editor/font work was inspected as evidence and left untouched.

## Evidence and limits

- Audience source: the user's screenshot dated 2026-08-28. Its metric name, reporting period, denominator, device mix, and language preferences are unknown. Counts below are screenshot counts, not assumed users, visits, or conversions. Displayed percentages total 97%; do not normalize or infer the missing share. The 12 counts total 159.
- Review source: the working checkout, including uncommitted changes, not a verified production deployment. No live-site crawl, visual browser audit, Search Console access, or keyword-volume research was performed.
- Read the Sign route, shared layouts/components, tool registry, content collection/route/registry, no-signup guide, and iPhone/Android guide excerpts. Windows/Mac and installation pages were inventoried, not fully fact-checked. Internal README and product decisions supplied architectural context; those documents are not all customer help content.
- Ran `npm test -- src/lib/languageCoverage.test.js`: **20 tests passed**. These reconcile documented font coverage; they do not certify every language's shaping, search/extraction, browser behavior, or offline provisioning.
- Current official Google, Astro, and W3C documentation informed the architecture. References are linked beside the recommendations below. Skill checklists informed the separation of coverage, translation parity, and indexing; their generic word-count targets are not product requirements.

## Current documentation audit

| Priority | Evidence in the repository | Finding and recommended change |
|---|---|---|
| High | `src/data/tools.js`, Sign `gridDescription` | Says “secure digital signatures”; the no-signup guide correctly distinguishes visible electronic signatures from certificate signing. Standardize on “electronic signature”; do not imply identity verification or certificate signing. |
| High | Sign `steps`, `SignToolbar.tsx` | Instructions say “Sign and Download PDF”; current button says “Download”. Update source instructions before translating and retain exact English button labels within localized help. |
| High | `README.md`, Sign hero/about copy, `BaseLayout.astro` | “No tracking/no network calls”, “no servers”, and “a crash never loses your work” are too broad. Production injects Vercel Analytics; files being processed locally is distinct from site analytics. Say PDF contents/signatures are not uploaded for processing, qualify storage availability and autosave, and explain deletion/retention. |
| High | `README.md`, Sign FAQ, `src/lib/draftPolicy.js` | README says drafts clear only on “Start over”; the toolbar uses “Replace file”; policy expires drafts after 14 days from save. Publish one reviewed storage explanation, including browser eviction/clearing and shared-device implications. |
| High | `ToolLanguagesCard.astro`, `src/data/tools.js` | PDF language capability is described in English, but translated documentation does not exist. A font list is not a help-language selector. Label both independently. |
| High | Same language card | Most target languages appear, but not all country names are represented. Filipino and Malay are buried in Latin prose; Hebrew is last in a long list despite Israel's screenshot share. Add the explicit country matrix below and make high-demand help easier to reach. |
| High | `src/data/tools.js`, working-tree font additions | Tamil/Telugu are still described as unavailable while font work is in progress. Do not change their status just because font files exist. Require the actual export acceptance suite before upgrading support claims. |
| High | `BaseLayout.astro`, `sitemap.xml.js` | HTML language is fixed to English; there are no localized routes/alternate sets. This is expected for the current English site, but blocks a correct localized launch without changes. |
| Medium | `src/content/content-pages/sign-pdf-no-signup.yaml` | Legal-acceptance wording and claims about certificate cost/identity are too sweeping. Keep only the tool's capability distinction and ask users to check recipient requirements. Do not translate claims of universal legal validity or invent country-specific compliance. Legal review is separate. |
| Medium | Same no-signup guide | Upload bars and processing delays are not reliable privacy tests. Replace these heuristics with inspectable processing architecture and a scoped offline test; neither proves the absence of all telemetry. |
| Medium | iPhone guide description vs comparison table | Description says Markup cannot fill forms; table says it can fill real fields. Resolve the contradiction and verify current device instructions before translating this guide. Android's “every Android device has Chrome” also needs qualification. |
| Medium | `ToolLanguagesCard.astro` | Long notes, country flags, unset native-name languages, and physical left borders/padding complicate scanning and RTL. Use native language names with language metadata; use text country names separately; use logical spacing/borders for translated documentation. This is source-level review, not a measured accessibility score. |
| Medium | `src/content.config.ts`, `[contentPage].astro` | `sitePath` currently accepts one path segment; localized nested CTAs will fail validation. Existing collection/registry parity compares root slugs. Extend these together rather than dropping translated YAML into the existing collection. |
| Medium | `ToolPageLayout.astro` inline script | Draft-hint slug is derived by removing all slashes. `/he/sign/` would become `hesign`, not `sign`; this would miss the saved-draft hint. Use the stable tool ID and update the CSP hash if the inline script changes. |
| Medium | `scripts/verify-seo.js` | Checks metadata presence and FAQ questions, but not localized alternates, missing targets, page-language parity, canonical correctness, or answer parity. Extend it for localization. |

Keep the existing strengths: useful on-page help, native-script examples, transparent font limitations, shared templates, build-time content validation, and links from Sign to its guides. Fix factual drift before multiplying it into translations.

## Audience and country coverage

This is the proposed **public country reference**, with actual translation publication status supplied by the content registry. Country membership is audience context, not a restriction on who may use a language. It does not enumerate every language spoken in each country.

| Country | Screenshot | Documentation language coverage and order | Current PDF-language evidence / caution |
|---|---:|---|---|
| Israel | 53%, 87 | English available; Hebrew first localized release. Consider Arabic help through the shared Arabic edition. | Hebrew and Arabic named in Sign copy; font checks exist; do not equate that with exhaustive fidelity validation. |
| United States of America | 22%, 36 | Shared English; no separate US copy without a substantive need. | Latin-script coverage is described; review unusual names/diacritics. |
| India | 10%, 17 | Shared English; Hindi next pilot. Marathi, Bengali, Urdu, Tamil, Telugu, and other languages require demand and reviewer capacity decisions, not an assumption that India means Hindi. | Several named scripts already documented; Tamil/Telugu work is not a published support guarantee. |
| United Kingdom | 3%, 5 | Shared English; no duplicate `en-GB` page. | Same Latin-script qualification. |
| Philippines | 2%, 4 | Shared English; Filipino next expansion candidate. | Filipino explicitly appears in the Latin note, not a standalone help edition. |
| Canada | 1%, 2 | Shared English; Canadian French expansion. | French appears in Latin copy; check accents in representative names. |
| Malaysia | 1%, 2 | Shared English; Malay expansion. | Bahasa Melayu appears in Latin copy; this does not establish Jawi coverage. |
| Singapore | 1%, 2 | Shared English; shared Simplified Chinese and Malay editions; Tamil later. | Chinese is a subset with font-choice caveats; Tamil still needs release evidence. |
| United Arab Emirates | 1%, 1 | Shared English; shared Arabic edition. | Arabic listed; joining, digits, and text extraction need release verification. |
| Afghanistan | 1%, 1 | English explicitly labeled fallback; Dari and Pashto require reviewed editions, not English-only claims of accessibility. | Dari/Farsi and Pashto listed; coverage tests pass, but this review did not rerun fidelity tests. |
| People's Republic of China | 1%, 1 | English fallback; shared Simplified Chinese edition. | SC subset and shared-Han font-selection limitations must remain visible; no blanket “all Chinese characters” claim. |
| Colombia | 1%, 1 | English fallback; Colombian Spanish expansion. | Spanish appears in Latin copy; no jurisdictional signature guarantee. |

All 12 countries must be present as accessible text in the Sign documentation, but they must not become mandatory form inputs or a country gate. A compact collapsible table can contain the detailed mapping. Keep the existing wider PDF-language catalogue; this audience list must not remove other supported languages.

## Locale policy and translation priorities

Country analytics cannot prove language need. The earlier suggestion to launch six translations together was too broad for this evidence. Retain those six as draft candidates, but publish in this order after review:

| Stage | Content locale / native label | URL when approved | First content and keyword hypothesis | Adaptation / launch condition |
|---|---|---|---|---|
| Source | `en` / English | `/sign/` | Correct source; fill/sign PDF, no signup, local processing. | One English edition for US, UK, India, Philippines, Canada, Malaysia, Singapore, and any other reader. |
| First release | `he` / עברית | `/he/sign/` | Complete Sign help; חתימה על PDF, מילוי טופס PDF. | RTL prose, English UI terms isolated, digits and punctuation checked by a Hebrew reviewer. |
| Next pilot | `hi` / हिन्दी | `/hi/sign/` | Complete Sign help; PDF पर हस्ताक्षर, PDF फॉर्म भरें. | Natural Hindi, readable Devanagari system fonts, clear distinction between text and signature modes. Validate actual demand. |
| Expansion | `fil-PH` / Filipino | `/fil/sign/` | Quick start then complete Sign help; local signing/no-account terminology. | Filipino editorial review; Google language-code handling below. No draft supplied in this turn. |
| Expansion | `fr-CA` / Français (Canada) | `/fr-ca/sign/` | Sign help then no-signup guide; signer un PDF, remplir un formulaire PDF. | Canadian vocabulary and neutral examples, not imported France-specific legal language. |
| Expansion | `ms` / Bahasa Melayu | `/ms/sign/` | Quick start then complete Sign help; tandatangan PDF, isi borang PDF. | Malay, not automatically Indonesian; shared MY/SG edition. No draft supplied in this turn. |
| Expansion | `ar` / العربية | `/ar/sign/` | Complete Sign help; توقيع PDF, تعبئة نموذج PDF. | Modern Standard Arabic, RTL, digit/order checks; do not imply UAE legal approval. |
| Expansion | `zh-Hans` / 简体中文 | `/zh-hans/sign/` | Complete Sign help; PDF 签名, 填写 PDF 表格. | Shared CN/SG edition; preserve SC-font and missing-character cautions. Validate regional access separately; Google alone is not a China acquisition strategy. |
| Expansion | `es-CO` / Español (Colombia) | `/es-co/sign/` | Complete Sign help; firmar PDF, llenar formulario PDF. | Colombian editorial review; distinguish electronic from certificate-based signing. |
| Later, explicitly planned | `prs-AF` / دری; `ps-AF` / پښتو | `/prs-af/sign/`; `/ps-af/sign/` | Quick start then complete Sign help; local search terminology to be researched with reviewers. | Two distinct editions; do not mechanically relabel Iranian Persian as Dari. RTL and numeral QA required. |
| Later, conditional | `ta` / தமிழ் | `/ta/sign/` | Start with help and honest PDF-support status. | Tamil editorial review; supported help language and PDF entry capability remain separate. |

These are editorial keyword hypotheses, not measured volumes or difficulty scores. No additional English regional pages, `zh-SG` duplicate, or `ar-AE` duplicate unless real content differences justify them. Hindi does not substitute for every Indian language. Future Indian-language editions should be added through the same registry rather than guessed now.

Keep application/HTML language tags separate from search annotations. `fil-PH` and `prs-AF` are not automatically safe Google `hreflang` values: Google documents ISO 639-1 language codes. For Filipino, use `tl-PH` only after a reviewer confirms that the edition is appropriately described as Tagalog; otherwise omit that search annotation. For Dari, consider `fa-AF` only after editorial confirmation that the broader Persian label is appropriate. Do not silently rewrite the reader-facing identity. `ps-AF`, `he`, `hi`, `ar`, `ms`, `ta`, `fr-CA`, `es-CO`, and `zh-Hans` are candidates for explicit validation. Unresolved codes are a per-edition publication gate, not a reason to mislabel content. [Google: supported codes](https://developers.google.com/search/docs/specialty/international/localized-versions#language-codes)

## Page and selector decision

| Approach | UX, SEO, and engineering tradeoff | Decision |
|---|---|---|
| Same URL, JS swaps documentation | Can preserve editor state, but translations lack stable shareable/crawlable page identities; JS/cookie dependence complicates discovery. | Optional later enhancement, not the indexable foundation. |
| Same template, language URLs, selector | Stable language links and static content; shared implementation; navigation needs explicit protection for active editing. | Recommended. |
| Country first, then language | Adds an unnecessary step and conflates geography with preference; creates duplicate-content pressure. | Country reference only, not a gate. |
| Automatic detection and redirect | Can put bilingual readers on the wrong edition and hide versions from crawlers. | No forced redirect. An optional language suggestion may use browser preference after explicit URL selection takes precedence. |

Google recommends distinct URLs and visible language links rather than cookie-only variants, and warns against automatic language redirection. Localized documentation should have one primary language rather than side-by-side copies. [Google: multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)

### Proposed page layout

```text
PDkef / Sign & Fill PDF        Documentation language: English ▾
Localized title and short promise
“Help is in [language]. Editor controls are in English.”
[English PDF editor: unchanged, lang=en, dir=ltr]

Help with signing             [jump links / repeat language choice]
1. Choose PDF  2. Add text/signature  3. Review  4. Download
Privacy, local drafts, and offline limitations
Languages you can type in your PDF [capability statuses and details]
Countries and documentation languages [12-row expandable reference]
Frequently asked questions
Related guides [translated where available; otherwise “English”]
Footer / source / last reviewed
```

Use native language names and optional English labels; do not use flags as language controls. Render real anchors in an accessible disclosure/list with current language marked; keyboard, focus, and no-JS navigation must work. On narrow screens use a full-width control, readable wrapped labels, and comfortably sized targets. Avoid adding a large language list above the editor.

URL locale wins over saved preference. Store only an optional local documentation preference such as `pdkef:docs-locale`; do not create a user identity. Remember it for guide links and suggest it on future visits, but do not automatically redirect `/sign/` or override a deliberately opened URL. If storage is unavailable, links still work.

**Active editing:** initial implementation should open a selected translated help page in a separate, clearly announced tab while an editor session is active; do not depend on a debounced draft to survive a navigation. Use a statically generated documentation-only companion, for example `/he/sign/help/`, built from the same approved content. That companion must not import/mount an editor or restore/write shared drafts. Canonicalize it to the primary locale page and exclude it from the sitemap and alternate sets; it is a convenience view, not another search landing page. Do not use a query flag that merely hides an already mounted editor. Until the companion is tested, keep locale switching before file selection and offer “Download your work before changing language” instead of risking state loss. Do not implement a silent same-tab navigation during editing.

Later, an in-place documentation-only renderer can switch validated content without remounting `PdfSignTool`. Do not introduce a site-wide client router just for this; any History API enhancement must also handle back/forward, headings, focus, metadata, and direct navigation parity.

### RTL and accessibility

Localized page chrome/documentation gets appropriate `lang` and `dir`. Isolate the English editor (`lang="en" dir="ltr"`); PDF text direction must continue to follow its own content. Use logical margins, padding, alignment, and border properties. Mark native language names with their languages and isolate inline `PDF`, English button labels, URLs, and numbers using component-level bidi markup. Do not relax the existing safe content-markup rules to accept arbitrary HTML. [W3C: declaring language](https://www.w3.org/International/questions/qa-html-language-declarations)

No editor TTF downloads just to render help. Prefer system font stacks, check script fallback and line height on actual devices, and add small self-hosted documentation font assets only when testing demonstrates a need. Check 320px width, 200% zoom, RTL wrapping, screen-reader pronunciation, and keyboard operation. Do not mirror the PDF canvas.

## Content to translate and content to retain

The first publishable unit is the **complete Sign documentation shell**: metadata, hero, selector, English-editor notice, quick start, privacy/storage/offline notes, capability limitations, country reference, FAQ, related-link labels, footer, and accessible labels. The accompanying JSON contains only quick-start samples, not that complete unit; it is not ready to index.

Next translate `/sign-pdf-no-signup/` after correcting its factual claims. Then choose `/how-to-sign-a-pdf-on-android/` or `/how-to-sign-a-pdf-on-windows/` using actual device traffic and query demand. Translate the iPhone/Mac guides only after their platform comparisons and promised behavior are checked. Installation/offline documentation follows verified provisioning behavior, not the broad claim “install once, everything works.”

Keep internal architecture, backlog, code identifiers, font family names, license texts, and the project name in their source forms. Localize customer-facing explanations and summaries when useful; do not rewrite third-party legal licenses. Do not turn PDF editor labels into a translation project. Screenshot callouts can be localized while screenshots preserve the actual English controls. Use neutral blank example forms, never real visitor documents. No currency adaptation is needed for a free tool; do not invent pricing differences or trust seals.

## SEO publication contract

Each approved translated page gets a self-canonical URL with trailing slash. English remains `/sign/`; do not redirect it to `/en/sign/`. Generate reciprocal HTML alternate links from a single list of **published equivalent pages**, including self and an English `x-default`. `x-default` is our fallback choice, not a claim that Google requires it. Do not advertise draft, missing, redirecting, or English-copy placeholder URLs as localized alternates. Use one alternate method rather than maintaining competing implementations. [Google: localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)

All published canonical locale URLs also go into the ordinary sitemap, with genuine review/content dates if `lastmod` is added. Guide alternates are per-guide equivalence groups: never point a missing translated guide's alternate tag at the Sign home page. Ordinary related links may lead to English with an explicit English label.

Localize titles, descriptions, headings, social descriptions, and visible schema text from the same content entry. Keep SoftwareApplication identity/technical facts consistent. If existing FAQ schema is retained, both questions and answers must match visible localized content. Do not promise FAQ rich results or add deprecated HowTo markup. Don't pad quick-start help to meet generic word-count targets. Do not create country-name-swapped landing pages.

## Engineering implementation specification

Paths below are proposed changes, not files created by this review unless explicitly linked as deliverables.

1. **Source correction and data model.** Separate immutable tool identity from documentation copy. Add a server/build-only `src/data/signLocales.ts` containing content locale, native label, direction, path segment, optional validated search tag, and country relationships. Keep countries separate from languages and from PDF capability IDs. Keep translation bundles out of `src/data/tools.js` because client components import that module.
2. **Validated content.** Add a dedicated `signDocs` collection in `src/content.config.ts` using `src/content/sign-docs/*.yaml` (or JSON) with stable `pageId`, locale, sourceVersion/sourceHash, reviewer, reviewedAt, publication state, and required content fields. Use `draft → reviewed → published` plus a stale-source flag. Exclude incomplete entries from public route generation. Keep `sign-quickstart-drafts.json` in `docs/` until reviewed/adapted, not in public assets.
3. **Shared templates and routes.** Extract a `SignPage.astro`/`SignDocumentation.astro` wrapper, reused by existing `src/pages/sign.astro` and new `src/pages/[locale]/sign.astro`. Use `getStaticPaths()` for published locales only. No SSR service, translation API, or new framework required. Astro's routing/content facilities already fit this architecture. [Astro: internationalization](https://docs.astro.build/en/guides/internationalization/)
4. **Layout plumbing.** Add optional `lang`, `dir`, and `alternates` props to `BaseLayout.astro`, defaulting to current English behavior for all other tools. Keep canonical generation path-based. Pass localized content into ToolPageLayout or the Sign-specific wrapper without duplicating the editor. Extend About/FAQ/RelatedGuides/Languages components for localized headings and stable IDs. Localize page chrome but explicitly isolate the English editor.
5. **Country reference and selector.** Build accessible components from the locale/country registry. Country rows can show “English available; Hebrew planned” before translation publication. Selector links list published editions only. All proposed languages remain visible in the reference, with clear status and fallback. The selector is separate from the font picker and existing language-feedback UI.
6. **State safety.** Use stable tool ID `sign` for all drafts and draft hints. Never derive it by stripping a locale URL. Preserve source PDF, edits, selected fonts, zoom/page, and undo state; do not create per-locale storage silos or clear drafts. Reconcile with shared-tab behavior before adding the active-session help-tab enhancement described above.
7. **Translated guides.** Later add `src/pages/[locale]/[contentPage].astro`; extend content schema and registry equivalence keys together. Update `sitePath` to validate allowed nested paths, and review `contentMarkup.ts` link rules separately. Keep existing root English guide URLs unchanged; no broad slug migration. Selector new-tab behavior belongs in its component, not inside the current inline-markup dialect.
8. **SEO and offline build.** Generate sitemap entries and HTML alternate sets from published entries only. Extend `scripts/verify-seo.js`. Check `scripts/generate-precache-manifest.mjs`, `scripts/precacheFilter.mjs`, and `public/sw.js` for actual new-route caching and byte budgets. Do not precache every future draft or promise offline language assets before cache completion.
9. **CSP and CSS.** Any modification of the inline draft-hint script requires recomputing its configured CSP hash and running the production CSP verifier. Prefer bundled scripts for the selector. Scope documentation RTL rules; do not alter editor geometry or font fallback behavior.

### Proposed rollout and acceptance gates

| Phase | Work package | Acceptance / rollback |
|---|---|---|
| 0: source and country clarity | Correct English claims; add all 12 country rows and separate capability/help statuses. | Every row has a working English link; no new support guarantee; current editor tests remain green. |
| 1: Hebrew | Complete reviewed Hebrew documentation, shared template, selector, sitemap/alternates, RTL and state safety. | Direct locale URL shows static translated help; active-session switching cannot lose work; native reviewer approval. Roll back the published locale entry, not source PDFs/storage. |
| 2: Hindi pilot | Complete reviewed Hindi shell; test actual search demand and completion outcomes. | Devanagari layout and UI-term comprehension accepted; no claim that Hindi covers India. |
| 3: measured expansion | Filipino, Malay, French, Arabic, Chinese, Spanish based on demand and reviewers; prioritize usable help over duplicate regional pages. | Each edition independently meets content, code, state, and fidelity-claim gates. |
| 4: remaining help and guide depth | Dari, Pashto, Tamil, selected device/no-signup guides. | Locale coding settled; reviewed terminology and scripts; no missing-guide fallback masquerading as a translation. |

Estimated engineering work after English copy approval: 1–2 days for source/matrix, 2–4 for shared content/routes/SEO, and 2–4 for selector/RTL/state/offline QA. Estimates are planning ranges, not commitments; native review availability and existing editor work are separate dependencies. No implementation timeline is justified by the screenshot alone.

## Translation workflow and maintenance

- Product owner approves factual English source. Stable section IDs and source hashes tie each translation to it; do not rely solely on file modification dates.
- Translator drafts with a glossary: electronic signature ≠ certificate-based digital signature; local processing ≠ no site analytics; PDF text support ≠ translated help; cached assets ≠ guaranteed offline availability.
- Native reviewer checks terminology, names, dates/digits, examples, privacy wording, font limitations, and the actual English labels shown in the editor. AI drafts are not native review.
- Engineer checks schema, static rendering, links, bidi, state safety, and page weight. Only then does the content owner mark an entry published.
- Source edits flag dependent translations stale. Safety/capability corrections block affected publication until reconciled; cosmetic edits may retain the last reviewed version with a tracked update task. Missing noncritical related guides link explicitly to English; missing primary documentation keeps the entire locale unpublished.
- Review after editor-label, storage-policy, font-support, or offline changes and at least quarterly. Assign a content owner and reviewer per locale before launch.

## Verification checklist for implementation

- Run `npm run typecheck`, relevant unit tests, `npm run build`, `npm run test:seo`, `npm run test:csp`, `npm run test:css`, and `npm run test:weight`. Extend existing tests before adding redundant suites.
- Built HTML must contain translated main help without JavaScript, exactly one H1, correct page language/direction, isolated English editor, valid metadata, and matching visible/schema FAQ answers.
- Crawl every generated locale link locally: target exists, 200 response, correct self-canonical, reciprocal alternates, no draft paths, no mislabeled English placeholders, sitemap membership only for published pages.
- Test all 12 country rows, published-language selector, unsupported-language fallback, missing guide, storage blocked, keyboard-only and JS-disabled documentation navigation.
- In Chrome, load a synthetic PDF, add text/signature, switch help while editing, navigate back/forward, and download; assert no document mutation/loss or second editor writing shared state. Test the help-only tab guard before enabling it.
- Verify RTL at narrow widths/zoom and mixed English button labels/numbers; do not infer PDF export correctness from HTML rendering.
- Run relevant real-PDF render/extraction tests for every capability claim being changed; glyph coverage alone is insufficient. Preserve existing script limitations in translated copy.
- Test offline after successful asset provisioning and with missing caches; selector, help, and editor must fail or fall back honestly without network-dependent processing.
- Confirm no new font payload on unrelated routes, no uncontrolled translation-bundle import into the editor, no hydration/CSP warnings, and no private document data in analytics.

## Measurement proposal (not enabled by this review)

First obtain the screenshot's metric/period and an aggregate baseline for Sign acquisition and completion. Use Search Console page/query/country aggregates where access is available, and compare 28-day windows only after enough exposure. Country and preferred help language are different dimensions; small counts do not justify significance claims.

Proposed allowlisted events: `docs_locale_selected` (from/to locale IDs), `docs_english_fallback` (page ID and requested supported locale), `sign_export_success` (coarse outcome only), and `sign_export_failure` (sanitized code). Reuse approved analytics infrastructure; no raw query strings, entered text, filenames, signature images, PDFs, persistent identity, or document identifiers. Validate provider privacy/retention settings before enabling new events. Telemetry must never block offline work.

Success criteria: every target country is discoverable in the reference; readers can find help and complete an export; no increase in export failures or performance regressions; useful localized search impressions/clicks grow where measured. Report numerator/denominator and sample limitations. Do not optimize language-selector click counts alone.

## Deliverables and remaining decisions

- This document: source audit, all-country mapping, locale policy, UX/SEO decision, engineering specification, rollout, and acceptance gates.
- [Translation samples](./sign-quickstart-drafts.json): corrected English quick start plus Hebrew, Hindi, Arabic, Canadian French, Simplified Chinese, and Colombian Spanish drafts. All are explicitly unpublished and require review; none claim to be complete page translations.
- Still required before release: English claim approval, named native reviewers, actual audience/query/device data, per-locale publication decisions, and confirmation of the active-editor switching design. No site code, editor behavior, production routes, or analytics configuration was changed by these deliverables.
