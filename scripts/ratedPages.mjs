/** Whether a built page (`dist/...`) is a home page or a tool page, in any language (SEO-63). */
export function ratedPageTest(toolSlugs) {
  const page = new RegExp(`(^|/)dist/(?:[a-z]{2}/)?(?:(?:${toolSlugs.join('|')})/)?index\\.html$`);
  return (relPath) => page.test(relPath);
}

/**
 * The rating is on every page that should carry it or, when the build had no store, on none.
 * `ratingByPage` maps a built page to whether its markup carries the rating.
 */
export function ratedPageProblems(ratingByPage, isRatedPage) {
  const anyRated = [...ratingByPage.values()].some(Boolean);
  return [...ratingByPage].flatMap(([page, rated]) => {
    if (rated && !isRatedPage(page)) return [`${page}: aggregateRating on a page that is neither a home page nor a tool page`];
    if (anyRated && !rated && isRatedPage(page)) return [`${page}: no aggregateRating, though other pages of this build carry it`];
    return [];
  });
}
