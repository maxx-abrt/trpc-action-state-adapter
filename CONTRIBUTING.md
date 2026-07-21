# Contributing

Thanks for your interest in improving `trpc-action-state-adapter`. This is a small, focused library, so the bar for changes is keeping it small and focused.

## Setup

```bash
git clone <repo-url>
cd trpc-action-state-adapter
npm install
```

You need Node 18.17+ and npm.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run build` | Bundles ESM + CJS + type definitions via tsup. |
| `npm run dev` | Same, in watch mode. |
| `npm run lint` | Type-checks the source with `tsc --noEmit`. |

There is no test runner committed yet. When you need to verify runtime behavior, the quickest path is a small Node script that imports from `dist/index.js` after a build — see the snippets in the README for examples.

## Project layout

```
src/
├── index.ts           Barrel exports — the public API surface.
├── withActionState.ts The wrapper. This is where error formatting lives.
├── parseFormData.ts   FormData → nested JSON. Pure, no tRPC dependency.
└── types.ts           Public types and the tRPC inference helpers.
```

Keep `parseFormData.ts` free of any `@trpc/server` import — it is useful on its own and the build marks `@trpc/server` and `zod` as external.

## Before opening a PR

1. Run `npm run lint` and `npm run build` and make sure both pass.
2. If you change the public API (exports, types, or function signatures), update the README's API reference to match.
3. Keep changes minimal and focused on one concern per PR. This library is intentionally small; resist adding features that belong in user code or in tRPC itself.
4. Do not add runtime dependencies. `@trpc/server` and `zod` are peer dependencies and should stay that way.

## Style

- TypeScript strict mode is on — do not weaken it.
- No comments unless the *why* is non-obvious. Well-named code explains itself.
- Match the existing formatting (2-space indent, double quotes, trailing commas).

## Reporting bugs

Open an issue with:

- The smallest reproduction you can manage (a single file is ideal).
- The `@trpc/server`, `zod`, and `trpc-action-state-adapter` versions.
- What you expected, and what happened instead.

## License

By contributing, you agree your contributions are licensed under the project's MIT license.
