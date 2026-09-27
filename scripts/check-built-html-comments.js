import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');

// A source `.astro` template that writes an HTML comment with `<!-- ... -->` ships
// that comment verbatim to every visitor: it is not a code comment, it is a string
// in the response body. The fix is an Astro JSX comment, `{/* ... */}`, which the
// compiler drops entirely and never renders. This guard reads the BUILT html so it
// catches every source that can produce a comment (`.astro` files, but also any
// content collection or template literal that assembles markup), the same way
// check-dead-utilities.js reads built output instead of scanning sources.
//
// Astro's own compiler emits exactly one comment marker today, `<!--astro:end-->`,
// inside slot `<template>` elements; that one is fine and stays allowlisted below.
// Do not add anything else to this set without checking, this guard exists so a
// stray `<!-- ... -->` cannot creep back in unnoticed.
const allowedComments = new Set([
  '<!--astro:end-->', // Astro's own slot boundary marker, emitted by the compiler itself
]);

if (!fs.existsSync(distDir)) {
  console.error(`dist directory not found: ${distDir}. Run npm run build first.`);
  process.exit(1);
}

function getHtmlFiles(dir, fileList = []) {
  for (const entry of fs.readdirSync(dir)) {
    const filePath = path.join(dir, entry);
    if (fs.statSync(filePath).isDirectory()) getHtmlFiles(filePath, fileList);
    else if (filePath.endsWith('.html')) fileList.push(filePath);
  }
  return fileList;
}

// Strip <script> and <style> element bodies before matching, so a JS or CSS string
// that happens to contain "<!--" never counts as a rendered HTML comment.
function stripScriptAndStyleBodies(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, () => '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, () => '');
}

const htmlFiles = getHtmlFiles(distDir);
const offenders = [];
let totalComments = 0;

for (const filePath of htmlFiles) {
  const html = fs.readFileSync(filePath, 'utf8');
  const markup = stripScriptAndStyleBodies(html);
  const comments = [...markup.matchAll(/<!--[\s\S]*?-->/g)].map(([comment]) => comment);
  const disallowed = comments.filter((comment) => !allowedComments.has(comment));

  totalComments += comments.length;
  if (disallowed.length > 0) {
    offenders.push({ file: path.relative(distDir, filePath), comments: disallowed });
  }
}

if (offenders.length > 0) {
  console.error('Built pages contain HTML comments that ship to visitors verbatim:');
  for (const { file, comments } of offenders) {
    console.error(`  ${file}`);
    for (const comment of comments) {
      console.error(`    ${comment.slice(0, 80)}`);
    }
  }
  console.error('Fix: turn each one into an Astro JSX comment, {/* ... */}, in the source template. Astro drops those entirely, so they never render.');
  process.exit(1);
}

console.log(`No stray HTML comments in built pages (${htmlFiles.length} files checked, ${totalComments} Astro marker comment(s) allowed).`);
