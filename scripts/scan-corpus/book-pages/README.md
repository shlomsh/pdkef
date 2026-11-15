# Book pages: hand-traced outlines

`labels.json` holds Shlomi's hand-traced outlines of 22 photographed book pages (`p-000` to `p-021`), made in a local labelling page on 2026-11-15. They are the ground truth for scoring Scan's corner finders and its flattening on curved, wavy book pages. The page images are not in the repo; only these numbers are.

Each entry:

- `corners`: the four page corners, top left, top right, bottom right, bottom left, as `[x, y]` fractions of the photo (1152x1536). A corner may lie up to 0.15 past the photo when the page runs out of frame.
- `trace`: per side (top, right, bottom, left), 15 points along the paper's real edge, between that side's two corners, in the same fractions.
- `pins`: per side, the traced points placed by hand, as `{ point number: offset in pixels across the side }`. Every other traced point followed the edge by itself.
- `mids`, `bowed`: one middle point per side from the simpler modes, kept for reference.
- `mode`: `trace` for every page. `done`: true when the page was finished.
