import { useCallback } from 'preact/hooks';
import { recordAction } from '../actionTrail.ts';
import type { PlanEntry } from '../pagePlan.ts';
import { reportEdit, type AnalyticsTool } from '../productAnalytics.ts';
import { useEditHistory } from './useEditHistory.js';
import { useHistoryShortcuts } from './useHistoryShortcuts.js';

// The page tools' Undo/Redo over one document with a `plan`, shared by Merge and
// Edit Pages: the plan-change wrapper the page grid calls (one history step per
// call, none when the plan comes back unchanged), the Undo and Redo handlers
// with their announcements and trail entries, and the Cmd/Ctrl+Z binding. The
// rest of the document is the tool's own.

interface DocumentHistoryOptions {
  tool: AnalyticsTool;
  announce: (message: string) => void;
  messages: { undone: string; redone: string };
}

export function useDocumentHistory<D extends { plan: PlanEntry[] }>(
  initial: D,
  { tool, announce, messages }: DocumentHistoryOptions,
) {
  const { present, canUndo, canRedo, commit, undo, redo, amend, reset } = useEditHistory(initial);

  const onPlanChange = useCallback((update: (current: PlanEntry[]) => PlanEntry[], options?: { merge?: boolean }) => {
    commit((current: D) => {
      const next = update(current.plan);
      return next === current.plan ? current : { ...current, plan: next };
    }, options);
    reportEdit(tool);
  }, [commit, tool]);

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    undo();
    recordAction('undo');
    announce(messages.undone);
  }, [undo, canUndo, announce, messages.undone]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    redo();
    recordAction('redo');
    announce(messages.redone);
  }, [redo, canRedo, announce, messages.redone]);

  useHistoryShortcuts(handleUndo, handleRedo);

  return { present: present as D, canUndo: canUndo as boolean, canRedo: canRedo as boolean, commit, amend, reset, onPlanChange, handleUndo, handleRedo };
}
