// The export's text shaper: fontkit's core with only the formats and shapers our fonts use (71 KB brotli
// against 137 KB for the full package). A new script registers its shaper here, or fontkit silently falls
// back to its default one; the script's shaping guard bundles this file and fails.
import { create, registerFormat, registerShaper } from 'fontkit/core';
import { TTFFont } from 'fontkit/formats/TTFFont';
import { ArabicShaper } from 'fontkit/shapers/ArabicShaper';
import { HangulShaper } from 'fontkit/shapers/HangulShaper';
import { HebrewShaper } from 'fontkit/shapers/HebrewShaper';
import { IndicShaper } from 'fontkit/shapers/IndicShaper';
import { ThaiShaper } from 'fontkit/shapers/ThaiShaper';

registerFormat(TTFFont);
for (const shaper of [ArabicShaper, HangulShaper, HebrewShaper, IndicShaper, ThaiShaper]) registerShaper(shaper);

export { create };
