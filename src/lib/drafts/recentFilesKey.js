// The localStorage key of the recent-files index (draftStore.js owns its shape:
// an array of entries with a numeric `savedAt`). Its own module so
// visitRecency.ts can read it without importing the draft store (DEBT-61).
export const RECENT_FILES_META_KEY = 'pdf-toolkit:workspace:recent-files';
