/**
 * The `/PDkef` marked-content sequence being read (RED-55), shared with nested Forms: what a mark
 * draws, wherever it draws it, folds into one box and one unit. `owner` is the stream (formPath
 * key) that opened it: only that stream's BMC/BDC/EMC count its depth.
 */
export const closedMark = () => ({
  open: false, owner: '', depth: 0, start: 0, min: null, max: null, imageRefs: new Set(), units: [], drawsForm: false,
});

/** Grows the open mark's box to hold `box`. */
export function foldIntoMark(mark, box) {
  if (!mark.min) {
    mark.min = [box.x, box.y];
    mark.max = [box.x + box.width, box.y + box.height];
    return;
  }
  mark.min[0] = Math.min(mark.min[0], box.x);
  mark.min[1] = Math.min(mark.min[1], box.y);
  mark.max[0] = Math.max(mark.max[0], box.x + box.width);
  mark.max[1] = Math.max(mark.max[1], box.y + box.height);
}
