import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DRAFT_STORE_PATH = 'src/editor/workspace/draftStore.js';
const SERVICE_WORKER_PATH = 'public/sw.js';

const draftStoreSource = fs.readFileSync(path.join(process.cwd(), DRAFT_STORE_PATH), 'utf8');
const workerSource = fs.readFileSync(path.join(process.cwd(), SERVICE_WORKER_PATH), 'utf8');

/**
 * public/sw.js is a classic (non-module) service worker - see its own "Web
 * Share Target" header comment - so it cannot `import` draftStore.js and
 * instead hand-copies four values that define the shared IndexedDB handoff
 * record: the DB name, the store name, the initial DB version, and the
 * `handoff:<tool>` key format. sw.js's comment says these must be kept in
 * sync; a comment is not a guard (CLAUDE.md Part II section 6: invariants are
 * CI, not prose).
 *
 * The failure this prevents is silent and reaches a real person. Bump
 * The workspace deliberately has no database migration path: ordinary record
 * fields do not change the object store. The worker still has to open the
 * same initial version as the app, or a file shared from a phone lands in a
 * different local store and the Sign tool finds it empty.
 *
 * Both files are read here as plain text and compared with regexes, never
 * imported, because the whole point of the coupling is that sw.js cannot be
 * imported into the module graph. This follows serviceWorker.test.js's own
 * approach (it reads public/sw.js as text for the same reason) rather than
 * inventing a second pattern.
 */

function extractConst(source, filePath, pattern, label) {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(
      `Could not find ${label} in ${filePath} using ${pattern}. Either the declaration ` +
        'was reformatted in a way this extraction regex does not expect (update the ' +
        'pattern in draftStoreServiceWorkerSync.test.js), or it was removed (check ' +
        'whether the sync invariant this test guards still applies).',
    );
  }
  return match[1];
}

function checkConstantsMatch({ label, draftStoreName, draftStorePattern, workerName, workerPattern }) {
  it(`keeps ${label} in sync between draftStore.js and sw.js`, () => {
    const draftStoreValue = extractConst(draftStoreSource, DRAFT_STORE_PATH, draftStorePattern, draftStoreName);
    const workerValue = extractConst(workerSource, SERVICE_WORKER_PATH, workerPattern, workerName);

    expect(
      workerValue,
      `${DRAFT_STORE_PATH}'s ${draftStoreName} is '${draftStoreValue}' but ` +
        `${SERVICE_WORKER_PATH}'s ${workerName} is '${workerValue}'. sw.js is a classic ` +
        `script and cannot import draftStore.js (see its Web Share Target comment), so ` +
        `hand-update ${workerName} in ${SERVICE_WORKER_PATH} to '${draftStoreValue}' to ` +
        `match ${draftStoreName} in ${DRAFT_STORE_PATH}. A mismatch here means a file ` +
        'shared from a phone lands in an IndexedDB store the Sign tool restore path ' +
        'can no longer find, with no thrown error.',
    ).toBe(draftStoreValue);
  });
}

describe('draftStore.js and sw.js agree on the shared IndexedDB handoff schema', () => {
  checkConstantsMatch({
    label: 'the drafts DB name',
    draftStoreName: 'DB_NAME',
    draftStorePattern: /const DB_NAME = '([^']+)';/,
    workerName: 'DRAFTS_DB_NAME',
    workerPattern: /const DRAFTS_DB_NAME = '([^']+)';/,
  });

  checkConstantsMatch({
    label: 'the drafts store name',
    draftStoreName: 'STORE_NAME',
    draftStorePattern: /const STORE_NAME = '([^']+)';/,
    workerName: 'DRAFTS_STORE_NAME',
    workerPattern: /const DRAFTS_STORE_NAME = '([^']+)';/,
  });

  checkConstantsMatch({
    label: 'the workspace DB initial version',
    draftStoreName: 'DB_VERSION',
    draftStorePattern: /const DB_VERSION = (\d+);/,
    workerName: 'DRAFTS_DB_VERSION',
    workerPattern: /const DRAFTS_DB_VERSION = (\d+);/,
  });

  it('keeps the handoff key format identical between draftStore.js and sw.js', () => {
    // sw.js's own comment says this is "the same expression, retyped" rather
    // than a differently-named constant, so both sides are held to the exact
    // same template literal text (a real IndexedDB key, not just its shape).
    const pattern = /const handoffKey = \(tool\) => `([^`]*)`;/;
    const draftStoreValue = extractConst(draftStoreSource, DRAFT_STORE_PATH, pattern, 'handoffKey');
    const workerValue = extractConst(workerSource, SERVICE_WORKER_PATH, pattern, 'handoffKey');

    expect(
      workerValue,
      `${DRAFT_STORE_PATH}'s handoffKey builds keys as \`${draftStoreValue}\` but ` +
        `${SERVICE_WORKER_PATH}'s handoffKey (retyped, since sw.js cannot import ` +
        `draftStore.js) builds \`${workerValue}\`. Update the template literal in ` +
        `${SERVICE_WORKER_PATH}'s handoffKey to \`${draftStoreValue}\` so a shared file ` +
        "is written under the exact key the Sign tool's takeHandoff('sign') reads.",
    ).toBe(draftStoreValue);
  });
});
