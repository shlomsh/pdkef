---
id: "DEMO-02"
title: "The hero demo: fill and sign a form from a chat, and blur what's private before sending it"
status: "in_progress"
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
