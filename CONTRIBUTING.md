# Contributing to Ding

Ding’s toast engine lives in `packages/core`. The React, Svelte, and Vue adapters live in their own packages. The docs and playground live in `apps/docs`.

## Set up the project

Use Node.js 22.18 or newer and pnpm 10. Fork and clone the repository, then run these commands from its root.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The terminal prints the local URL for the docs and playground.

## Report a problem

Search [existing issues](https://github.com/YusufCeng1z/ding/issues) first. Include the Ding version, renderer, expected and actual behavior, and the smallest reproduction you can share. For security issues, follow the [private reporting instructions](SECURITY.md).

## Send a pull request

Open your PR against `main`. Describe the behavior you changed, link the relevant issue, and say how you verified the fix. If a change affects multiple renderers, mention which ones you checked. Add a focused regression test when the change fixes a bug that the current tests miss.

```sh
pnpm typecheck
pnpm test
pnpm build
```

If you changed the docs, also run `pnpm --filter docs build`.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
