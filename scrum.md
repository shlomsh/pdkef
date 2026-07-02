# Scrum Board

## To Do

## In Progress

## Done
- Add regression test for textarea cols constraint
- Fix vertical text wrapping regression
- Refine Text Element UX & Bounds
- Fix fullscreen button behavior on iOS
- Improve Redact PDF UI spacing and layout
- Fix text element minimum size and alignment
- Fix font list dropdown positioning
- Fix text element resizing sensitivity: Replaced 1:1 raw pixel-to-point mouse delta with a proportional drag vector projection (`scale = 1 + (dx * startW + dy * startH) / (startW^2 + startH^2)`). This calculates exact corner-tracking based on the initial text bounding rect, decoupling it from the CSS grid's instant layout reflows and eliminating the hypersensitivity feedback loop.
- Write JS tests for text element padding
- Fix text element bug 1: The text element has too much room to grow on the side by default. `min-width: 0;` added to `.sign-text-input`.
- Fix text element bug 2: In Hebrew RTL, the right side is cut off. `padding: 0 4px;` added to `.sign-text-input` and `.sign-text-measure`.
- Fix signature padding bug: The `.sign-element` has a fixed `padding: 4px` in `global.css` which distorts the percentage-based aspect ratio of the signature, causing `object-fit: contain` to leave huge padding on the sides.
- **Task 3: Verify Whiteout bounds**
  - **Description**: The whiteout element (`type === 'whiteout'`) uses `inset: 0` to fill its container. Currently, it fills the padding area as well. After removing the `padding: 4px` in Task 1, verify that the whiteout rectangle still exactly matches its bounding box without any unexpected gaps.
- Fix text element bug: Text elements have too much padding and long text gets cut off instead of wrapping to allow proper multilines. (Hint: The current JS `scrollWidth` measuring with absolute `div`s is brittle. Look into modernizing it or fixing the `white-space` and `wrap` constraints in `DraggableOverlayElement.jsx` and `global.css`).
