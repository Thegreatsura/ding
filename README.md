# Ding

Spring-physics toast notifications for React, Svelte 5 and plain DOM. Zero dependencies, styles injected from JavaScript.

```bash
npm i ding-react   # React
npm i ding-svelte  # Svelte 5
npm i ding         # plain DOM
```

```tsx
import { Toaster, toast } from 'ding-react';

<Toaster />;
toast.success('Saved');
```

One toast at a time: a new call morphs the one on screen. Docs and a live demo are in `apps/docs` (`pnpm --filter docs dev`). Machine-readable summary: `apps/docs/public/llms.txt`.

## Packages

- `packages/core` — `ding`: springs, timers, store, sound, vanilla renderer
- `packages/react` — `ding-react`
- `packages/svelte` — `ding-svelte`
