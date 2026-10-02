---
id: "ENC-04"
title: "Unlock sends the unlocked file back to the tool that asked"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 4
depends_on: ["ENC-03"]
---

# ENC-04 · Unlock sends the unlocked file back to the tool that asked

*Plan section 3.* The return half of the round trip.

## Brief
- When Unlock finishes and `from` is valid, write the result into the shared memory space as that tool's current file: `cacheRecentFile(<handoffKey>, {fileName: '<name>_unlocked.pdf', fileType: 'application/pdf', fileBytes})` (`draftStore.js:427-470`: it creates an entry keyed by the unlocked bytes and sets the tool's pointer; nothing else is replaced). That is what makes a crash, a reload or Back between Unlock finishing and the tap resume with the unlocked file: Redact's `onRestore` loads the entry (`loadDraft` returns an entry with no work on it).
- The done state keeps Download and Share, then one quiet verb with that tool's icon, "Continue in <Tool>", never in front of Download. It only navigates, to the route from the ENC-02 map with `?unlocked=1` (the marker ENC-14 counts, then strips). The busy flag is `useNavigatingAway`. No return hand-off record.
- Without `from`, the done state is unchanged. The name is `<name>_unlocked.pdf` either way; the original is never modified, replaced or stored.
- Exception: `from=merge`. Merge's entries are keyed by a set of files, so writing one file there would replace the set the person has open. Merge keeps a short-lived hand-off for its return (ENC-13).
- If the memory-space write fails (storage blocked or full), keep Download usable and offer Continue through a hand-off instead; say nothing alarming.

## Acceptance
- Unit: after Unlock finishes with `from=redact`, `loadDraft('redact')` returns the unlocked file named `<name>_unlocked.pdf` and the previous entry is untouched; `from=edit-pdf` and `from=compress-image` use their keys and routes; an unknown slug offers nothing. The saved bytes equal what Download gives, and `getPermissions()` on them is `null`.
- Reviewed at 1280 and 375: the Continue verb is quiet and the Download path is unchanged.
