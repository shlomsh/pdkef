import { useMemo } from 'preact/hooks';
import { useDraftPersistence } from '../../components/SignTool/useDraftPersistence.js';

export const useWorkspaceDraft = () => useMemo(useDraftPersistence, []);
