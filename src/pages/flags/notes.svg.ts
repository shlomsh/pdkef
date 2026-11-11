// MEM-42: every flag the rating boards show, as one file (`/flags/notes.svg#IN`). The notes are the build's one read,
// the same every board renders, so this sprite holds exactly the flags a page can ask for.
import { flagSprite } from '../../site-lib/flagSprite';
import { flagCodesOf, readFlagFiles } from '../../site-lib/flagFiles';
import { notesFromEnv } from '../../site-lib/notesAtBuild';

export async function GET() {
  const body = flagSprite(readFlagFiles(flagCodesOf(await notesFromEnv())));
  return new Response(body, { headers: { 'Content-Type': 'image/svg+xml' } });
}
