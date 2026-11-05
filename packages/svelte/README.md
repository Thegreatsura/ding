# @yusufceng1z/ding-svelte

Toasts with real spring physics for Svelte 5. One toast that morphs in place. No stylesheet to import.

## Install

```bash
npm i @yusufceng1z/ding-svelte
```

## Use

Render the toaster once, then call `toast` from anywhere.

```svelte
<script>
  import { Toaster, toast } from '@yusufceng1z/ding-svelte';
</script>

<Toaster position="top-center" theme="system" />
<button onclick={() => toast.success('Saved')}>Save</button>
```

Options, actions, progress, sound and accessibility are covered in the [docs](https://ding.yusufcengiz.dev/docs.html).

## Links

- [Live demo and docs](https://ding.yusufcengiz.dev)
- [Source on GitHub](https://github.com/YusufCeng1z/ding)

## License

[MIT](LICENSE)
