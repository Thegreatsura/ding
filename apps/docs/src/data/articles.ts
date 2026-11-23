import guides from './guides.json';

interface ArticleMeta {
  title: string;
  heading: string;
  description: string;
  demo?: boolean;
}

const newArticles = import.meta.glob<{ frontmatter: ArticleMeta; Content: typeof import('astro/runtime/server/index.js').createComponent }>('../articles/*.mdx', { eager: true });
export const mdxArticles = Object.entries(newArticles).map(([file, { frontmatter, Content }]) => ({
  slug: file.slice(file.lastIndexOf('/') + 1, -4),
  ...frontmatter,
  Content,
}));

export const articleLinks = [
  ...mdxArticles.map(({ slug, heading }) => ({ slug, heading })),
  ...Object.entries(guides).map(([slug, { heading }]) => ({ slug, heading })),
];
