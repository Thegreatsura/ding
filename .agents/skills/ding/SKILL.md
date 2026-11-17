---
name: ding
description: Set up and troubleshoot Ding toast notifications in React, Next.js, Svelte 5, Vue, Nuxt, or plain DOM. Use when integrating @yusufceng1z/ding packages, migrating to Ding, or working on toast promises, progress, actions, or styling.
---

# Ding

## Set up the renderer

Check the app's existing dependencies and toaster before adding anything. Use one renderer near the app root and import `toast` from the same package.

| App | Package | Setup |
| --- | --- | --- |
| React 18+ or Next.js | `@yusufceng1z/ding-react` | Render `<Toaster />` once. If installed through shadcn, reuse the generated `DingToaster` wrapper. |
| Svelte 5 | `@yusufceng1z/ding-svelte` | Render `<Toaster />` in the root component or layout. |
| Vue 3 or Nuxt | `@yusufceng1z/ding-vue` | Render `<Toaster />` in the root component or `app.vue`. The component mounts on the client. |
| Plain DOM | `@yusufceng1z/ding` | Call `mountToaster()` in browser setup. Call its returned cleanup when the host is torn down. |

Framework packages already bring in the core. The renderers inject styles. With a strict `style-src` CSP, pass the page's nonce to `Toaster` or `mountToaster`.

With the Next.js App Router, `Toaster` can be rendered directly from `app/layout.tsx`. Fire toasts in client code, such as an event handler. When setting `toast.configure()` from a React component, call it in an effect.

## Model the toast lifecycle

- Use `toast.promise(save(), { loading: 'Saving…', success: 'Saved', error: 'Could not save' })` for one loading-to-result flow. The method returns the underlying promise, so preserve the caller's rejection handling.
- Use the ID from `toast.loading()` for `toast.update(id, patch)` and `toast.dismiss(id)`. A newer call can take over the shared toast and make the old ID stale. `toast.close(item.id)` is for renderers that hold a `ToastItem`.
- Clear a progress bar with `toast.update(id, { progress: null })`. Update `title` and `type` in the same patch when turning a progress toast into a result.
- An action can return a synchronous patch to morph the toast. An async action closes the toast on click. Use `toast.promise()` inside the action when it needs a separate loading-to-result flow.
- Quick toasts morph in place. Held toasts such as errors and toasts with actions keep their place by default. For a strict single-toast UI, use `toast.configure({ held: 'replace' })`.
- Customize colors and radius with CSS variables on `.tst-viewport`. Keep the built-in renderer's live regions, keyboard behavior, and reduced-motion support when adapting the UI.

See the [Ding docs](https://ding.yusufcengiz.dev/docs.html) for the API and styling options, the [Next.js guide](https://ding.yusufcengiz.dev/nextjs-toast/) for App Router examples, or the [plain-text reference](https://ding.yusufcengiz.dev/llms.txt) for a compact API overview.
