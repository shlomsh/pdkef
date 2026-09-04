---
id: "DEMO-02"
title: "The hero demo: fill and sign a form from a chat, and blur what's private before sending it"
status: "done"
priority: "P1"
epic: "landing-story-demo"
phase: "near-term"
depends_on: ["DEMO-01"]
legacy_state: "Open"
---

# DEMO-02 · The hero demo: fill and sign a form from a chat, and blur what's private before sending it

## Scope and acceptance

**The site explains what it does and never shows it.** The home page opens with a headline, three pills and a dropzone. Two thirty-second stories would sell this product better than any of that copy, and neither is told anywhere.

**Who this is for, and it constrains every word.** People who are not technical at all, on a phone, dealing with paperwork that arrived in a chat. A parent with a school consent form, a patient with a medical form, anyone sending a document to an office. They are not evaluating software and they will never read an explanation of how it works. They have one instinct, and it is a good one: *I don't want to send my kid's medical form to a website I've never heard of.*

**Story one, fill and sign. This one goes first and earns the most scroll length.** The complete errand, not a fragment of it: a message arrives from the child's teacher with the school trip consent form attached. You tap the file and it opens right there. You type the child's name and class, tick the permission and photo-consent boxes, sign it with your finger, and send it back to the same chat. No printer, no scanner, nothing installed.

**Show all three element types, because that is the part nobody believes until they see it.** Text, check marks and a signature. Two details matter here. First, one text field in Hebrew and one in English: multi-script support is a genuine differentiator this product has spent real effort on, and a filled form is the only place it shows without being explained. Second, the "checkbox" is honest: `src/editor/registry/symbol.ts` supports `check` and `x` marks, so ticking a box means placing a check symbol on it. That is the real workflow and it looks identical to the user, so depict it as it works.

**Story two, blur before you send. Shorter, and second.** An email asks you to send a document as evidence. It has an ID number and an account line on it that the person asking does not need. You blur those, then send the reply. The surrounding UI here is an inbox rather than a chat thread: the two stories arrive through different doors on purpose, because that is how they actually reach people.

Both stories are mobile, both end in the chat they came from, and both are true today except for the entry path (DEMO-03).

**Decided: scroll-driven, not auto-playing, and this ticket now absorbs the scroll mechanic from DEMO-05.** The visitor's scroll is what fills the form in. They scroll, and fields get typed into, boxes get ticked, the signature draws itself, and it sends. Sign first, blur second, each on its own sticky track.

An earlier draft had two eight-second loops side by side. Scroll-driven beats it for one reason: a loop plays whether or not anyone is watching and finishes whether or not anyone cares, while a scroll-driven fill only advances because the visitor chose to advance it, which makes them feel like they did it rather than like they watched an advert. Scrubbing backwards must work, so scrolling up un-fills the form. That reversibility is what makes the mechanic legible rather than magic.

Mechanically this is DEMO-05's pattern: `position: sticky` panels in a taller track, `100svh` and never `100vh`, no `scroll-snap`, progress computed in a `requestAnimationFrame`-throttled scroll listener and mapped to stages. DEMO-05's placement decision and its `overflow-hidden` warning both apply directly and are not repeated here.

**Use the word "blur."** Not "redact", not "black out". Redact is a lawyer's word and nobody searches for it. Blur is the term that drives traffic here, it already carries 21 mentions in `src/data/tools.js` and its own content page at `blur-vs-blackout-vs-delete-pdf`, and it appears exactly **once** on the home page. See DEMO-07.

**How privacy gets said.** "Your document stays on your phone." That is the whole claim, at that altitude. No bytes, no requests, no network, no policy strings, no architecture. See DEMO-04 for what replaced the technical version of this.

**Constraints that are not negotiable.** The SEO surface stays server-rendered and zero-JS (Part II §1.1), so the demo is an island and the marketing copy around it is not. The content must be complete and readable with JavaScript disabled and under `prefers-reduced-motion: reduce`, degrading to a finished still rather than an empty frame. No third-party logo, wordmark or trademark may be drawn. `check-page-weight.js` has a document-plus-eager-JS budget and an image budget: prefer inline SVG and CSS animation over any raster asset, and if the demo needs to be lazy, make it lazy rather than raising a budget.

