/**
 * A normalized fingerprint of every source field rendered for a documentation
 * page. It deliberately derives from content, rather than a file timestamp or
 * manually maintained release string, so a source edit cannot silently leave a
 * published translation marked current.
 */
export type DocumentationSourceHash = `fnv1a64:${string}`;
export type DocumentationFreshness = 'current' | 'stale';

function normalizedString(value: string): string {
  return value.replace(/\r\n?/g, '\n').normalize('NFC');
}

/** Serialize JSON-like content with stable key order and normalized text. */
export function normalizeDocumentationSource(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(normalizedString(value));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Documentation source cannot contain a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(normalizeDocumentationSource).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      // Astro's content schema materializes `variant: default` on sections
      // that omit it. Treat the explicit and implicit forms identically so
      // the authored YAML and the validated collection have one fingerprint.
      .filter((key) => record[key] !== undefined && !(key === 'variant' && record[key] === 'default'))
      .sort()
      .map((key) => `${JSON.stringify(normalizedString(key))}:${normalizeDocumentationSource(record[key])}`)
      .join(',')}}`;
  }
  throw new TypeError(`Documentation source must be JSON-like; received ${typeof value}`);
}

export function documentationSourceHash(source: unknown): DocumentationSourceHash {
  // FNV-1a is deliberately implemented here instead of importing Node's crypto
  // module: this build-only helper also has fast browser-like unit tests. The
  // hash is a change fingerprint, not a security boundary.
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(normalizeDocumentationSource(source))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function documentationFreshness(
  englishSource: unknown,
  translatedSourceHash: string | undefined,
): { freshness: DocumentationFreshness; expectedSourceHash: DocumentationSourceHash } {
  const expectedSourceHash = documentationSourceHash(englishSource);
  return {
    freshness: translatedSourceHash === expectedSourceHash ? 'current' : 'stale',
    expectedSourceHash,
  };
}

export function validateDocumentationTranslationFreshness(
  englishSource: unknown,
  translation: { id: string; pageId: string; status: 'draft' | 'published'; sourceHash: string },
): { freshness: DocumentationFreshness; expectedSourceHash: DocumentationSourceHash } {
  const result = documentationFreshness(englishSource, translation.sourceHash);
  if (translation.status === 'published' && result.freshness === 'stale') {
    throw new Error(
      `Published translation ${translation.id} is stale: sourceHash ${translation.sourceHash} does not match ` +
        `English ${translation.pageId} (${result.expectedSourceHash}). Update and review the translation before publishing.`,
    );
  }
  return result;
}
