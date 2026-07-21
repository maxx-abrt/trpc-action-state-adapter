# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-21

### Added

- `withActionState(procedure, options?)` — wraps a tRPC v11 procedure (configured with `experimental_nextAppDirCaller`) into a function matching React 19's `useActionState` signature.
  - Parses `FormData` into nested JSON before calling the procedure.
  - Catches tRPC `BAD_REQUEST` errors and formats Zod issues into `fieldErrors` and `formError`.
  - Resolves Zod errors from both `error.data.zodError` and `error.cause` (the Next.js App-Dir caller location).
  - Optional `errorMessage` for non-validation failures.
  - Optional `onError` callback for logging, telemetry, or custom error reshaping.
- `parseFormData(formData, options?)` — standalone utility that converts `FormData` into a nested JSON object. Supports dot notation (`user.name`), bracket arrays (`tags[]`), indexed arrays (`items[0]`), and combinations. Boolean coercion for `on`/`true`/`1`/`yes` and `off`/`false`/`0`/`no`. Optional `coerceNumbers` for numeric string conversion.
- `idleState` — the initial state constant for `useActionState(action, idleState)`.
- TypeScript types: `ActionState`, `IdleActionState`, `ActionFn`, `InferProcedureInput`, `InferProcedureOutput`, `AnyTRpcProcedure`.
- ESM and CJS builds via tsup, with type definitions.
- `@trpc/server` and `zod` as peer dependencies (supports zod v3 and v4).
