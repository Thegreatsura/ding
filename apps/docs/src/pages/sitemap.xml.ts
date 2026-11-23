import type { APIRoute } from 'astro';
import { articleLinks } from '../data/articles';
import releases from '../data/releases.json';

export const GET: APIRoute = ({ site }) => {
  const paths = [
    '/', '/docs.html', '/playground/', '/changelog/',
    ...articleLinks.map(({ slug }) => `/${slug}/`),
    ...releases.map(({ slug }) => `/changelog/${slug}/`),
  ];
  const entries = paths.map(path => `  <url><loc>${new URL(path, site).href}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
