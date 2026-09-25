---
id: "SNG-12"
title: "The model step (postponed): a model the person connects reads the form, and a document that clears 90/90/85 unlocks asking its questions"
status: "open"
priority: "P3"
epic: "sign-next-gen"
phase: "later"
depends_on: ["SNG-05", "FORM-03"]
---

# SNG-12 · The model step (postponed): a model the person connects reads the form, and a document that clears 90/90/85 unlocks asking its questions

*Filed 2026-09-25, postponed by Shlomi the same day:* "postpone integration with a strong LLM model to a
future step, this is yet to be resolved how the user hooks up their own llm. once we reach high grades it
will change the UX mental model."

Until then, the editor assumes only reasonable precision and recall (`docs/sign-next-gen.md` §5.6).

**What would change.** On a document whose detection clears FORM-09's bar (90% recall, 90% precision and 85%
label association), the editor may:
- ask the form's questions in plain language (canvas row C, FORM-09);
- count fields as facts;
- name them.

Every other document keeps the tap-to-write model.

## Open when this is picked up

- **How a person connects a model while files never leave the device.** The candidates are:
  - a model running in the page;
  - a browser-provided model;
  - a local endpoint on the person's own machine.

  CSP `connect-src 'self'` rules out anything else today.
- **How the gate is judged per document at runtime**, when no ground truth exists there.

## Research snapshot, 2026-09-25 (re-check before starting)

- **Finding fields:** CommonForms and FFDNet (arXiv 2509.16506, 2025). A 6-25M parameter detector trained on 55k forms. The dataset is CC BY 4.0, the weights' licence is unresolved, no browser port exists, and it was not trained on phone photos.
- **Understanding fields** (label to field) is unsolved even in English. LiLT (MIT) is English-only. LayoutLMv3 and LayoutXLM are non-commercial. No benchmark covers Hebrew forms, and XFUND has no Hebrew or Arabic.
- **In the browser:**
  - WebGPU shipped in Safari 26.
  - Mobile Safari crashes at roughly 100-200 MB of extra allocation.
  - Chrome's built-in model (Gemini Nano) runs on desktop and Android only.
  - Apple's form detection and Vision APIs are native-only, with no web bridge.
- **Precedent:** every product that interviews or walks a person through fields does it over fields a human confirmed.

## Acceptance

- [ ] Shlomi reopens it with a resolved answer to "how does a person connect a model".
- [ ] A per-document gate on 90/90/85 is measured on the corpus before any question is asked.
