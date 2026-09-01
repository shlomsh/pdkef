# App documentation and localization design

Date: 2026-08-28. Scope: all user-facing app documentation, including the ten current standalone guides and documentation embedded on tool pages. This includes repository review, product/SEO recommendations, translation samples, and implementation specifications. This is not a shipped feature or a replacement task tracker; execution state belongs in `TODO.md`.

Scope correction: Android, iPhone, Mac, Windows, installation, and related articles are primary deliverables, not optional extensions of the Sign page. Documentation discovery is organized by topic, not country. Internal engineering documents remain source material rather than customer translation targets.

## Recommendation

Build one documentation localization system shared by all guides and tool-help sections. Preserve every current English URL, including `/sign/` and `/how-to-sign-a-pdf-on-android/`. Add a **Documentation language** selector to each article and tool-help page, with statically generated translated URLs such as `/he/how-to-sign-a-pdf-on-android/` and `/hi/how-to-sign-a-pdf-on-iphone/`. Switching language keeps the reader on the equivalent article. Keep separate templates for standalone guides and interactive tool pages; reuse their existing content blocks and layouts rather than flattening every topic into one Sign page. Editor controls remain English, explicitly labeled as such. Choosing a documentation language must never change a PDF's text, font, direction, or saved state.

Start by correcting the English source and exposing relevant articles as topic cards on their tool page. Language choices belong on the individual article and appear only when that same article has a real reviewed translation. Do not create country pages, country-to-language recommendations, or controls that advertise unfinished translations.

The current request expands documentation scope beyond the earlier language-support work recorded in `docs/sign-tool-product-decisions.md`. It does not authorize an editor translation, new language-rendering guarantees, or a processing server. Existing uncommitted editor/font work was inspected as evidence and left untouched.

## Evidence and limits

- Audience source: the user's screenshot dated 2026-08-28. Its metric name, reporting period, denominator, device mix, and language preferences are unknown. Counts below are screenshot counts, not assumed users, visits, or conversions. Displayed percentages total 97%; do not normalize or infer the missing share. The 12 counts total 159.
- Review source: the working checkout, including uncommitted changes, not a verified production deployment. No live-site crawl, visual browser audit, Search Console access, or keyword-volume research was performed.
- Read all ten standalone guide sources, their route/registry, ContentPageLayout, OtherGuides, RelatedGuides, and the earlier Sign sources. `offline-pdf-form-filler.yaml` appeared in the working tree during the review and is included, not assumed deployed. Platform workflows and PDF safety guarantees still require actual execution tests; source review is not device validation. Internal README and product decisions supplied architectural context; those documents are not all customer help content.
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
| High | Documentation discovery | Do not infer a visitor's language from country analytics. Organize links by task/topic and expose translated equivalents only in that article's language selector. Browser translation remains available independently. |
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

## Complete documentation inventory and page priorities

Every row is in scope. A/B/C specify translation order within a chosen language. Start with reviewed Hebrew A pages, then Hebrew B and Hindi A in the next release. Do not declare the documentation localized because only the tool page was translated.

