import { useMemo } from 'preact/hooks';
import { useDraftPersistence } from '../../lib/drafts/useDraftPersistence.js';

export const useWorkspaceDraft = () => useMemo(useDraftPersistence, []);
