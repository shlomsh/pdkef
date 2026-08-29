// Stub for Astro's `astro:content` virtual module under Vitest.
//
// `astro:content` only exists inside an Astro build. src/lib/documentation.ts
// reaches for it with a dynamic `import('astro:content')` - a LITERAL specifier,
// because anything Vite cannot statically see is left un-rewritten and the raw
// string `astro:content` then reaches Node's ESM loader at prerender time
// (ERR_UNSUPPORTED_ESM_URL_SCHEME). That literal is what makes the build work,
// and it is also what Vitest's import analysis tries and fails to resolve, so
// vitest.config.js aliases the specifier here.
//
// Throwing rather than returning [] on purpose: no unit test should be reaching
// the content layer, and a silent empty collection would let a test assert
// "no localized variants" against a stub instead of against real data. If this
// ever throws, the test wants a real fixture, not a looser stub.
export function getCollection(name) {
  throw new Error(
    `astro:content is not available under Vitest (getCollection('${name}')). ` +
      'Unit tests must not read content collections; pass fixture data in instead.',
  );
}
