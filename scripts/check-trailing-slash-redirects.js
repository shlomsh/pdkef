// Guards the fix for a real bug: vercel.json used to set a blanket "trailingSlash": true,
// which 308-redirected *every* extensionless path - real or nonexistent - to its
// slash-terminated form before Vercel ever checked whether the path existed. That's
// harmless for a browser (it follows the redirect to a real 404), but it means a plain
// `curl` (no -L) on a made-up path like /some-fake-path never sees a 404, only a 308 -
// which reads to a non-redirect-following agent as "this path might exist."
//
// The fix replaces the blanket setting with one explicit redirect per real route, so a
// nonexistent path has no matching redirect and falls straight through to 404.html. That
// only works if every real route actually has its entry - this script builds the list of
// real routes from the build output itself (dist/, post `npm run build`) and fails loudly
// if vercel.json's redirects don't cover one. It's the same "cross-check two lists at
// build time" pattern as content-pages' getStaticPaths check - a route that exists in one
// place and not the other is exactly the failure mode both are named to prevent.
import fs from 'fs';
import path from 'path';

const distDir = path.join(process.cwd(), 'dist');
const vercelConfigPath = path.join(process.cwd(), 'vercel.json');

if (!fs.existsSync(distDir)) {
  console.error('[ERROR] dist/ not found - run `npm run build` first.');
  process.exit(1);
}

const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
let hasError = false;
const error = (msg) => {
  console.error(`[ERROR] ${msg}`);
  hasError = true;
};

if (vercelConfig.trailingSlash === true) {
  error(
    'vercel.json sets "trailingSlash": true, which blanket-redirects every extensionless ' +
      'path (real or fake) before checking existence - this defeats the per-route redirect ' +
      "list below and brings back the agent-facing 308-before-404 bug. Remove it."
  );
}

const redirects = Array.isArray(vercelConfig.redirects) ? vercelConfig.redirects : [];
const redirectSources = new Set(redirects.map((r) => r.source));

// Routes a redirect already forwards elsewhere (a retired page superseded by a redirect,
// e.g. offline-pdf-form-filler -> install-pdf-app) don't need a self-referential slash
// redirect - they need their own non-slash source covered instead, checked separately below.
const supersededRoutes = new Set(
  redirects.filter((r) => r.source.endsWith('/')).map((r) => r.source.slice(1, -1))
);

function findRealRoutes(dir, base = '') {
  const routes = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const routePath = base ? `${base}/${entry.name}` : entry.name;
    const fullDir = path.join(dir, entry.name);
    if (fs.existsSync(path.join(fullDir, 'index.html'))) {
      routes.push(routePath);
    }
    routes.push(...findRealRoutes(fullDir, routePath));
  }
  return routes;
}

const realRoutes = findRealRoutes(distDir);

for (const route of realRoutes) {
  if (supersededRoutes.has(route)) continue;
  const nonSlashSource = `/${route}`;
  const expectedDestination = `/${route}/`;
  const entry = redirects.find((r) => r.source === nonSlashSource);
  if (!entry) {
    error(
      `Real route "${expectedDestination}" has no matching vercel.json redirect for ` +
        `"${nonSlashSource}" -> "${expectedDestination}". A visitor or agent requesting ` +
        `${nonSlashSource} (no trailing slash) will 404 instead of being canonicalized.`
    );
  } else if (entry.destination !== expectedDestination) {
    error(
      `vercel.json redirects "${nonSlashSource}" to "${entry.destination}", expected ` +
        `"${expectedDestination}".`
    );
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log(`✅ Trailing-slash redirects verified for ${realRoutes.length} real route(s).`);
}
