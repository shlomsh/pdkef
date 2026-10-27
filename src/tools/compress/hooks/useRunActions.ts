import { useEffect } from 'preact/hooks';
import type { Dispatch, StateUpdater } from 'preact/hooks';
import { recordAction } from '../../../lib/actionTrail.ts';
import { reportEdit, type AnalyticsTool } from '../../../lib/productAnalytics.ts';
import type { PreparedOutput } from '../../../lib/usePreparedOutput.ts';
import type { useDownloadFlow } from '../../../shell/pageWorkspace/useDownloadFlow.ts';
import type { Level } from '../components/LevelPicker.tsx';
import type { useCompressMachine } from '../state/useCompressMachine.ts';
import type { CompressMessages } from '../messages';
import type { useComparePreviews } from './useComparePreviews.ts';
import type { CompressMeta } from './useCompressCallbacks.ts';

interface RunActionsInput {
  t: CompressMessages;
  analyticsTool: AnalyticsTool;
  kind: 'pdf' | 'image' | null;
  machine: ReturnType<typeof useCompressMachine>;
  compare: ReturnType<typeof useComparePreviews>;
  flow: ReturnType<typeof useDownloadFlow>;
  prepared: PreparedOutput<CompressMeta>;
  fresh: boolean;
  passthrough: boolean;
  retryTap: string;
  downloadUrl: string | null;
  level: Level;
  targetKB: number;
  flatten: boolean;
  setLevel: Dispatch<StateUpdater<Level>>;
  setTargetKB: Dispatch<StateUpdater<number>>;
  setFlatten: Dispatch<StateUpdater<boolean>>;
  setAnnouncement: Dispatch<StateUpdater<string>>;
}

/** The run's taps and effects: option changes, Try again, Download and Share before a build lands. */
export function useRunActions(input: RunActionsInput) {
  const { t, analyticsTool, kind, machine, compare, flow, prepared, fresh, passthrough, retryTap, downloadUrl,
    level, targetKB, flatten, setLevel, setTargetKB, setFlatten, setAnnouncement } = input;

  // An option change invalidates what a late build would land (usePreparedOutput aborts it and waits for
  // the person to go quiet); a key already built is instant. The last result stays on screen meanwhile.
  const onOptionChange = () => {
    machine.send({ type: 'optionChanged' });
    flow.reset();
    compare.resetStatus();
  };

  // Hover, focus and press warm the build; after a failure only Try again starts it.
  const warmBuild = () => {
    if (prepared.status !== 'error') prepared.prepareNow();
  };

  const handleLevelChange = (nextLevel: Level) => {
    if (nextLevel === level) return;
    setLevel(nextLevel);
    recordAction('change_setting');
    reportEdit(analyticsTool);
    onOptionChange();
  };

  const handleFlattenChange = (next: boolean) => {
    if (next === flatten) return;
    setFlatten(next);
    recordAction('change_setting');
    reportEdit(analyticsTool);
    onOptionChange();
  };

  // The quiet policy covers typing too: every keystroke is a change, and only the last one builds.
  const handleTargetKBChange = (nextTargetKB: number) => {
    const next = Number.isFinite(nextTargetKB) && nextTargetKB > 0 ? nextTargetKB : 1;
    if (next === targetKB) return;
    setTargetKB(next);
    recordAction('change_setting');
    reportEdit(analyticsTool);
    onOptionChange();
  };

  // A failed build: nothing of the last result is kept, and the taps start over.
  useEffect(() => {
    if (prepared.status !== 'error') return;
    machine.send({ type: 'buildFailed' });
    compare.clear();
    flow.reset();
  }, [prepared.status === 'error']);

  // Try again after a failed run: a tap, so the compressing look shows, and the build starts at once.
  const retry = () => {
    machine.send({ type: 'retryTapped' });
    prepared.prepareNow();
  };

  // A passthrough has nothing to deliver: a Download tapped before it landed ends with the result, undelivered.
  useEffect(() => {
    if (fresh && passthrough && flow.tap === 'processing') {
      flow.reset();
      machine.send({ type: 'retrySettled' });
    }
  }, [fresh, passthrough, flow.tap]);
  // The retried result has landed: 'processing' rendered once so BasePdfTool reported the start.
  useEffect(() => {
    if (retryTap === 'processing' && fresh) machine.send({ type: 'retrySettled' });
  }, [retryTap, fresh]);

  // A tap on Download before the build is done: show the compressing look; the shared flow delivers when it lands.
  const onDownloadClick = (event: MouseEvent) => {
    if (fresh && downloadUrl) {
      flow.onDownloadTap();
      return;
    }
    event.preventDefault();
    machine.send({ type: 'busyTapped' });
    setAnnouncement(kind === 'image' ? t.imageStarting : t.starting);
    flow.onRowPreparingTap();
  };

  const handleShare = async () => {
    // The prepared files belong to the last result; a stale one waits for the new build instead.
    if (!fresh) {
      machine.send({ type: 'busyTapped' });
      prepared.prepareNow();
      return;
    }
    await flow.handleShare();
  };

  return { warmBuild, handleLevelChange, handleFlattenChange, handleTargetKBChange, retry, onDownloadClick, handleShare };
}
