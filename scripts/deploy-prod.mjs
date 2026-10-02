// `npm run deploy:prod [-- --dry-run] [vercel args]` (DEBT-37): the forced production deploy used when a
// `patches/` file changes (the push-triggered deploy fails on Vercel's cached node_modules), with the commit
// passed as a build env. A push-triggered build gets VERCEL_GIT_COMMIT_SHA from Vercel; a CLI build gets none,
// so its pages would carry no stamp (DEBT-35) and its crash reports would read as unverifiable (DEBT-36).
//
// Nothing here deploys unless a person runs it; --dry-run prints the command and runs nothing.
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const COMMIT = /^[0-9a-f]{7,40}$/;

export function deployArgs({ sha, extra }) {
  if (!COMMIT.test(String(sha ?? ''))) throw new Error(`not a commit: ${JSON.stringify(sha)}`);
  return ['deploy', '--prod', '--force', '--build-env', `VERCEL_GIT_COMMIT_SHA=${sha}`, ...extra];
}

export function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  return { dryRun, extra: argv.filter((a) => a !== '--dry-run') };
}

// A stamp must name the commit the build was made from, so uncommitted changes are refused. Not being at the tip
// of origin/main is allowed (a deliberate older or branch deploy) but said out loud.
export function validateTree({ dirty, head, originMain }) {
  if (dirty) return { error: 'uncommitted changes: commit or discard them first, a stamped build must be exactly the commit it names', note: null };
  if (!originMain) return { error: null, note: 'could not read origin/main, so cannot say whether this commit is its tip' };
  if (head !== originMain) return { error: null, note: `HEAD ${head.slice(0, 8)} is not the tip of origin/main (${originMain.slice(0, 8)})` };
  return { error: null, note: null };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const { dryRun, extra } = parseArgs(process.argv.slice(2));
  const head = git('rev-parse', 'HEAD');
  let originMain = null;
  try {
    originMain = git('rev-parse', 'origin/main');
  } catch {
    // expected: no origin/main here; validateTree reports it as a note
  }
  const { error, note } = validateTree({ dirty: git('status', '--porcelain') !== '', head, originMain });
  if (error) {
    console.error(`deploy:prod: ${error}`);
    process.exit(1);
  }
  if (note) console.error(`deploy:prod: note: ${note}`);
  const args = deployArgs({ sha: head, extra });
  console.log(`vercel ${args.join(' ')}`);
  if (dryRun) return;
  process.exit(spawnSync('vercel', args, { cwd: root, stdio: 'inherit' }).status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
