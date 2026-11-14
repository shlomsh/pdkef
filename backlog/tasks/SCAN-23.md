---
id: "SCAN-23"
title: "Scan next: the camera never takes the same page twice"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 2
depends_on: []
---

# SCAN-23 · One page, one shot

*Opened 2026-11-04* from Shlomi's phone test: the live camera took the same page twice.

## Why

`stepCapture` (`lib/capture/captureMachine.ts`) compares a frame only with the last shot, and only while
`waitingForChange`. When the page leaves the view for `leaveMs` (800 ms: a hand moves, detection
flickers) the state goes back to `searching`, which never looks at the hash again, so the same page is
taken a second time. Earlier pages are never compared, and `averageHash` hashes the quad's bounding box
in the frame, so one page seen at another angle or distance reads as a different page.

## Outcome

- The hash is taken from the page itself, flattened through its corners (perspective-sampled cells), so
  angle and distance barely move it.
- Every page taken in this camera session is remembered; a frame that matches any of them never fires,
  whatever happened in between, and the state is `duplicate` while it is in view (the guidance of
  SCAN-24 says so). The shutter button still takes a shot on purpose.

## Acceptance

- [x] Tests: the same page lost for over a second and back is not taken again; the same page at another
      angle hashes within the change distance; a different page does not. (`captureMachine.test.ts`
      "does not take a page removed for over a second and put back again"; `hash.test.ts` "the same page
      seen another way")
- [ ] Checked on a phone.

## Phone check, 2026-11-14 (iPhone, Chrome)

Nine shots, none taken twice while a page stayed in view (the duplicate hint showed for 19 s). Retaking the same page
from a new angle or turned (the letter twice, the bill five times) was accepted every time: the page hash does not
match across angle or rotation, as SCAN-40 says of plain text. Left as is; a retake is easy to delete.
