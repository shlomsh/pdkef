// Pure helpers for `npm run errors:read`: readable frame labels and the stale-tab note.
// No I/O here; git access arrives as an injected run(args) so tests use a fake.

// Mirror of the build shape in src/lib/errorReportSchema.ts (a script cannot import TS):
// a sample's `build` is /^[0-9a-f]{7}$/, the deploying commit; absent on reports from older cached tabs.
const BUILD = /^[0-9a-f]{7}$/;

// Chunk file `<module>.<8 hash chars>.js`; the module itself may contain dots.
const FRAME = /^([A-Za-z0-9_.-]+?)\.([A-Za-z0-9_-]{8})\.m?js:\d+:\d+$/;

// Module name (chunk name without its hash) -> vendor label. Extend here.
const VENDOR = new Map([
  ['pdf-lib', 'pdf-lib (vendor)'],
  ['pdf', 'pdf (vendor)'],
  ['sortable.esm', 'sortable (vendor)'],
  ['hooks.module', 'preact (vendor)'],
  ['jsxRuntime.module', 'preact (vendor)'],
  ['signals.module', 'preact (vendor)'],
  ['jsx-runtime', 'preact (vendor)'],
  ['signature_pad', 'signature_pad (vendor)'],
  ['fontkit', 'fontkit (vendor)'],
  ['bidi', 'bidi (vendor)'],
  ['createLucideIcon', 'lucide (vendor)'],
]);

// A chunk named after an astro component's script is `<Component>.astro_astro_type_script_index_N_lang`.
const sourceName = (module) => module.replace(/\.astro_astro_type_script.*$/, '');

// The tracked files that can be what a chunk is made of: under src/, minus the pages (a page
// `sign.astro` is not the chunk `sign`) and content. Keyed by basename without its last extension,
// so `FileList.module.css` is `FileList.module`. `lsFilesOutput` is `git ls-files`.
export function sourceMap(lsFilesOutput) {
  const byName = new Map();
  for (const path of String(lsFilesOutput ?? '').split('\n')) {
    if (!path.startsWith('src/') || path.startsWith('src/pages/') || path.startsWith('src/content/')) continue;
    const base = path.slice(path.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    if (dot <= 0) continue;
    const key = base.slice(0, dot);
    byName.set(key, [...(byName.get(key) ?? []), path]);
  }
  return byName;
}

// `sources` (from sourceMap) is optional: with it, a module that is no file of ours is a library
// (the lucide icon chunks, astro's `client`, the bundler runtime), whatever the vendor table says.
export function frameLabel(frame, sources) {
  const raw = String(frame ?? '');
  const m = FRAME.exec(raw.trim());
  if (!m) return { module: null, vendor: false, label: raw };
  const module = m[1];
  const known = VENDOR.get(module) ?? (module.startsWith('preact') ? 'preact (vendor)' : null);
  if (known !== null) return { module, vendor: true, label: known };
  if (sources && !sources.has(sourceName(module))) return { module, vendor: true, label: `${module} (library)` };
  return { module, vendor: false, label: module };
}

export function labelStack(stack, sources) {
  const frames = (Array.isArray(stack) ? stack : []).map((raw) => ({ raw: String(raw), ...frameLabel(raw, sources) }));
  const index = frames.findIndex((f) => f.module && !f.vendor);
  return { frames, firstOurs: index < 0 ? null : { index, module: frames[index].module } };
}

// One line saying whether the report's build predates the latest change to the first non-vendor module,
// or null (nothing extra printed) on any git failure, unknown sha or unmatched module. Never throws.
// `git merge-base --is-ancestor` answers "no" with exit status 1; any other failure (128, a timeout,
// a missing object) is not an answer, so it says nothing rather than "stale".
export function staleVerdict({ module, build, run, sources }) {
  if (!module || !BUILD.test(String(build ?? ''))) return null;
  try {
    const files = (sources ?? sourceMap(run(['ls-files']))).get(sourceName(module)) ?? [];
    if (!files.length) return null;
    run(['rev-parse', '--verify', '--quiet', `${build}^{commit}`]);
    const touch = String(run(['log', '-1', '--format=%H', 'origin/main', '--', ...files])).trim();
    if (!touch) return null;
    let current = true;
    try {
      run(['merge-base', '--is-ancestor', touch, build]);
    } catch (error) {
      if (error?.status !== 1) return null;
      current = false;
    }
    let behind = '';
    try {
      const n = String(run(['rev-list', '--count', `${build}..origin/main`])).trim();
      if (/^\d+$/.test(n)) behind = ` (${n} commits behind origin/main)`;
    } catch {}
    return current
      ? `build ${build} has the latest ${module}${behind}`
      : `likely a stale tab: ${module} changed after build ${build}${behind}`;
  } catch {
    return null;
  }
}

// Everything errors:read prints under a fingerprint row for one stored sample.
export function sampleLines(sample, run) {
  const build = BUILD.test(String(sample.build ?? '')) ? sample.build : null;
  const stack = Array.isArray(sample.stack) ? sample.stack : [];
  let sources;
  try {
    sources = sourceMap(run(['ls-files']));
  } catch {
    // expected: without git every non-table chunk is shown as ours, and no stale note is printed
  }
  const { frames, firstOurs } = labelStack(stack, sources);
  const out = [
    `    ${sample.step} · ${sample.tool} · ${sample.installed ? 'installed' : 'browser'}/${sample.sw ? 'sw' : 'no-sw'} · ${sample.age} · ${build ? `build ${build}` : 'build unknown (older tab)'}`,
    `    actions: ${Array.isArray(sample.actions) && sample.actions.length ? sample.actions.join(', ') : '(none)'}`,
  ];
  frames.forEach((f, n) => out.push(`    #${n + 1} ${f.label}  ${f.raw}`));
  out.push(firstOurs ? `    first of ours: #${firstOurs.index + 1} ${firstOurs.module}` : '    all frames are vendor code');
  if (firstOurs && build) {
    const note = staleVerdict({ module: firstOurs.module, build, run, sources });
    if (note) out.push(`    ${note}`);
  }
  out.push(`    npm run errors:resolve -- ${stack.join(' ')}${build ? ` --build ${build}` : ''}`);
  return out;
}
