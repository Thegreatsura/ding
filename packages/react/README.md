# @yusufceng1z/ding-react

Toasts with real spring physics for React 18+. One toast that morphs in place. No stylesheet to import.

## Install

```bash
npm i @yusufceng1z/ding-react
```

## Use

Render the toaster once, then call `toast` from anywhere.

```tsx
import { Toaster, toast } from '@yusufceng1z/ding-react';

export default function App() {
  return (
    <>
      <Toaster position="top-center" theme="system" />
      <button onClick={() => toast.success('Saved')}>Save</button>
    </>
  );
}
```

In the Next.js App Router, render `Toaster` from a client component (`"use client"`). See the [Next.js guide](https://ding.yusufcengiz.dev/nextjs-toast/).

Options, actions, progress, sound and accessibility are covered in the [docs](https://ding.yusufcengiz.dev/docs.html).

## Links

- [Live demo and docs](https://ding.yusufcengiz.dev)
- [Source on GitHub](https://github.com/YusufCeng1z/ding)

## License

[MIT](LICENSE)
