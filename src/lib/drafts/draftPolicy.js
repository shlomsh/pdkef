// Workspace retention policy for every persisted editor draft. Keep the timestamp
// calculation and expiry check together so a policy change applies to drafts
// created by older versions too: only `savedAt` is persisted, never a frozen
// `expiresAt` value.

export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Stamp a newly persisted draft. This is intentionally the sole write-side
 * timestamp helper, shared by the draft store and its display metadata.
 */
export function createDraftRetention(now = Date.now()) {
  return { savedAt: now };
}

/**
 * Derive the current policy's expiry for a saved timestamp. This is not stored
 * so increasing or decreasing MAX_AGE_MS in a future release takes effect on
 * existing drafts immediately.
 */
export function getDraftExpiry(savedAt) {
  return Number.isFinite(savedAt) ? savedAt + MAX_AGE_MS : NaN;
}

export function isDraftExpired(savedAt, now = Date.now()) {
  const expiresAt = getDraftExpiry(savedAt);
  return !Number.isFinite(expiresAt) || now >= expiresAt;
}
