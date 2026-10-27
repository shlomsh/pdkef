import RatingPrompt, { useDownloaded } from '../../../shell/RatingPrompt.tsx';
import { englishShellMessages } from '../../../shell/shellMessages';
import { useMediaQuery } from './useMediaQuery.ts';

/** One rating ask, in the place that has room for it: two would both try to ask (RatingPrompt). */
export function useScanRating() {
  const downloaded = useDownloaded();
  const wide = useMediaQuery('(min-width: 1024px)');
  const rating = <RatingPrompt tool="scan-to-pdf" downloaded={downloaded} messages={englishShellMessages} />;
  return { rating, wide };
}
