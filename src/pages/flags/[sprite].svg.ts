// MEM-42: every flag the rating boards show, as one file whose name carries a fingerprint of its bytes
// (`/flags/notes-<hash>.svg#IN`), so it is cached for a year and a browser asks once. The notes are the build's one
// read, the same every board renders, so the sprite holds exactly the flags a page can ask for. No notes, no file.
import { flagSpriteFor } from '../../site-lib/flagFiles';
import { notesFromEnv } from '../../site-lib/notesAtBuild';

export async function getStaticPaths() {
  const sprite = flagSpriteFor(await notesFromEnv());
  return sprite ? [{ params: { sprite: sprite.url.slice('/flags/'.length, -'.svg'.length) }, props: { svg: sprite.svg } }] : [];
}

export function GET({ props }: { props: { svg: string } }) {
  return new Response(props.svg, { headers: { 'Content-Type': 'image/svg+xml' } });
}
