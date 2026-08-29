import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const distDir = path.join(process.cwd(), 'dist');

function getHtmlFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getHtmlFiles(filePath, fileList);
    } else if (filePath.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const htmlFiles = getHtmlFiles(distDir);
let hasError = false;
const pagesByCanonical = new Map();
const alternateLinks = [];

for (const file of htmlFiles) {
  const relPath = path.relative(process.cwd(), file);
  if (relPath.includes('404') || relPath.includes('google2c4730f55b90649a')) continue;

  const content = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(content);
  const document = dom.window.document;

  const error = (msg) => {
    console.error(`[ERROR] ${relPath}: ${msg}`);
    hasError = true;
  };

  // 1. Exactly one <h1>
  const h1s = document.querySelectorAll('h1');
  if (h1s.length !== 1) {
    error(`Expected exactly 1 <h1>, found ${h1s.length}`);
  }

  // 2. <title>, meta description, canonical
  if (!document.querySelector('title')) error(`Missing <title>`);
  if (!document.querySelector('meta[name="description"]')) error(`Missing meta description`);
  if (!document.querySelector('link[rel="canonical"]')) error(`Missing canonical link`);
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  if (canonical) pagesByCanonical.set(canonical, { relPath, document });

  const html = document.documentElement;
  const isLocalizedDocumentation = /^dist\/[a-z]{2,3}(?:-[A-Za-z0-9]+)?\//.test(relPath);
  if (isLocalizedDocumentation) {
    if (!html.getAttribute('lang')) error('Localized documentation is missing html lang');
    if (!['ltr', 'rtl'].includes(html.getAttribute('dir') || 'ltr')) error('html dir must be ltr or rtl');
  }

  const isNoindex = Boolean(document.querySelector('meta[name="robots"][content*="noindex"]'));
  const alternates = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'));
  if (isNoindex && alternates.length > 0) {
    error('Noindex preview page must not advertise hreflang alternates');
  }
  alternates.forEach((link) => {
    alternateLinks.push({
      relPath,
      canonical,
      hreflang: link.getAttribute('hreflang'),
      href: link.href,
    });
  });

  // 3. OG/Twitter present
  const ogTags = ['og:title', 'og:description', 'og:url', 'og:type'];
  for (const og of ogTags) {
    if (!document.querySelector(`meta[property="${og}"]`)) error(`Missing ${og}`);
  }
  const twitterTags = ['twitter:card', 'twitter:title', 'twitter:description'];
  for (const tw of twitterTags) {
    if (!document.querySelector(`meta[name="${tw}"]`)) error(`Missing ${tw}`);
  }

  // 4. JSON-LD
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  let hasSoftwareApp = false;
  let faqSchema = null;

  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent);
      if (data['@type'] === 'SoftwareApplication') hasSoftwareApp = true;
      if (data['@type'] === 'FAQPage') faqSchema = data;
    } catch (e) {
      error(`Invalid JSON-LD syntax: ${e.message}`);
    }
  }

  // 5. SoftwareApplication schema is expected on all main pages except licenses
  if (!hasSoftwareApp && !relPath.includes('licenses')) {
    error(`Missing SoftwareApplication JSON-LD`);
  }

  // 6. FAQ schema matches on-page FAQ
  if (faqSchema) {
    const schemaQuestions = faqSchema.mainEntity.map(e => e.name.trim());
    const pageQuestionsNodes = document.querySelectorAll('.faq-item h3, .faq-card h3');
    const pageQuestions = Array.from(pageQuestionsNodes).map(node => node.textContent.trim());

    if (schemaQuestions.length !== pageQuestions.length) {
      error(`FAQ schema length (${schemaQuestions.length}) does not match on-page FAQ length (${pageQuestions.length})`);
    } else {
      for (let i = 0; i < schemaQuestions.length; i++) {
        if (schemaQuestions[i] !== pageQuestions[i]) {
          error(`FAQ schema question mismatch at index ${i}: Schema="${schemaQuestions[i]}" vs Page="${pageQuestions[i]}"`);
        }
      }
    }
    const schemaAnswers = faqSchema.mainEntity.map((entry) => entry.acceptedAnswer?.text?.trim());
    const pageAnswers = Array.from(document.querySelectorAll('.faq-item p, .faq-card p')).map((node) => node.textContent.trim());
    if (pageAnswers.length === schemaAnswers.length) {
      schemaAnswers.forEach((answer, index) => {
        if (answer !== pageAnswers[index]) error(`FAQ schema answer mismatch at index ${index}`);
      });
    }
  } else {
    const pageQuestionsNodes = document.querySelectorAll('.faq-item h3, .faq-card h3');
    if (pageQuestionsNodes.length > 0) {
      error(`Page has FAQ elements but no FAQPage JSON-LD`);
    }
  }
}

// hreflang groups must be reciprocal and must point at a real self-canonical
// document. This intentionally does not require every language on every page:
// publication is per article, not per locale.
for (const alternate of alternateLinks) {
  if (!alternate.href || alternate.hreflang === 'x-default') continue;
  const target = pagesByCanonical.get(alternate.href);
  if (!target) {
    console.error(`[ERROR] ${alternate.relPath}: hreflang ${alternate.hreflang} target is not a built canonical page: ${alternate.href}`);
    hasError = true;
    continue;
  }
  if (alternate.canonical && !alternateLinks.some(
    (candidate) => candidate.canonical === alternate.href && candidate.href === alternate.canonical,
  )) {
    console.error(`[ERROR] ${alternate.relPath}: hreflang ${alternate.hreflang} target does not link back reciprocally`);
    hasError = true;
  }
  const targetLanguage = target.document.documentElement.getAttribute('lang');
  if (targetLanguage && targetLanguage !== alternate.hreflang) {
    console.error(`[ERROR] ${alternate.relPath}: hreflang ${alternate.hreflang} does not match target html lang ${targetLanguage}`);
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log(`✅ SEO invariants passed for all ${htmlFiles.length} pages.`);
}