**Acceptance.** Both stories are legible at 390px, which is the width that matters. Readable with JS off and under reduced motion. No new CSP violation (`npm run build && npm run preview`, per Part II §5). Page-weight and CSS guards pass. Lighthouse Performance and SEO stay at or above 95.

## Remaining after the story rewrite

The product owner redirected both stories on 2026-09-04 (English sign story running from the chat
message through to the share sheet, a real `filter: blur()` plus blackout, whiteout and delete in
story two, a title that carries the errand instead of describing the scroll mechanic, and Sea Glass
confirmed as the register). That work is in flight. What is still open once it lands:

1. **End-to-end acceptance, which has never been run in one pass.** 390px, JavaScript disabled,
   `prefers-reduced-motion: reduce`, a real `npm run build && npm run preview` CSP check, page weight
   and the CSS guards. Individual pieces have been checked at various points, but not the whole set
   against one build.
2. **The progress indicator DEMO-05 specified and nobody built.** That ticket asked for a persistent
   minimal indicator so a visitor can see how many panels there are and that the sequence ends, and it
   was closed without one. A scroll-driven deck that gives no sense of its own length is a real
   usability gap, not a decoration: the visitor cannot tell whether they are two panels into two or
   two into ten. Small, and worth doing.
3. **The multi-script showcase is gone.** Story one was Hebrew and is now English by the owner's
   decision. That was the only place on the site where multi-script support was visible without being
   explained, against a great deal of real effort in the export path. If it comes back it should be a
   small third beat, not a return to Hebrew as the main story.

## What landed

The demo is built, placed, and verified end to end. Commits d3a4ff8, cb46b04, 6a71f4d, 5d73b06,
51f4c90, 8e7671a and 87917f4.

Both stories work as specified. Story one runs the whole errand: a permission slip arrives in a chat,
opens, four blanks fill, two boxes tick, a signature draws, a share sheet carries the signed file out,
and it lands back in the thread. Story two applies four visibly different tools to a utility bill, with
a chip naming each one as it fires.

**Five corrections from the product owner shaped it more than the original ticket did**, and each one
came from the same principle, which is now the thing to remember rather than the individual fixes:
**a PDF page cannot reflow, so a demo of a PDF editor must not either.** PDkef renders the page and
places absolutely positioned elements on top of it. Anything in the demo that moves the page underneath
is depicting behaviour the product does not have.

1. The printed sentence reflowed as values typed into it. Now the printed layer is present in full from
   the first frame and every value is an overlay that takes part in no layout.
2. Delete closed the gap it left. It now vacates in place; the row below measures identically at both
   ends of the beat.
3. The form asked the parent for the trip's destination and hours, which a school prints before the form
   goes out. The printed and parent-filled halves are now inverted, with the field set taken from real
   permission slips rather than invented.
4. The filled answers rendered at weight 600 against printed text at 400, making the parent's handwriting
   the boldest thing on the page. Both now compute to 13.12px w400, sitting on their rules rather than
   floating above them.
5. There was no pause between the section title and the first animation, and the caption scrolled away
   exactly when it became useful. The captions now pin with the panels they describe and the hero is a
   title card with a screen of its own.

The lesson underneath all five: **the demo is judged as the product, not as an illustration of it.**
Every one of these was invisible in a code review and obvious to someone who has actually filled in a
form.

Verified in one pass rather than piecemeal: 390px, JavaScript disabled, `prefers-reduced-motion: reduce`,
a real build-and-preview CSP check, and the four Playwright guards in `e2e/demo/`, plus 1917 unit tests,
CSS duplication, SEO across 23 pages and page weight.

**Not carried forward:** story one is English, so the multi-script support the export path has had so
much work put into is no longer visible anywhere on the site without being explained. That was the
owner's call. If it returns it should be a small third beat, not a return to Hebrew as the main story.
