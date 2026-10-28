import { useState, useEffect } from 'preact/hooks';
import type { SignToolType } from '#editor/model/editorModel.ts';
import type { SavedSignature } from '#editor/model/savedSignature.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import {
  getSavedSignatures,
  setSavedSignatures as persistSavedSignatures,
  subscribeToSavedSignatures,
} from '#editor/workspace/preferenceStore.ts';
import {
  activeAfterSync,
  createSavedSignature,
  fallbackActiveSignature,
  withSavedSignature,
  withoutSavedSignature,
} from '../lib/savedSignatureList.ts';

interface SavedSignaturesOptions {
  selectedTool: SignToolType | null;
  setSelectedTool: (tool: SignToolType | null) => void;
  setAnnouncement: (message: string) => void;
  messages: SignMessages;
}

/** The on-device signature library: its state, the cross-tab sync, saving and the confirmed delete. */
export function useSavedSignatures({ selectedTool, setSelectedTool, setAnnouncement, messages: t }: SavedSignaturesOptions) {
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [activeSignature, setActiveSignature] = useState<SavedSignature | null>(null);
  const [signatureToDelete, setSignatureToDelete] = useState<string | null>(null);

  // Load saved signatures from workspace preferences on mount.
  useEffect(() => {
    const stored = getSavedSignatures();
    if (stored) {
      setSavedSignatures(stored);
      if (stored.length > 0) {
        setActiveSignature(stored[0]);
      }
    }
  }, []);

  // Storage events are only delivered to the *other* same-user tabs. Local
  // interactions update state directly; these subscriptions apply the store's
  // revision-ordered last-writer-wins result everywhere else.
  useEffect(() => {
    const stops = [
      subscribeToSavedSignatures(({ value }) => {
        const next = value ?? [];
        setSavedSignatures(next);
        setActiveSignature((current) => activeAfterSync(next, current));
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  // Save new signature to list & localStorage
  const saveNewSignature = (dataUrl: string, aspectRatio: number) => {
    const newSig = createSavedSignature(dataUrl, aspectRatio);
    const updated = withSavedSignature(savedSignatures, newSig);
    setSavedSignatures(updated);
    const persisted = persistSavedSignatures(updated);
    return { signature: newSig, persisted };
  };

  // Confirm delete saved signature
  const deleteSavedSignature = (id: string, event?: Event) => {
    event?.stopPropagation();
    setSignatureToDelete(id);
  };

  const proceedDeleteSignature = () => {
    if (!signatureToDelete) return;
    const updated = withoutSavedSignature(savedSignatures, signatureToDelete);
    setSavedSignatures(updated);
    const persisted = persistSavedSignatures(updated);
    if (activeSignature && activeSignature.id === signatureToDelete) {
      const fallback = fallbackActiveSignature(updated);
      setActiveSignature(fallback);
      if (!fallback && selectedTool === 'signature') {
        setSelectedTool(null);
      }
    }
    setSignatureToDelete(null);
    setAnnouncement(persisted
      ? t.signatureDeleted
      : t.signatureDeletedNotSaved);
  };

  return {
    savedSignatures,
    activeSignature,
    setActiveSignature,
    signatureToDelete,
    cancelDelete: () => setSignatureToDelete(null),
    saveNewSignature,
    deleteSavedSignature,
    proceedDeleteSignature,
  };
}
