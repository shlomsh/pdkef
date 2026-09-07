# PRD: Scrollable Home Hero

## 1. Overview

The homepage currently splits its first-screen experience across two fixed viewport layers: `.home-header` contains the app bar and hero copy, and `.home-dock` contains the PDF tool launcher. The file workspace and animated demo scroll behind those layers. This makes the headline and tool launcher remain visible after the user leaves the hero.

Restructure the first-screen experience as one normal-flow hero. The headline, subtitle, recent files/file dropzone, and PDF tool launcher must enter and leave the viewport together. On mobile, that complete hero should occupy at least one small viewport height, and the animated demo should begin immediately below it.

This is a layout-only change. Existing links, file selection/drop behavior, recent-file behavior, demo animation, tool order, labels, analytics/data attributes, and informational content must continue to work unchanged.

## 2. Goals

- Make the hero headline and subtitle scroll normally instead of remaining fixed.
- Make the PDF tool launcher part of the hero instead of a viewport-fixed dock.
- Compose the mobile hero from the title/subtitle, recent files or dropzone, and tool launcher.
- Give the mobile hero a minimum height of `100svh`, while allowing it to grow when content, browser chrome, localization, text zoom, or accessibility settings require more space.
- Place the animated demo directly after the hero in mobile document order.
- Preserve the current desktop concept: workspace beside the animated demo, with the tool launcher belonging to the hero and scrolling away with it.
- Remove the fixed-layer geometry that caused header/dock offset bookkeeping and visual seams.

## 3. User Stories

### US-1: The first screen behaves as one hero

As a visitor, I want the headline, workspace, and tool launcher to feel like one section so I understand the product before I scroll into the demo and supporting content.

Acceptance criteria:

- The app bar, headline, subtitle, file workspace, and tool launcher are descendants of one hero section in the rendered document.
- Neither the headline/subtitle wrapper nor the tool launcher uses fixed or sticky viewport positioning.
- Scrolling beyond the hero removes all hero content from view naturally.
- Existing tool links keep their current URLs, order, labels, accents, tooltips, and focus behavior.
- Browser verification confirms the entire group moves together at desktop and mobile viewport sizes.

### US-2: Mobile gets a complete first viewport before the demo

As a mobile visitor, I want the product promise and primary actions in the first screen, followed by the demo, so the interaction hierarchy is predictable.

Acceptance criteria:

- At widths up to 760px, document order is: app bar and hero copy, recent files/file dropzone, tool launcher, animated demo, then informational content.
- The mobile hero uses `min-height: 100svh` rather than a hard height, and uses a column layout to distribute its contents within the available viewport.
- On representative modern-phone viewports, the hero fills the first screen without the demo overlapping or appearing between hero elements.
- When content cannot safely fit because of a short viewport, text zoom, or wrapping, the hero grows and the page scrolls normally; controls are never clipped merely to preserve a one-screen composition.
- The tool launcher may scroll horizontally at narrow widths, but the page must not gain unintended horizontal overflow.
- Browser verification covers at least 390×844 and 360×640, plus 200% text zoom or an equivalent constrained-height check.

### US-3: Desktop retains the workspace-and-demo presentation

As a desktop visitor, I want to keep the existing side-by-side workspace and live demonstration while the page no longer pins global hero UI over later content.

Acceptance criteria:

- At desktop widths, the file workspace and `HeroDemo` remain side by side in the hero experience.
- The animated story may retain its internal sticky scrolling behavior, but the headline and tool launcher must not be viewport-fixed.
- The tool launcher appears as the final hero row and scrolls out before informational cards take over.
- The long demo story retains its current timing and reaches all existing states.
- Browser verification confirms there is no white seam at the former fixed-header boundary at the top or after scrolling.

### US-4: Existing interactions remain unchanged

As a returning visitor, I want file and navigation interactions to behave exactly as before despite the new layout.

Acceptance criteria:

