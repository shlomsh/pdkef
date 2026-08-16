# View density control (Relaxed / Condensed / Full screen)

> **Status: landed.** `ViewControl.jsx`, `useViewDensity.js` and their tests are in the tree and wired
> into both the Sign and Redact toolbars. This is kept as the design record for *why* the control works
> the way it does, not as a task. Backlog state lives in
> [TODO.md](../TODO.md).
>
> This file used to be named `E9-...`, which collided with the board's unrelated E9 (offline-first app
> shell). The prefix was dropped; the doc was never a board epic.

Implementation spec. Self-contained: read this plus the files it names, and you
should not need the conversation that produced it.

**Read [CLAUDE.md](../CLAUDE.md) first**, in particular the CSP section, the
"Styling direction" section, and the Sign editor toolbar rules. Several
invariants below are load-bearing and each one already caused a shipped bug.

---

## 1. Background: what already landed

A previous change condensed the tool pages. On a 1512x870 laptop the Sign page
went from 503px of chrome above the document (42% of the viewport was the file)
to 249px (71%). Three parts, all already merged into the working tree:

1. **A real bug fix** in `src/styles/global.css`: `header { padding: 3.5rem 1.5rem 1.5rem }`
   inside `@media (min-width: 768px)` is unlayered CSS, and Tailwind utilities
   are imported into `@layer utilities`, so the bare element selector beat every
   `min-[1024px]:pt-2` on the hero. It is now `header:not(.tool-hero)`.
2. **A condensed desktop hero** in `src/components/ToolHero.astro`: CSS grid at
   >=1024px putting the trust chips on the title's row, smaller title/icon,
   tighter subhead.
3. **An automatic fold-away**: once a file is open the hero drops its subhead and
   chips and shrinks its title. Driven in pure CSS off `[data-tool-shell]`, an
   attribute on the `ToolShell` component, which renders only when a file is
   loaded - in *every* tool.

Plus a CLS mitigation: `src/lib/draftStore.js` mirrors "a draft exists" into
localStorage, and a blocking `is:inline` script in
`src/layouts/ToolPageLayout.astro` reads it before first paint so a returning
visitor with a saved draft does not watch the hero collapse after the page has
already painted (an input-less layout shift, which CLS scores).

**Two problems remain, and this ticket fixes both.**

- The fold-away is automatic and permanent. There is no way to get the copy back.
- It applies to all nine tools, because `[data-tool-shell]` is universal. It pays
  off when the workspace is tall enough to push the document off screen, and is
  counterproductive on a short single-card tool, where it trades useful copy for
  empty background.

---

## 2. What to build

### 2.1 The model

Two independent pieces of state. **Do not collapse them into one enum** - that
was considered and rejected, for the reasons in 2.2.

| State | Type | Owner | Lifetime |
|---|---|---|---|
| `density` | `'relaxed' \| 'condensed'` | new, persisted in localStorage | across visits and tools |
| `isFullscreen` | boolean | already exists in `PdfWorkspace.jsx` / `PdfRedactTool.jsx` | transient, owned by the Fullscreen API |

The control *presents* them as one three-stop ladder, because each stop hides
strictly more than the last (Relaxed hides nothing -> Condensed hides the hero
copy -> Full screen hides hero, app bar and browser chrome). But underneath,
full screen is not a density.

### 2.2 Why not one enum

Full screen has **external exits**: Esc, F11, and the browser's own UI. If the
control owned a single three-value state, every one of those would desync it. A
segmented control that *reflects* `isFullscreen || density` has no such problem -
when the user escapes out, the highlight simply returns to the density segment.

Also: browsers require a user gesture to enter the Fullscreen API, so a persisted
"full screen" could never be restored on load. It is not a persistable
preference, which is the other reason it is not part of `density`.

### 2.3 Behaviour

| Click | Effect |
|---|---|
| Segment 1 (Relaxed) | `density = 'relaxed'`; if currently fullscreen, exit it |
| Segment 2 (Condensed) | `density = 'condensed'`; if currently fullscreen, exit it |
| Segment 3 (Full screen) | enter fullscreen; `density` untouched underneath |

Active segment = segment 3 when `isFullscreen`, else the segment matching
`density`.

Default when nothing is stored: `'condensed'`. That preserves today's behaviour.

**The density preference only applies when a file is open.** The empty state is
always Relaxed. This is not a nicety: on Sign and Redact the toolbar - and
therefore this control - does not render until a file is loaded, so a persisted
"condensed" applied to the empty state would collapse the hero with nothing on
screen able to undo it.

