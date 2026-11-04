# SCAN-36 prototype (research, not product code)

Python scripts from the classical prototype for straightening a scanned book PDF (one-bit, two-page
spreads lying sideways): `pipe.py` runs the whole chain, `common.py` loading/rendering, `lines.py` row
straightness and lean, `squeeze.py` the narrowing toward the spine, `clean.py` the text-column cleanup,
`compose.py` / `show.py` before-and-after sheets. Paths in them point at the cloud session's scratch
folder; point them at your own copy of the PDF. Findings and numbers: `docs/scan-enhance-handoff.md`.
Not for `main`; kept on this branch for reference only.
