---
id: "DEMO-02"
title: "The hero demo: fill and sign a form from a chat, and blur what's private before sending it"
status: "open"
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

**Story one, fill and sign.** A form arrives in WhatsApp. You fill it in, sign it with your finger, and send it straight back to the same chat. No printer, no scanner, nothing to install.

**Story two, blur before you send.** A medical or financial document has an ID number, a diagnosis or a bank line on it that the person asking does not need. You blur that part, then send it.

Both stories are mobile, both end in the chat they came from, and both are true today except for the entry path (DEMO-03).

**Decided: two short demos side by side, not one long sequence.** Each story runs as its own independent loop of roughly eight seconds, side by side on desktop and stacked on mobile, each with its own one-line caption. A single sequence telling both stories would run past twenty seconds, and the second story would be the half nobody waits for, which is the half that carries the search traffic. Two short loops also let each caption name its own use case, so the blur story gets a headline of its own rather than being a beat inside a signing story.

**Use the word "blur."** Not "redact", not "black out". Redact is a lawyer's word and nobody searches for it. Blur is the term that drives traffic here, it already carries 21 mentions in `src/data/tools.js` and its own content page at `blur-vs-blackout-vs-delete-pdf`, and it appears exactly **once** on the home page. See DEMO-07.

**How privacy gets said.** "Your document stays on your phone." That is the whole claim, at that altitude. No bytes, no requests, no network, no policy strings, no architecture. See DEMO-04 for what replaced the technical version of this.

**Constraints that are not negotiable.** The SEO surface stays server-rendered and zero-JS (Part II §1.1), so the demo is an island and the marketing copy around it is not. The content must be complete and readable with JavaScript disabled and under `prefers-reduced-motion: reduce`, degrading to a finished still rather than an empty frame. No third-party logo, wordmark or trademark may be drawn. `check-page-weight.js` has a document-plus-eager-JS budget and an image budget: prefer inline SVG and CSS animation over any raster asset, and if the demo needs to be lazy, make it lazy rather than raising a budget.

**Acceptance.** Both stories are legible at 390px, which is the width that matters. Readable with JS off and under reduced motion. No new CSP violation (`npm run build && npm run preview`, per Part II §5). Page-weight and CSS guards pass. Lighthouse Performance and SEO stay at or above 95.
