import type { ComponentChildren } from 'preact';
import type { RedactState } from '../state/redactState.ts';
import type { RedactFinishState } from '../hooks/useRedactFinish.ts';
import type { RedactDetails } from '../hooks/useRedactDetails.ts';
import type useRedactExport from '../hooks/useRedactExport.ts';
import { changesPieces, detailsSummary } from '../lib/details/describeDetails.ts';
import { DetailsFooter } from './details/DetailsFooter.tsx';
import RedactFinish from './RedactFinish.tsx';
import SavedFileCheck from './SavedFileCheck.tsx';
import ErrorMessage from '../../../shell/ErrorMessage.tsx';
import { englishRedactMessages as t } from '../messages.ts';

/** Under the pages: the document details footer and the one finish row with the export error and saved-file check. */
export default function RedactFinishRegion({ state, exp, finish, details, rating }: {
  state: RedactState;
  exp: ReturnType<typeof useRedactExport>;
  finish: RedactFinishState;
  details: RedactDetails;
  rating: ComponentChildren;
}) {
  const { rows, savedCheck } = details;
  const { errorDetail } = state.document;
  return (
    <>
      <DetailsFooter summary={detailsSummary(rows, state.edits.details)} onReview={details.openDetails} reading={details.traces === null} />

      {/* RED-36: the one finish row - what will be saved, Download (with
          its progress while saving), what was saved, then Compress it and
          Sign it. The export error and the saved-file check sit under it,
          where the result is. */}
      <RedactFinish
        facts={finish.finishFacts}
        canShare={exp.canSharePdf}
        shareReady={exp.shareReady}
        onDownload={exp.handleDownloadPdf}
        onPrepareShare={() => exp.handleSavePdf('share')}
        onShare={exp.handleSharePdf}
        onHandoff={(tool) => { void exp.requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}
        handoffBusy={exp.handoffBusy}
        handoffFailed={state.finish.handoffFailed}
        rating={finish.showStrip ? null : rating}
      >
        {/* Export error - recoverable, so it renders alongside the still-mounted
            workspace instead of replacing it (see handleSavePdf's catch). */}
        {errorDetail && (
          <ErrorMessage title={t.downloadStopped} fullWidth>
            {errorDetail}
          </ErrorMessage>
        )}
        <SavedFileCheck state={savedCheck.state} onSearch={savedCheck.search} onCover={details.coverFromCheck} onRemove={details.removeFromCheck} removing={state.finish.removing} note={state.finish.removedNote} detailsChanged={changesPieces(rows, state.edits.details)} detailsSurvived={savedCheck.detailsSurvived} onReviewDetails={details.openDetails} />
      </RedactFinish>
    </>
  );
}