| Page ID / existing English URL | Wave | What to review and translate | Page-specific publication gate |
|---|---|---|---|
| `sign` / `/sign/` | A | Embedded instructions, privacy, limitations, FAQs, and topic-based guide links. | English editor isolated; documentation payload and active-editor state safety. |
| `how-to-sign-a-pdf-on-android` / `/how-to-sign-a-pdf-on-android/` | A | Getting an attachment onto the device, selecting it, signing, locating the download, sharing, troubleshooting. | Verify a named Android/Chrome version; remove universal Chrome availability and “nothing left behind” claims that contradict saved drafts. |
| `how-to-sign-a-pdf-on-iphone` / `/how-to-sign-a-pdf-on-iphone/` | A | Files/attachment workflow, Safari file selection, signing, download location, sharing, iPad distinctions, current built-in alternatives. | Verify a named iOS/Safari version; Chrome-only acceptance does not certify Safari. Separate iPhone and iPad accessory claims. |
| `install-pdf-app` / `/install-pdf-app/` | A | Device-specific installation, optional installation vs browser use, cached assets, offline verification, draft retention/deletion. | Verify steps by browser/OS; qualify offline readiness and recheck Safari-only installation claims. |
| `offline-pdf-form-filler` / `/offline-pdf-form-filler/` | A | Offline form-filling workflow, scanned/flat PDFs, visible text vs stored interactive-field values, symbols, storage. | Preserve the explicit field-data limitation; correct “one page load” and guaranteed crash-recovery wording. Keep its task intent distinct from installation instructions. |
| `sign-pdf-no-signup` / `/sign-pdf-no-signup/` | A | Account-free workflow, local processing, storage, signature-type distinction, FAQs. | Correct privacy heuristics and legal-acceptance generalizations. |
| `how-to-sign-a-pdf-on-windows` / `/how-to-sign-a-pdf-on-windows/` | B | File Explorer workflow, mouse/touch signing, downloads, browser choice, accurate Edge comparison. | Resolve table allowing text on scans vs FAQ denying it; verify Edge/Firefox app promises separately. |
| `how-to-sign-a-pdf-on-mac` / `/how-to-sign-a-pdf-on-mac/` | B | Finder workflow, trackpad/typed signatures, downloads, Preview comparison, draft boundaries. | Remove implication that unfinished work follows readers to another device: body/comparison suggest this, FAQ denies sync. |
| `open-source-pdf-editor` / `/open-source-pdf-editor/` | B | Privacy explanation, scoped offline experiment, source/license links, self-hosting, FAQs. | “No processing backend” does not prove uploads impossible. Offline execution alone cannot prove no queued upload; same-origin CSP connections are allowed. Correct the assurance. |
| `permanently-delete-text-from-pdf` / `/permanently-delete-text-from-pdf/` | C, safety review first | Deletion vs covering, scans vs text, redaction choices, verification, metadata/other-copy limitations. | Verify removal/export behavior. Do not translate blanket blur-safety claims or imply a failed text search proves sanitization. |

The ten current guides use `src/content/content-pages/*.yaml`; tool-help content uses `src/data/tools.js`. Inventory and review descriptions, instructions, FAQs, and links for all nine tool pages (`sign`, `merge`, `split`, `edit-pdf`, `compress`, `pdf-to-image`, `image-to-pdf`, `unlock`, `redact`). Translate remaining tool-help sections as wave C according to demand, keeping editor UI unchanged. A localized guide may link to an untranslated tool, but disclose the English destination rather than inventing a translated URL. Discover new guides from the registry during implementation rather than freezing this inventory count.

### Page-by-language rollout matrix

English is the current source on all rows, with corrections required. No translated full page is published by this review. Record state separately for every `(pageId, locale)` pair:

| Page wave | Hebrew | Hindi | Filipino, Malay, French, Arabic, Chinese, Spanish | Dari, Pashto, Tamil |
|---|---|---|---|---|
| A: Sign + Android + iPhone + installation + offline form filling + no-signup | Release 1 | Release 2 pilot | Repeat A per selected language after demand/reviewer check | Explicit future scope; English fallback until reviewed |
| B: Windows + Mac + open-source | Release 2 | Release 3 | Follow A in the same language | Same staged order |
| C: deletion + remaining tool help | After safety/source review | After safety/source review | After safety/source review | Same staged order |

Publication is per complete page, not per entire locale. A blocked iPhone check should not prevent publishing reviewed Android help; the rollout remains incomplete and missing-page fallback is labeled. Six translated Sign quick starts are samples, not evidence of translated guides.

### Platform facts to correct before translating

