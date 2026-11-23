import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const origin = 'https://ding.yusufcengiz.dev';
const published = new URL('./public-paths.txt', import.meta.url);

export async function verifySeo(directory, preview) {
  const paths = (await readFile(published, 'utf8')).trim().split('\n');
  const sitemap = await readFile(new URL('sitemap.xml', directory), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url));
  const byPath = new Map(urls.map(url => [url.pathname, url]));
  assert.equal(byPath.size, urls.length, 'Sitemap URLs must be unique');
  for (const path of paths) {
    assert(byPath.has(path), `Previously published URL is missing from the sitemap: ${path}`);
  }

  const titles = new Set();
  const descriptions = new Set();
  for (const [path, url] of byPath) {
    assert.equal(url.origin, origin, `Unexpected sitemap host for ${path}`);
    const file = path.endsWith('/') ? `${path}index.html` : path;
    const html = await readFile(new URL(file.slice(1), directory), 'utf8');
    assert(html.includes(`<link rel="canonical" href="${url.href}"`), `Canonical mismatch: ${path}`);
    assert.equal(html.includes('<meta name="robots" content="noindex"'), preview, `Indexing setting mismatch: ${path}`);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert(title && !titles.has(title), `Missing or duplicate title: ${path}`);
    assert(description && !descriptions.has(description), `Missing or duplicate description: ${path}`);
    titles.add(title);
    descriptions.add(description);
  }
  return { preserved: paths.length, pages: urls.length };
}
