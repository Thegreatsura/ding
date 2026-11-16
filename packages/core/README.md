# @yusufceng1z/ding

Toasts with real spring physics. One toast that morphs in place. No dependencies, no stylesheet.

This is the core: springs, timers, store, sound and a plain DOM renderer. For React, Svelte or Vue, use [`@yusufceng1z/ding-react`](https://www.npmjs.com/package/@yusufceng1z/ding-react), [`@yusufceng1z/ding-svelte`](https://www.npmjs.com/package/@yusufceng1z/ding-svelte) or [`@yusufceng1z/ding-vue`](https://www.npmjs.com/package/@yusufceng1z/ding-vue).

## Install

```bash
npm i @yusufceng1z/ding
```

## Use

```ts
import { mountToaster, toast } from '@yusufceng1z/ding';

mountToaster({ position: 'top-center' });

toast.success('Saved');
toast.error('Payment failed', { description: 'Card declined' });

toast.promise(save(), {
  loading: 'Saving…',
  success: 'Saved',
  error: (err) => `Could not save: ${err.message}`,
});
```

New calls morph a quick toast in place; errors and other held toasts keep their place by default. Options, actions, progress, sound and accessibility are covered in the [docs](https://ding.yusufcengiz.dev/docs.html).

## 0.0.7 behavior note

`toast.dismiss(id)` still accepts the ID returned by `toast.*()`, and `toast.dismiss()` still closes all toasts. When a newer call takes over a visible toast, an older call's ID can no longer dismiss the newer message. Custom renderers using `toast.dismiss(item.id)` for their close button should use `toast.close(item.id)` instead: `item.id` identifies the visible slot, which may differ from the newest caller's ID.

An action returning a synchronous patch still morphs the toast. An async action closes it on click; its resolved value is not applied as a patch. Show its result with a separate toast, or use `toast.promise(...)` for loading-to-result morphing.

## Links

- [Live demo and docs](https://ding.yusufcengiz.dev)
- [Source on GitHub](https://github.com/YusufCeng1z/ding)

## License

[MIT](LICENSE)
