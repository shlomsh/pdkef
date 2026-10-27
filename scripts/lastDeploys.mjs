/**
 * The last two distinct, successful Production deploys (MEM-21).
 *
 * node scripts/lastDeploys.mjs <owner/repo>  prints before=<sha> and after=<sha>
 * for $GITHUB_OUTPUT. pickLastTwo is pure; the CLI only talks to `gh api`.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// deployments: newest first, each { id, sha }. latestStateById: id -> state of
// its newest status. Keeps successes, one per sha (a redeploy repeats a sha).
export function pickLastTwo(deployments, latestStateById) {
  const shas = [];
  for (const d of deployments) {
    if (latestStateById[d.id] === 'success' && !shas.includes(d.sha)) shas.push(d.sha);
    if (shas.length === 2) return { before: shas[1], after: shas[0] };
  }
  return null;
}

const gh = (route) => JSON.parse(execFileSync('gh', ['api', route], { encoding: 'utf8' }));

function main(repo) {
  if (!repo) {
    console.error('usage: node scripts/lastDeploys.mjs <owner/repo>');
    process.exit(2);
  }
  const deployments = gh(`repos/${repo}/deployments?environment=Production&per_page=30`);
  const states = {};
  let picked = null;
  for (let i = 0; i < deployments.length && !picked; i++) {
    const d = deployments[i];
    states[d.id] = gh(`repos/${repo}/deployments/${d.id}/statuses?per_page=1`)[0]?.state;
    picked = pickLastTwo(deployments.slice(0, i + 1), states);
  }
  if (!picked) {
    console.error(`Fewer than two distinct successful Production deploys among the last ${deployments.length}`);
    process.exit(1);
  }
  console.log(`before=${picked.before}\nafter=${picked.after}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv[2]);
