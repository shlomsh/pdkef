import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { SavedSignature } from '../../editor/model/savedSignature.ts';

// The saved-signature library: the list, which one is active, and the setters
// that change either. Read directly by both SignToolbar (the signature picker)
// and PdfWorkspace (activeSignature drives the click-to-place gesture), so
// PdfWorkspace no longer needs to receive these four just to re-forward three
// of them to SignToolbar untouched - the pattern already proven for
// ToolShellContext (see E8.B3). The default value keeps a consumer renderable
// in isolation (a unit test mounting just the toolbar) instead of throwing.
export interface SavedSignaturesContextValue {
  savedSignatures: SavedSignature[];
  activeSignature: SavedSignature | null;
  setActiveSignature: (signature: SavedSignature | null) => void;
  onDeleteSavedSignature: (id: string, event?: Event) => void;
}

export const SavedSignaturesContext = createContext<SavedSignaturesContextValue>({
  savedSignatures: [],
  activeSignature: null,
  setActiveSignature: () => {},
  onDeleteSavedSignature: () => {}
});

export function useSavedSignatures() {
  return useContext(SavedSignaturesContext);
}
