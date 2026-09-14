import { useState } from 'preact/hooks';
import { saveDraft } from './draftStore.js';

export const useDraftPersistence = () => {
  useState();
  return saveDraft;
};