### 2.4 Where it renders

Replaces `FullscreenButton` in the toolbar, same slot.

- **>=920px**: the three-stop segmented control.
- **<920px**: today's `FullscreenButton`, unchanged, and density stays automatic.

Render **both** and show/hide with CSS at 920px. Do not use a JS media query -
the CSS approach needs no resize listener and cannot produce a hydration
mismatch. See 4.3 for why having both in the DOM is safe.

---

## 3. Visual spec

Reference mock (1:1 control plus every state in context):
https://claude.ai/code/artifact/52f75436-2e97-4893-a0c3-7d1170b9e179

### 3.1 The segmented control

- Total **99 x 44px**. Three 33px segments. 44px height matches `--btn-min-size`.
  (For comparison, the labelled "Full screen" button it replaces is ~127px, so
  this is a net width saving in a toolbar that is width-constrained - see 4.2.)
- One shared track: `1px solid var(--color-border)`, `border-radius: var(--radius-sm)`
  (10px), `background: var(--color-surface)`, `box-shadow: var(--shadow-xs)`,
  `overflow: hidden`.
- Segment dividers: `border-right: 1px solid var(--color-border)`, none on the last.
- Inactive segment: transparent background, `color: var(--color-muted)`.
- Active segment: `background: var(--color-primary)`, `color: var(--color-surface)`.
- Icons 17x17, `stroke-width: 2` (2.2 for the fullscreen glyph), `fill="none"`,
  `stroke="currentColor"`.

Icons, forming a deliberate ladder (thick header band -> thin header band -> no
frame at all):

```html
<!-- Relaxed -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 10h18" />
</svg>
<!-- Condensed -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 7h18" />
</svg>
<!-- Full screen: reuse the existing glyph from FullscreenButton.jsx -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
     stroke-linecap="round" stroke-linejoin="round">
  <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" />
  <path d="M21 16v3a2 2 0 0 1-2 2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" />
</svg>
```

**Preact SVG attribute trap** (see CLAUDE.md): raw Preact ignores camelCase SVG
attributes. Write `stroke-width`, not `strokeWidth`.

### 3.2 Accessibility

- Wrapper: `role="radiogroup"`, `aria-label="View density"`.
- Segments: `<button role="radio" aria-checked={...}>` with a visible-text-free
  accessible name via `aria-label`: `"Relaxed view"`, `"Condensed view"`,
  `"Full screen"`. Add matching `title` for hover tooltips.
- **Roving tabindex**: only the active segment has `tabindex="0"`, the others
  `tabindex="-1"`. Arrow keys (Left/Right/Up/Down) move between segments and
  activate; Home/End jump to first/last.
- Visible focus state: the project uses `:focus-visible { outline: 2px solid
  var(--color-primary); outline-offset: 2px }` globally. Confirm it is not
  clipped by the track's `overflow: hidden` - if it is, use an inset
  `box-shadow` ring on the segment instead.

---

## 4. Implementation

### 4.1 Files

| File | Change |
|---|---|
| `src/components/ViewControl.jsx` | **new** - renders segmented control + `FullscreenButton` |
| `src/components/ViewControl.module.css` | **new** - segmented styles + the 920px show/hide |
| `src/lib/useViewDensity.js` | **new** - the hook: read/write localStorage, sync `data-view-density` |
| `src/components/SignTool/SignToolbar.jsx` | swap `FullscreenButton` -> `ViewControl` |
| `src/components/RedactToolbar.jsx` | swap `FullscreenButton` -> `ViewControl` |
| `src/components/ToolHero.astro` | gate collapse on density + the condensable flag |
| `src/layouts/ToolPageLayout.astro` | extend the inline script; pass the flag to `ToolHero` |
| `src/data/tools.js` | add `condenseOnLoad` per tool |
| `astro.config.mjs` | **recompute the CSP hash** (see 4.5) |
| `src/components/FullscreenButton.jsx` | unchanged |

### 4.2 Toolbar width invariants - read before touching `SignToolbar.module.css`

The toolbar's sizing rules are documented at length in that file and in
CLAUDE.md, and each rule fixed a shipped bug. The relevant ones:

- **Size from `.toolbar > *`, never `.toolbar .someClass`** - a more specific
  selector silently wins in the media queries and sizes that one control
  differently from its neighbours. `ViewControl`'s root is a toolbar child, so it
  is already covered; give it `flex: 0 0 auto` in its own module so it keeps its
  intrinsic 99px instead of growing, and do **not** add width rules for it inside
  `SignToolbar.module.css`.
- Desktop (>=920px) sets `flex-shrink: 0` on every toolbar child and allows
  `flex-wrap: wrap`, so nothing can ellipsise. The container-query thresholds at
  1160px / 960px drop button labels in priority order. **Replacing a ~127px
  labelled button with a 99px control gives those thresholds ~28px more slack,
  which is fine** - they are deliberately set above their measured figures. Do
  not retune them.
- Below 920px every control is icon-only and shares one `flex-basis`, and
  `--controls-per-row` splits wrapped lines evenly. This is exactly why the
  segmented control is desktop-only.

### 4.3 Why rendering both variants is safe

`e2e/sign/toolbar-touch-targets.spec.js` runs only at 700px and 390px, and it
filters to `button.offsetParent !== null` - so the CSS-hidden segmented control
is skipped and the assertions still see a uniform row. The
`--controls-per-row` selectors (`:has(> :nth-child(9))`) count *all* children
including hidden ones, but they are written to tolerate over-counting by one
(see the comment in `SignToolbar.module.css`); Sign goes from 9-10 children to
10-11, which stays in the same `>= 9` bucket. Verify both anyway - see 6.

### 4.4 Applying density to the hero

Currently `ToolHero.astro` collapses on `body:has([data-tool-shell])`. Two gates
must be added.

**Gate 1 - the density preference.** `useViewDensity` sets
`document.documentElement.dataset.viewDensity`. The hero collapses only when it
is `condensed`:

```css
:global(html[data-view-density='condensed']:has([data-tool-shell])) .tool-hero[data-hero-condensable] { ... }
```

**Gate 2 - the per-tool flag.** `data-hero-condensable` is rendered on the
`<header>` by `ToolHero.astro` only when the tool opts in. Pass it down:
`ToolPageLayout.astro` -> `<ToolHero condensable={tool.condenseOnLoad !== false} />`.

Note the existing `html[data-draft-hint]` rules must get the same two gates, or a
draft will pre-collapse a hero the user asked to stay relaxed.

Keep using `:global(...)` for the `html`/`body` part. Astro scopes every compound
in a selector, so a bare `html[...]` would compile to
`html[data-astro-cid-xxx][...]` and never match. This is already the pattern in
that file - follow it.

### 4.5 The inline script and its CSP hash - highest-risk step

`src/layouts/ToolPageLayout.astro` contains the project's only `is:inline`
script. It must stay `is:inline`: a bundled Astro `<script>` compiles to
`type="module"`, which is always deferred and would run after the body has
parsed, too late to prevent the flash it exists to avoid.

Astro does **not** auto-hash `is:inline` scripts. Its sha256 is hand-listed in
`astro.config.mjs` under `security.csp.scriptDirective.hashes`. **Any edit to
that script - even one byte - breaks CSP on every tool page**, and CSP is not
enforced in `astro dev`, so this will look fine locally and fail in production.

Extend the script to also apply the density preference before first paint:

```js
(function () {
  try {
    var slug = location.pathname.replace(/\//g, '');
    var density = localStorage.getItem('pdf-toolkit:view-density') || 'condensed';
    document.documentElement.setAttribute('data-view-density', density);
    if (density === 'condensed' && localStorage.getItem('pdf-toolkit:has-draft:' + slug) === '1') {
      document.documentElement.setAttribute('data-draft-hint', '1');
    }
  } catch (e) {}
})();
```

Keep it free of any per-page interpolation so one hash covers all twelve pages.

Then recompute:

```bash
npm run build && node -e "const f=require('fs'),c=require('crypto');const h=f.readFileSync('dist/sign/index.html','utf8');const i=h.indexOf(\"getItem('pdf-toolkit:view-density')\");const s=h.lastIndexOf('<script>',i);const e=h.indexOf('</script>',s);console.log('sha256-'+c.createHash('sha256').update(h.slice(s+8,e),'utf8').digest('base64'))"
```

The marker is the `getItem(...)` call, not the bare string `view-density`: the
latter also appears in the inlined CSS from 4.4, which is emitted into the same
`<head>`, and `lastIndexOf('<script>', ...)` would then walk back to the wrong
tag (the JSON-LD block) and hash the wrong bytes. If you change the script, keep
the marker something that appears **only** inside it.

