---
name: ding
description: Integrate, migrate to, or troubleshoot Ding toast notifications. Use when a request names Ding or a project uses @yusufceng1z/ding, ding-react, ding-svelte, or ding-vue, including toaster setup, promise and progress flows, actions, styling, and accessibility.
---

# Ding

## Set up the renderer

Check the app's dependencies and root layout first. Reuse an existing Ding renderer. For a new integration, install the package for the app's framework with its existing package manager. Mount one renderer near the app root and import `toast` from the same package. The framework packages already include the core as a dependency.

| App | Package | Setup |
| --- | --- | --- |
| React 18+ or Next.js | `@yusufceng1z/ding-react` | Render `<Toaster />` at the root. Reuse `DingToaster` if the project already has the shadcn wrapper. |
| Svelte 5 | `@yusufceng1z/ding-svelte` | Render `<Toaster />` in the root component or layout. |
| Vue 3 or Nuxt | `@yusufceng1z/ding-vue` | Render `<Toaster />` in the root component or `app.vue`. Ding mounts on the client. |
| Plain DOM | `@yusufceng1z/ding` | Call `mountToaster()` during browser setup and keep the returned cleanup for teardown. |

In Next.js, render `Toaster` directly from `app/layout.tsx` or `pages/_app.tsx`. Call `toast` from client event handlers or effects. Call `toast.configure()` inside an effect when configuring from a React component.

## Model the toast lifecycle

Use `toast.success()`, `toast.error()`, `toast.warning()`, or `toast.info()` for an immediate result. Wrap an existing async operation with `toast.promise()` to show its loading state and outcome in one toast. Preserve the operation's rejection handling because Ding returns the underlying promise.

```ts
await toast.promise(() => saveForm(values), {
  loading: 'Saving…',
  success: 'Saved',
  error: 'Could not save',
});
```

For progress reported as events, pass a value from `0` to `1`. Update the same caller ID and clear the bar with `null` on completion.

```ts
const id = toast.loading('Uploading…', { progress: 0 });
// In the upload's progress and success callbacks:
toast.update(id, { progress: 0.6 });
toast.update(id, { type: 'success', title: 'Uploaded', progress: null });
```

- Use the returned caller ID with `toast.update(id, patch)` and `toast.dismiss(id)`. If a newer call takes over the toast, the old ID becomes stale. A custom renderer with a `ToastItem` can use `toast.close(item.id)` to close the visible toast.
- A synchronous `action.onClick` can return a patch to morph the toast. An async handler closes the original toast on click unless it already gave the slot to a new toast. For async work, show the result separately or start a `toast.promise()` flow in the handler.
- Quick toasts reuse a slot. Errors, toasts with actions, and toasts with explicit `duration: 0` can keep their slots in the default `held: 'list'` mode. Use `toast.configure({ held: 'queue' })` to wait behind held toasts or `held: 'replace'` to let a new toast take over a held one.

## Diagnose renderer and styling issues

- If no toast appears, confirm the renderer is mounted, the event fires in the browser, and the trigger and renderer resolve the same Ding package. Check for duplicate dependency versions if they live in separate workspace packages.
- Ding injects a stylesheet on mount. If the content appears unstyled, check for a blocked `style[data-toast]` in DevTools and pass the page's CSP nonce to `Toaster` or `mountToaster()` when required.
- Set `--tst-bg`, `--tst-fg`, and `--tst-radius` on `:root .tst-viewport` in a global stylesheet so these values override Ding’s injected defaults. For one toast, pass `className` and target `.tst.<className>`. When customizing the renderer, preserve its live regions, keyboard dismissal, and reduced-motion behavior.

For the full API and framework examples, see the [Ding docs](https://ding.yusufcengiz.dev/docs.html), [Next.js guide](https://ding.yusufcengiz.dev/nextjs-toast/), and [plain-text reference](https://ding.yusufcengiz.dev/llms.txt).
