---
id: "ENC-04"
title: "Unlock sends the unlocked file back to the tool that asked"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "next"
order: 2
depends_on: ["ENC-03"]
---

# ENC-04 · Unlock sends the unlocked file back to the tool that asked

*Plan section 3.* The return half of the round trip.

## Brief
- Unlock's done state keeps Download and Share, then, when `from` is valid, one quiet verb with that tool's icon, "Continue in <Tool>", never in front of Download. It calls the return helper from ENC-02: `saveHandoff(<handoffKey>, ...)` with the person's **original** file name, then navigates to the route with `?unlocked=1` (the marker ENC-14 counts and then strips). The busy flag is `useNavigatingAway`. Without `from` the done state is unchanged and the standalone download stays `<name>_unlocked.pdf`.
- A failed save shows the line from ENC-02 and keeps Download usable.

## Acceptance
- Unit: `from=redact` offers "Continue in Redact", `from=edit-pdf` routes to `/edit-pdf/`, `from=compress-image` to `/compress-image/`, an unknown slug offers nothing. The bytes handed back equal what Download would give, and `getPermissions()` on them is `null`.