The iPhone page's claim that built-in tools cannot fill forms conflicts with Apple's current filling/signing instructions. Rewrite the comparison for tested OS versions. [Apple: forms and signatures](https://support.apple.com/guide/iphone/fill-forms-sign-documents-create-signatures-iph1d3607e5c/26/ios/26)

The Windows FAQ's blanket claim that Edge cannot add text conflicts with Microsoft's documented features and the site's own table. Retain a fair, versioned comparison. [Microsoft: PDF reader](https://www.microsoft.com/en-us/edge/learning-center/how-to-use-pdf-reader-in-microsoft-edge)

Do not promise a fixed download folder regardless of device/browser settings. Explain how to locate and reopen the file. Android Chrome has a Downloads workflow; attachment-export steps still need verification. [Google: Android downloads](https://support.google.com/chrome/answer/95759?co=GENIE.Platform%3DAndroid&hl=en)

## Audience signals

Country analytics may help prioritize research and reviewer recruitment, but they are not a public navigation model and do not reveal an individual visitor's language. Do not display country-to-language mappings, recommend a language from geography, or create country landing pages without genuinely country-specific content. Documentation discovery is by topic. A language selector appears inside an article only for published equivalents of that exact topic.

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

The Sign URLs above illustrate locale prefixes, not scope limits. Apply each chosen locale to the page-by-language matrix. Research device-qualified queries per guide, rather than assigning every page the generic Sign title or target phrase.

Keep application/HTML language tags separate from search annotations. `fil-PH` and `prs-AF` are not automatically safe Google `hreflang` values: Google documents ISO 639-1 language codes. For Filipino, use `tl-PH` only after a reviewer confirms that the edition is appropriately described as Tagalog; otherwise omit that search annotation. For Dari, consider `fa-AF` only after editorial confirmation that the broader Persian label is appropriate. Do not silently rewrite the reader-facing identity. `ps-AF`, `he`, `hi`, `ar`, `ms`, `ta`, `fr-CA`, `es-CO`, and `zh-Hans` are candidates for explicit validation. Unresolved codes are a per-edition publication gate, not a reason to mislabel content. [Google: supported codes](https://developers.google.com/search/docs/specialty/international/localized-versions#language-codes)

## Page and selector decision

| Approach | UX, SEO, and engineering tradeoff | Decision |
|---|---|---|
| Same URL, JS swaps documentation | Can preserve editor state, but translations lack stable shareable/crawlable page identities; JS/cookie dependence complicates discovery. | Optional later enhancement, not the indexable foundation. |
| Same template, language URLs, selector | Stable language links and static content; shared implementation; navigation needs explicit protection for active editing. | Recommended. |
| Country first, then language | Adds an unnecessary step, conflates geography with preference, and can recommend a language the visitor does not speak. | Do not implement. |
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
Documentation [topic cards for the current tool]
Frequently asked questions
Related guides [translated where available; otherwise “English”]
Footer / source / last reviewed
```

### Standalone guide layout and navigation

```text
PDkef / Guides / Android          Documentation language: עברית ▾
Localized Android-specific H1 and introduction
Quick start: get file → select file → sign → download/share
Version-checked platform comparison / when built-in tools suffice
Troubleshooting and privacy/storage notes
Open Sign & Fill [destination language disclosed]
Article-specific FAQ
Other devices: iPhone | Windows | Mac [same language where published]
Related: Installation | No signup [same language where published]
Last reviewed / tested OS and browser / footer
```

Guides stay static and mount no editor. Their language selector navigates normally in the same tab; the active-editor help-tab mechanism below is only for tool pages. The device switcher changes the topic and retains the language; the language selector changes the language and retains the topic. Keep these controls separate.

Example: `/he/how-to-sign-a-pdf-on-android/` → English goes to `/how-to-sign-a-pdf-on-android/`; choosing iPhone goes to `/he/how-to-sign-a-pdf-on-iphone/` when published. Neither should silently return to Sign. For missing equivalents, show “This guide is not available in [language]. Read in English” linking to the same English article. A separate link may show available guides in the requested language. Never substitute a different topic as an alternate. Preserve equivalent section anchors using stable IDs.

Use native language names and optional English labels; do not use flags as language controls. Render real anchors in an accessible disclosure/list with current language marked; keyboard, focus, and no-JS navigation must work. On narrow screens use a full-width control, readable wrapped labels, and comfortably sized targets. Avoid adding a large language list above the editor.

URL locale wins over saved preference. Store only an optional local documentation preference such as `pdkef:docs-locale`; do not create a user identity. Remember it for guide links and suggest it on future visits, but do not automatically redirect `/sign/` or override a deliberately opened URL. If storage is unavailable, links still work.

**Active editing:** initial implementation should open a selected translated help page in a separate, clearly announced tab while an editor session is active; do not depend on a debounced draft to survive a navigation. Use a statically generated documentation-only companion, for example `/he/sign/help/`, built from the same approved content. That companion must not import/mount an editor or restore/write shared drafts. Canonicalize it to the primary locale page and exclude it from the sitemap and alternate sets; it is a convenience view, not another search landing page. Do not use a query flag that merely hides an already mounted editor. Until the companion is tested, keep locale switching before file selection and offer “Download your work before changing language” instead of risking state loss. Do not implement a silent same-tab navigation during editing.

Later, an in-place documentation-only renderer can switch validated content without remounting `PdfSignTool`. Do not introduce a site-wide client router just for this; any History API enhancement must also handle back/forward, headings, focus, metadata, and direct navigation parity.

### RTL and accessibility

Localized page chrome/documentation gets appropriate `lang` and `dir`. Isolate the English editor (`lang="en" dir="ltr"`); PDF text direction must continue to follow its own content. Use logical margins, padding, alignment, and border properties. Mark native language names with their languages and isolate inline `PDF`, English button labels, URLs, and numbers using component-level bidi markup. Do not relax the existing safe content-markup rules to accept arbitrary HTML. [W3C: declaring language](https://www.w3.org/International/questions/qa-html-language-declarations)

No editor TTF downloads just to render help. Prefer system font stacks, check script fallback and line height on actual devices, and add small self-hosted documentation font assets only when testing demonstrates a need. Check 320px width, 200% zoom, RTL wrapping, screen-reader pronunciation, and keyboard operation. Do not mirror the PDF canvas.

## Content to translate and content to retain

The publishable unit is a **complete reviewed page**, guide or tool help. Translate metadata, breadcrumb, hero, all sections, steps, comparison rows/captions, screenshots and alt text where present, CTAs, FAQs, device-switcher labels, related links, footer, and accessible labels. Tool pages also need translated capability/limitation notices and an English-editor notice. Sample JSON files contain selected quick starts, not complete pages; neither is ready to index.

Android and iPhone guides are first-release work alongside Sign, no-signup, installation, and offline form filling. Windows, Mac, open-source, deletion, and other tool help follow the matrix. Fact-check device/offline claims per page. Keeping editor controls English does not remove any guide from scope.

Keep internal architecture, backlog, code identifiers, font family names, license texts, and the project name in their source forms. Localize customer-facing explanations and summaries when useful; do not rewrite third-party legal licenses. Do not turn PDF editor labels into a translation project. Screenshot callouts can be localized while screenshots preserve the actual English controls. Use neutral blank example forms, never real visitor documents. No currency adaptation is needed for a free tool; do not invent pricing differences or trust seals.

## SEO publication contract

Each approved translated page gets a self-canonical URL with trailing slash. English remains `/sign/`; do not redirect it to `/en/sign/`. Generate reciprocal HTML alternate links from a single list of **published equivalent pages**, including self and an English `x-default`. `x-default` is our fallback choice, not a claim that Google requires it. Do not advertise draft, missing, redirecting, or English-copy placeholder URLs as localized alternates. Use one alternate method rather than maintaining competing implementations. [Google: localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)

All published canonical locale URLs also go into the ordinary sitemap, with genuine review/content dates if `lastmod` is added. Guide alternates are per-guide equivalence groups: never point a missing translated guide's alternate tag at the Sign home page. Ordinary related links may lead to English with an explicit English label.

Localize titles, descriptions, headings, social descriptions, and visible schema text from the same content entry. Keep SoftwareApplication identity/technical facts consistent. If existing FAQ schema is retained, both questions and answers must match visible localized content. Do not promise FAQ rich results or add deprecated HowTo markup. Don't pad quick-start help to meet generic word-count targets. Do not create country-name-swapped landing pages.

## Engineering implementation specification

Paths below are proposed changes, not files created by this review unless explicitly linked as deliverables.

1. **Shared registry.** Keep build-only documentation locale routing in `src/i18n/` (`documentationLocales.ts` for locale identity/direction/path/search tags, plus the documentation route resolver) and a page registry keyed by `(pageId, locale)` with kind (`guide` or `tool-help`), canonical path, hub tool, device, publication state, and equivalence ID. Keep PDF capability IDs separate. Keep translation bundles out of client-imported `src/data/tools.js`.
2. **Validated content.** Preserve existing English YAML. Add `src/content/localized-pages/{locale}/{pageId}.yaml` through `src/content.config.ts`, reusing existing guide blocks. Use a separate typed collection for tool help where structure differs, with shared locale, reviewer, sourceVersion/sourceHash, reviewedAt, and publication fields. Require unique pairs and matching registry/content entries. Exclude drafts from public routes; keep samples in `docs/`.
3. **Guide and tool routes in the first release.** Extract the guide body from `[contentPage].astro` into a renderer shared with new `src/pages/[locale]/[contentPage].astro`. Generate only published guide pairs with `getStaticPaths()`. Keep a separate Sign wrapper for `/sign/` and `/[locale]/sign/`; guides must not mount editors. Guard tool/guide slug collisions. No new framework or translation server required. [Astro: internationalization](https://docs.astro.build/en/guides/internationalization/)
4. **Layout plumbing.** Pass `lang`, `dir`, `pageId`, and `alternates` through ContentPageLayout and ToolPageLayout to BaseLayout, with English defaults. Share a DocumentationLanguageSelector component. Extend About/FAQ/OtherGuides/RelatedGuides/Languages components for localized labels and stable IDs. Keep canonical generation path-based; isolate English editor controls.
5. **Topic discovery and selector.** Tool pages render lightweight links to relevant topics from the existing content registry. An article's selector lists only published equivalents of that exact article and remains separate from the font picker and PDF-language feedback UI. It uses ordinary anchors and requires no client bundle.
6. **State safety.** Use stable tool ID `sign` for all drafts and draft hints. Never derive it by stripping a locale URL. Preserve source PDF, edits, selected fonts, zoom/page, and undo state; do not create per-locale storage silos or clear drafts. Reconcile with shared-tab behavior before adding the active-session help-tab enhancement described above.
7. **Article links.** Add `resolveDocumentationLink(pageId, requestedLocale)` returning a published path, effective locale, and explicit fallback state. Use it for CTAs, OtherGuides, RelatedGuides, tool cross-links, and body references; never blindly prefix every href. Extend `sitePath` for valid nested paths while preserving markup safety and external/license URLs. Keep English parity checks and add localized pair checks. Active-tool selector new-tab behavior belongs in its component, not article markup.
8. **SEO and lazy delivery.** Generate sitemap entries and HTML alternate sets from published equivalents only. Extend `scripts/verify-seo.js`. Precache only the minimal root fallback; tool routes, article HTML, localized pages, code chunks, media, and fonts load and enter the runtime cache on demand. Do not make an unrelated tool visitor pay for documentation or another tool's JavaScript.
9. **CSP and CSS.** Any modification of the inline draft-hint script requires recomputing its configured CSP hash and running the production CSP verifier. Prefer bundled scripts for the selector. Scope documentation RTL rules; do not alter editor geometry or font fallback behavior.

### Proposed rollout and acceptance gates

| Phase | Work package | Acceptance / rollback |
|---|---|---|
| 0: source review | Correct all ten guides and tool-help claims; establish the topic and locale registries. | Complete inventory; explicit gates for outdated/unsafe claims. |
| 1: Hebrew A | Sign, Android, iPhone, installation, offline form filling, no-signup; shared guide/tool templates and selector. | Each page reviewed; same-article switching works; mobile instructions tested. |
| 2: Hebrew B + Hindi A | Windows, Mac, open-source in Hebrew; A set in Hindi. | Desktop comparisons checked; mobile parity; no claim that Hindi covers India. |
| 3: remaining pages + selected languages | C after safety review; Filipino, Malay, French, Arabic, Chinese, Spanish repeat A/B/C. | Page-specific gates pass; report guide coverage, not only locale counts. |
| 4: remaining languages | Dari, Pashto, Tamil follow the complete inventory. | Coding/terminology settled; transparent English fallbacks until publication. |

Re-estimate after source review: the earlier Sign-only estimate does not cover ten guides and all tool help. Separate shared infrastructure, per-page translation/review, platform verification, and sensitive deletion/privacy review. Native reviewers and device access are dependencies; country counts do not justify a delivery date.

## Translation workflow and maintenance

- Product owner approves factual English source. Stable section IDs and source hashes tie each translation to it; do not rely solely on file modification dates.
- Translator drafts with a glossary: electronic signature ≠ certificate-based digital signature; local processing ≠ no site analytics; PDF text support ≠ translated help; cached assets ≠ guaranteed offline availability.
- Native reviewer checks terminology, names, dates/digits, examples, privacy wording, font limitations, and the actual English labels shown in the editor. AI drafts are not native review.
- Engineer checks schema, static rendering, links, bidi, state safety, and page weight. Only then does the content owner mark an entry published.
- Source edits flag translations stale per page/section. Safety/capability corrections block the affected page until reconciled; cosmetic edits may retain its last reviewed version with an update task. Missing guides link explicitly to English. A missing article keeps that `(pageId, locale)` unpublished, not every reviewed page in the language.
- Review after editor-label, storage-policy, font-support, or offline changes and at least quarterly. Assign a content owner and reviewer per locale before launch.

## Verification checklist for implementation

- Run `npm run typecheck`, relevant unit tests, `npm run build`, `npm run test:seo`, `npm run test:csp`, `npm run test:css`, and `npm run test:weight`. Extend existing tests before adding redundant suites.
- Built HTML must contain translated main help without JavaScript, exactly one H1, correct page language/direction, isolated English editor, valid metadata, and matching visible/schema FAQ answers.
- Crawl every generated locale link locally: target exists, 200 response, correct self-canonical, reciprocal alternates, no draft paths, no mislabeled English placeholders, sitemap membership only for published pages.
- Test topic links, published-language selectors, missing guides, keyboard-only and JavaScript-disabled documentation navigation.
- For every guide test same-topic language switching, same-language device switching, localized hub CTA, related links, missing-equivalent fallback, and section anchors. Guides must mount no PDF editor.
- Maintain a parity report for all registered guide IDs (currently ten) plus tool-help IDs against chosen locales: missing/draft/reviewed/published/stale, section/FAQ/metadata/link coverage, and reviewer evidence. Never count English fallbacks as translations.
- Verify Android/Chrome and iPhone/Safari workflows on actual supported devices, or record the missing verification. Desktop claims require matching checks; Chrome-only editor acceptance cannot certify iPhone instructions.
- In Chrome, load a synthetic PDF, add text/signature, switch help while editing, navigate back/forward, and download; assert no document mutation/loss or second editor writing shared state. Test the help-only tab guard before enabling it.
- Verify RTL at narrow widths/zoom and mixed English button labels/numbers; do not infer PDF export correctness from HTML rendering.
- Run relevant real-PDF render/extraction tests for every capability claim being changed; glyph coverage alone is insufficient. Preserve existing script limitations in translated copy.
- Test offline after successful asset provisioning and with missing caches; selector, help, and editor must fail or fall back honestly without network-dependent processing.
- Confirm the precache manifest contains only the root fallback; no unrelated tool, documentation, translation, media, or font payload may load before it is requested. Confirm no hydration/CSP warnings and no private document data in analytics.

## Measurement proposal (not enabled by this review)

First obtain the screenshot's metric/period and an aggregate baseline for Sign acquisition and completion. Use Search Console page/query/country aggregates where access is available, and compare 28-day windows only after enough exposure. Country and preferred help language are different dimensions; small counts do not justify significance claims.

Proposed allowlisted events: `docs_locale_selected` (from/to locale IDs), `docs_english_fallback` (page ID and requested supported locale), `sign_export_success` (coarse outcome only), and `sign_export_failure` (sanitized code). Reuse approved analytics infrastructure; no raw query strings, entered text, filenames, signature images, PDFs, persistent identity, or document identifiers. Validate provider privacy/retention settings before enabling new events. Telemetry must never block offline work.

Success criteria: readers finding the correct topic, using a translated equivalent when one exists, continuing to the intended tool, no unrelated payload downloads, no export/performance regressions, and useful search impressions/clicks per guide and locale. Report page/language coverage with sample limitations. Do not label a language complete after translating only Sign.

## Deliverables and remaining decisions

- This document: complete documentation inventory, source audit, page/language priorities, topic-based article/tool UX, SEO/engineering specification, rollout, and acceptance gates.
- [Translation samples](./sign-quickstart-drafts.json): corrected English quick start plus Hebrew, Hindi, Arabic, Canadian French, Simplified Chinese, and Colombian Spanish drafts. All are explicitly unpublished and require review; none claim to be complete page translations.
- [Device guide samples](./device-guide-translation-drafts.json): Android and iPhone quick starts in English, Hebrew, and Hindi. Complete articles and real-device verification remain required.
- Still required before release: English claim approval, named native reviewers, actual audience/query/device data, per-locale publication decisions, and confirmation of the active-editor switching design. No site code, editor behavior, production routes, or analytics configuration was changed by these deliverables.
