import { useCallback, useMemo } from 'preact/hooks';
import { turnGeometry, turnsOf, type PageTurns } from '#editor/geometry/pageTurn.ts';
import { createPageGeometry, type PageGeometry } from '#editor/geometry/coords.ts';
import { PAGE_WIDTH_DEFAULT_PTS, PAGE_HEIGHT_DEFAULT_PTS } from '#editor/model/signGeometry.js';
import type { SignMessages } from '#editor/registry/messages.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { turnRegions } from '../lib/turnRegions.ts';
import type { FormFieldRegions } from './useFormFieldRegions.ts';
import type { SignToolAction } from '../components/SignToolContext.tsx';

const DEFAULT_PAGE_GEOMETRY = createPageGeometry({
  cropBox: { x: 0, y: 0, width: PAGE_WIDTH_DEFAULT_PTS, height: PAGE_HEIGHT_DEFAULT_PTS },
});

/**
 * SIGN-43: where a person's page turns meet the file's own geometry and detected
 * fields. The workspace works in the returned displayed pages and regions only
 * (with their lookups), and `rotateProps` is the page header's Rotate: one
 * undoable clockwise quarter turn, carrying the page's displayed geometry so
 * undo can restore it. No telemetry: recordAction takes only names off
 * errorReportSchema's closed list.
 */
export function useTurnedPages({ filePageSizes, fileFormRegions, pageTurns, dispatch, announce, t }: {
  filePageSizes: PageGeometry[];
  fileFormRegions: FormFieldRegions;
  pageTurns: PageTurns;
  dispatch: (action: SignToolAction) => void;
  announce: (message: string) => void;
  t: SignMessages;
}) {
  const pageSizes = useMemo(
    () => filePageSizes.map((geometry, pageIndex) => turnGeometry(geometry, turnsOf(pageTurns, pageIndex))),
    [filePageSizes, pageTurns],
  );
  const formRegions = useMemo(() => turnRegions(fileFormRegions, pageTurns), [fileFormRegions, pageTurns]);
  const pageSizeOf = useCallback(
    (pageIndex: number): PageGeometry => pageSizes[pageIndex] || DEFAULT_PAGE_GEOMETRY,
    [pageSizes],
  );
  const directionOfPage = useCallback(
    (pageIndex: number) => formRegions.pageDirections?.[pageIndex] ?? 'ltr',
    [formRegions],
  );
  const rotatePage = useCallback((pageIndex: number) => {
    dispatch({
      type: 'ROTATE_PAGE',
      payload: {
        pageIndex,
        geometry: pageSizeOf(pageIndex),
        description: formatMessage(t.rotatePageDescription, { number: pageIndex + 1 }),
      },
    });
    announce(formatMessage(t.rotatedPageAnnouncementTemplate, { number: pageIndex + 1 }));
  }, [dispatch, pageSizeOf, announce, t]);
  const rotateProps = (pageIndex: number) => ({
    onRotate: () => rotatePage(pageIndex),
    rotateLabel: t.rotatePageLabel,
    rotateTitle: formatMessage(t.rotatePageTitle, { number: pageIndex + 1 }),
  });
  return { pageSizes, formRegions, pageSizeOf, directionOfPage, rotateProps };
}
