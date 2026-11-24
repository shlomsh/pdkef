import BasePdfTool from '#shell/BasePdfTool.tsx';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import RatingPrompt from '#shell/RatingPrompt.tsx';
import MergeVerb from './verb/MergeVerb.tsx';
import { useMergeTool, type PdfMergeToolProps } from './hooks/useMergeTool.ts';
import MergeHints from './components/MergeHints.tsx';
import MergeWorkspace from './components/MergeWorkspace.tsx';

export type { FileEntry } from './lib/mergeModel.ts';

export default withIslandBoundary(function PdfMergeTool(props: PdfMergeToolProps = {}) {
  const { base, draft, hints, workspace, hasFiles, announcement, rating } = useMergeTool(props);
  const ratingPrompt = <RatingPrompt {...rating.props} />;

  return (
    <BasePdfTool {...base} empty={{ ...base.empty, art: <MergeVerb /> }}>
      {draft && <draft.Component {...draft.props} />}

      <MergeHints {...hints} />

      {hasFiles && <MergeWorkspace {...workspace} rating={ratingPrompt} />}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {rating.belowWorkspace && ratingPrompt}
    </BasePdfTool>
  );
});
