/**
 * What the closed-cell detector rewards, as one table. Kept below the comb
 * detector's 0.8 so a comb wins a shared rectangle: a cell starts at `base`,
 * and a date or signature matched a keyword, not just geometry.
 *
 * - `base`: any cell that survived detection.
 * - `closedAt`: closure at or above this counts a cell as fully closed.
 * - `closed`: added when the cell is fully closed geometry.
 * - `labelled`: added when a label was found for the cell.
 * - `keywordKind`: added when the kind came from a keyword (anything but plain text).
 * - `cap`: the ceiling, so no cell ever reaches the comb's range.
 */
export const CELL_CONFIDENCE = Object.freeze({ base: 0.45, closedAt: 0.95, closed: 0.1, labelled: 0.1, keywordKind: 0.05, cap: 0.7 });
