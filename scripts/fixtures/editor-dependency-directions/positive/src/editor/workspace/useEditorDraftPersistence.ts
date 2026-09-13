import { useMemo } from 'preact/hooks';
import { useDraftPersistence } from './useDraftPersistence.js';

export const useWorkspaceDraft = () => useMemo(useDraftPersistence, []);