Paste the result into `astro.config.mjs`, rebuild, and confirm the hash appears
in the generated `<meta http-equiv="content-security-policy">` in
`dist/sign/index.html`. Also confirm the identical hash is produced for
`dist/redact/index.html` and `dist/merge/index.html`.

### 4.6 Persistence

- Key: `pdf-toolkit:view-density`, values `'relaxed' | 'condensed'`. This matches
  the existing `pdf-toolkit:*` convention (`pdf-toolkit:lastWhiteoutColor`,
  `pdf-toolkit:has-draft:<tool>`).
- Global, not per tool - the user asked for a preference that carries across
  tools and visits.
- Every localStorage access must be wrapped in `try/catch`. It throws in some
  locked-down and private-browsing contexts, and the tool must never break
  because a preference could not be read. `draftStore.js` shows the pattern.

### 4.7 Per-tool flag in `src/data/tools.js`

Add `condenseOnLoad` to each entry. Default to condensing (`!== false`) so a new
tool inherits the useful behaviour and only the exceptions carry the flag.

| Tools | `condenseOnLoad` | Why |
|---|---|---|
| `sign`, `redact` | `true` | Full-page document editor; the whole point |
| `merge`, `split`, `edit-pdf`, `pdf-to-image`, `image-to-pdf` | `true` | File list / page grid, grows tall |
| `compress`, `unlock` | `false` | One short options card; collapsing buys no space and leaves the page looking sparse |

Only Sign and Redact get the control, because only they have a toolbar to put it
in. The five middle tools condense automatically with no override; their hero
copy is repeated in the About card immediately below, so nothing is unreachable.

---

## 5. Copy

Per CLAUDE.md's "Product, voice & copy": plain words, no intensifiers, **no em dashes**.

- `aria-label` / `title`: `"Relaxed view"`, `"Condensed view"`, `"Full screen"`.
- When already in full screen, segment 3's label becomes `"Exit full screen"`
  (matching today's `FullscreenButton` behaviour).
- No visible text labels on the segments; the ladder icons plus tooltips carry it.

---

## 6. Definition of done

Baseline before you start: `npx vitest run` is **50 files / 491 tests passing**.
If it is not, the working tree has drifted - find out why before writing code.

1. `npm test` green, including new tests (below).
2. `npm run test:css` green. **This is the tight one**: the CSS budget check
   currently reports `78303 bytes (limit: 80000)`, so there is only ~1.7KB of
   headroom for the new module. If you exceed it, trim rather than raise the
   limit.
3. `npm run test:e2e` green - in particular `e2e/sign/toolbar-touch-targets.spec.js`,
   which must still see a uniform icon-only row at 700px and 390px.
4. `npm run build && npm run preview`, then in a real browser confirm **zero CSP
   violations** in the console on `/sign/`, `/redact/` and `/merge/`. The dev
   server cannot catch this class of bug.
5. Manual checks at 1512x870:
   - Sign, no file: full hero, no control.
   - Sign, file open: condensed hero, segmented control showing Condensed.
   - Click Relaxed: hero expands, preference survives reload **and** a jump to
     `/redact/`.
   - Click Full screen, then press **Esc**: highlight returns to the density
     segment, not to some third state.
   - With a saved draft and density Relaxed, reload: hero must **not**
     pre-collapse.
   - `/compress/` with a file: hero stays relaxed.
6. At 390px: plain Full screen button, uniform row, no segmented control.

### New tests

- `ViewControl.test.jsx`: renders three radios; correct one is `aria-checked`;
  clicking each fires the right callback; arrow keys move the roving tabindex;
  segment 3 reflects `isFullscreen`.
- `useViewDensity.test.js`: default is `condensed`; a written value round-trips;
  a throwing localStorage does not break the hook.
- Extend `SignToolbar.test.jsx` / the Redact toolbar tests to assert the control
  is present in the toolbar.

---

## 7. Out of scope

- Changing the PDF page render width. It renders at ~1316px (about 166% zoom) on
  a 1512px screen, which is why one A4 is 1863px tall. Capping it at natural size
  would roughly double how much of a document is visible, but it puts empty
  gutters either side and is a separate product decision. **Explicitly declined
  for now** - do not fold it into this ticket.
- A density control on the five auto-condensing tools. Considered; rejected as
  new UI on five pages to undo something that is almost always right.
- Any change to the mobile toolbar's sizing invariants.