- Clicking the PDkef logo still navigates to `/` and lands at the top of the homepage.
- Recent files and file selection/drop behavior continue to function.
- All nine tool links navigate to the same destinations as before.
- “Works offline” and “Back to your workspace” still navigate to and focus the intended targets without relying on a fixed-header offset.
- Existing reduced-motion behavior and keyboard focus styles remain intact.
- Browser verification exercises logo navigation, a tool link, file-picker focus, offline navigation, and the workspace-return link.

## 4. Functional Requirements

1. Introduce a semantic hero wrapper in `src/pages/index.astro` that contains the existing `AppBar`, `.hero-header`, file workspace, and `.home-dock` navigation.
2. Move `.home-dock` into this hero wrapper in source order. Do not duplicate the tool list for different breakpoints.
3. Remove `position: fixed`, viewport insets, fixed z-index layering, and fixed-height assumptions from `.home-header` and `.home-dock`.
4. Remove `#home-content` padding that exists only to reserve space for the fixed header and dock.
5. Replace `--home-header-height`, `--home-dock-height`, and `--home-stage-height` as global layout dependencies with local grid/flex sizing. Retain a measured offset only if an independently sticky desktop demo demonstrably requires it.
6. On mobile, keep the workspace in the hero and place `.home-tour` after the hero. The hero must use `min-height: 100svh` and allow natural growth.
7. On desktop, preserve a two-column workspace/demo composition. Prefer CSS source order and grid placement over moving the workspace node at runtime.
8. Simplify or remove `arrangeWorkspace()` in `src/components/homeWorkspace.ts` if CSS can own responsive placement. Preserve the offline-link, workspace-return, resize, and overflow protections that remain necessary.
9. Update anchor scrolling logic so it no longer subtracts a fixed header that does not exist.
10. Keep the canonical Sea Glass + Lime colors and existing visual treatment. The hero background remains `linear-gradient(180deg, var(--color-bg), var(--color-primary-tint))`; the dock retains `#c4e1e6`/the equivalent canonical token and current tile accents.
11. Do not modify application functionality, tool registry data, demo story states/timing, file-processing logic, persistence, or routes.

## 5. Proposed Implementation Sequence

1. **Restructure markup**
   - Add a `.home-hero` wrapper.
   - Place app bar/header copy, `.home-workspace`, and `.home-dock` inside it.
   - Keep one `HeroDemo` instance and one tool navigation instance.
   - Position `.home-tour` after the mobile hero in source order; use desktop grid placement only where needed to maintain the current side-by-side composition.

2. **Replace fixed geometry with flow layout**
   - Change `.home-header` and `.home-dock` to normal-flow blocks.
   - Remove compensating top/bottom padding from `#home-content`.
   - Make `.home-hero` a responsive grid/flex container with `min-height: 100svh` on mobile.
   - Use `min-height`, `minmax(0, …)`, and content-aware gaps instead of hard viewport subtraction so short screens and zoom can expand safely.

3. **Reconcile the desktop scroll story**
   - Preserve the long `.home-tour` scroll range and the sticky `.home-scene`/demo state machine.
   - Recalculate the sticky top and visible stage from local hero structure rather than global fixed-layer variables.
   - Verify that the workspace remains beside the demo and that the dock scrolls away with the hero rather than overlaying story or information cards.

4. **Simplify responsive DOM behavior**
   - Remove breakpoint-driven DOM reparenting if the final CSS grid can represent both layouts.
   - If reparenting is still necessary for desktop sticky behavior, constrain it to initial layout/breakpoint transitions and ensure the mobile source order remains deterministic.
   - Update “Back to your workspace” and offline anchor calculations for a non-fixed header.

5. **Adjust downstream card geometry**
   - Remove dock/header reserves from sticky information cards and the closing workspace card.
   - Re-test overflow detection using the full viewport available to those cards.
   - Keep tall cards in normal flow at zoomed or short viewport sizes.

