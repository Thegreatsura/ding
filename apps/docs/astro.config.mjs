import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import { defineConfig } from 'astro/config';
import { verifySeo } from './scripts/verify-seo.mjs';

export default defineConfig({
  site: 'https://ding.yusufcengiz.dev',
  build: { format: 'preserve' },
  integrations: [
    mdx(),
    {
      name: 'ding-seo-check',
      hooks: {
        'astro:build:done': async ({ dir, logger }) => {
          const { preserved, pages } = await verifySeo(dir, process.env.PUBLIC_DING_PREVIEW === '1');
          logger.info(`Verified ${preserved} published URLs and SEO metadata for ${pages} pages.`);
        },
      },
    },
  ],
  markdown: { shikiConfig: { theme: "github-light" } },
  vite: {
    resolve: { alias: { '@yusufceng1z/ding': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)) } },
  },
});
