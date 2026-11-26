// The shared SPA shell intentionally has no homepage canonical: it also
// serves dynamic routes. Every prerendered page must provide its own tag.
export function missingCanonical(file, html, seoSource) {
  const sharedShell = file.replace(/\\/g, '/') === 'dist/index.html';
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  if (!sharedShell) return !hasCanonical;
  // A static canonical on this shared shell would misidentify dynamic pages.
  if (hasCanonical) return true;
  const runtimeSeo = /export function applySeo\(/.test(seoSource) &&
    /applySeo\(page, carId, car,/.test(seoSource) &&
    /rel.*canonical|canonical.*rel/i.test(seoSource);
  return !runtimeSeo;
}