6. **Verify visually and functionally**
   - Add or update Playwright coverage for mobile document order, hero minimum height, normal scrolling, non-fixed toolbar, and demo placement.
   - Update existing demo sticky/workspace-flow assertions only where their old expectations explicitly encode fixed header/dock offsets.
   - Run focused home/demo E2E tests, typecheck, CSS checks, and the relevant FileDropzone unit tests.
   - Inspect the running page at desktop and mobile sizes, including after scrolling, to confirm no seam, overlap, clipping, or horizontal page overflow.

## 6. Non-Goals

- Redesigning the app bar, headline copy, trust chips, dropzone, recent-file cards, demo artwork, or tool tiles.
- Changing any PDF tool behavior, routes, file processing, storage, or output.
- Changing tool order, adding/removing tools, or introducing an overflow menu.
- Rewriting the demo animation or changing its narrative timing except for the minimum geometry adjustment needed to preserve it after layout changes.
- Changing the informational sections below the demo beyond removing obsolete fixed-header/dock spacing.

## 7. Design Considerations

- The mobile composition should read vertically: identity and promise, work area, then tool launcher. The animated demo is the next scroll destination, not part of the first-screen height budget.
- `100svh` is the baseline, not a clipping constraint. Content legibility and accessible control sizes take priority on small or zoomed viewports.
- Retain horizontal scrolling for the nine-item tool launcher on mobile; it is already familiar, avoids tiny icons, and does not alter functionality.
- Keep the Sea Glass + Lime color relationships already restored. This task changes spatial behavior, not the theme.
- Avoid reintroducing independently painted fixed surfaces, which were the source of the scrolling seam.

## 8. Technical Considerations

- `src/pages/index.astro` currently owns nearly all layout CSS, including fixed offsets consumed by the demo and sticky card stack. The implementation should change these variables as one coordinated unit rather than patching individual offsets.
- `src/components/homeWorkspace.ts` currently measures `.home-header`, reparents `.home-workspace`, computes offline offsets, and checks card overflow against the header. Each responsibility needs to be reviewed separately; removing fixed positioning makes several calculations obsolete.
- `src/components/HeroDemo/storySplit.ts` documents that story timing is coupled to `.home-tour` height. Preserve the `1116svh` story span unless browser testing proves a local wrapper adjustment is required.
- Existing Playwright coverage under `e2e/demo/` and `e2e/home/` should be treated as regression protection, especially `workspace-flow.spec.js`, `sticky-pin.spec.js`, `mobile-legibility.spec.js`, `reduced-motion.spec.js`, and `handoff.spec.js`.
- The no-JavaScript page should keep a coherent mobile order; source order should therefore represent the required mobile sequence wherever possible.

## 9. Success Metrics

- At mobile width, all hero elements appear before the demo in document and visual order.
- The hero is at least one small viewport high and does not clip at constrained heights or zoom.
- After scrolling past the hero, neither headline nor tool launcher remains attached to the viewport.
- No visual seam appears at the old header boundary during scrolling.
- Existing homepage/demo E2E tests pass after intentional expectation updates, and new layout assertions pass at desktop and mobile sizes.
- Typecheck, CSS validation, and FileDropzone tests pass.

## 10. Assumptions and Open Questions

- Assumption: desktop keeps the current workspace/demo side-by-side experience; only the global header copy and tool dock lose fixed positioning.
- Assumption: mobile tool navigation remains a horizontally scrollable row rather than wrapping or hiding tools.
- Assumption: “take the entire height” means `min-height: 100svh`, allowing content to exceed one viewport when required for accessibility.
- Open question to settle during browser verification: whether the desktop headline should scroll away before the internally sticky demo completes, or remain inside the bounded demo hero without becoming globally fixed. The implementation should choose the option that preserves the current demo framing while satisfying the explicit requirement that the headline is not always visible.
