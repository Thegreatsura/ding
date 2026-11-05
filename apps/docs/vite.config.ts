import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Alias to package sources so dev needs no prior build and edits hot-reload.
export default defineConfig({
  plugins: [react(), svelte()],
  build: { rollupOptions: { input: { main: src('index.html'), docs: src('docs.html') } } },
  resolve: {
    alias: {
      'ding': src('../../packages/core/src/index.ts'),
      'ding-react': src('../../packages/react/src/index.tsx'),
      'ding-svelte': src('../../packages/svelte/src/lib/index.ts'),
    },
    dedupe: ['react', 'react-dom', 'svelte'],
  },
});
