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
  } else {
    const pageQuestionsNodes = document.querySelectorAll('.faq-item h3, .faq-card h3');
    if (pageQuestionsNodes.length > 0) {
      error(`Page has FAQ elements but no FAQPage JSON-LD`);
    }
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log(`✅ SEO invariants passed for all ${htmlFiles.length} pages.`);
}
