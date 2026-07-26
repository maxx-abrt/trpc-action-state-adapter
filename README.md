<div align="center">

# trpc-action-state-adapter

[![npm version](https://img.shields.io/npm/v/trpc-action-state-adapter.svg)](https://www.npmjs.com/package/trpc-action-state-adapter)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![types: TypeScript](https://img.shields.io/badge/types-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Npm package total downloads](https://badgen.net/npm/dt/trpc-action-state-adapter)](https://www.npmjs.com/package/trpc-action-state-adapter)


**Connect tRPC v11 Server Actions to React 19's `useActionState` — without the boilerplate.**

</div>

---

If you have ever written a Next.js 15 form backed by a tRPC mutation, you have probably written some version of this:

```ts
"use server";
export async function createUserAction(prevState: unknown, formData: FormData) {
  const input = Object.fromEntries(formData); // flat, wrong types, no nesting
  try {
    const result = await createUser.mutate(input);
    return { status: "success" as const, data: result };
  } catch (error) {
    // is this a Zod error? a TRPCError? where are the field messages?
    return { status: "error" as const, formError: "Something went wrong." };
  }
}
```

It works for a demo. Then you add a nested `address.city` field, a `tags[]` array, and you want per-field validation messages next to each input — and the code grows fast.

`trpc-action-state-adapter` does all of that in one line:

```ts
const action = withActionState(createUser);
```

It parses `FormData` into nested JSON (dot notation, bracket arrays, indexed arrays), calls your tRPC procedure, and turns Zod validation failures into the `{ fieldErrors, formError }` shape `useActionState` already knows how to render.

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [How field names are parsed](#how-field-names-are-parsed)
- [API reference](#api-reference)
  - [`withActionState(procedure, options?)`](#withactionstateprocedure-options)
  - [`parseFormData(formData, options?)`](#parseformdataformdata-options)
  - [`idleState`](#idlestate)
  - [Types](#types)
- [Advanced patterns](#advanced-patterns)
  - [Logging and telemetry with `onError`](#logging-and-telemetry-with-onerror)
  - [Custom error messages](#custom-error-messages)
  - [Using `parseFormData` standalone](#using-parseformdata-standalone)
  - [Files and uploads](#files-and-uploads)
- [Requirements](#requirements)
- [FAQ](#faq)
- [License](#license)

## Installation

```bash
npm install trpc-action-state-adapter
```

`@trpc/server` and `zod` are peer dependencies — install them once per project if you have not already:

```bash
npm install @trpc/server zod
```

Works with `@trpc/server` v11 and `zod` v3 or v4.

## Quick start

### 1. Define your tRPC procedure

Use tRPC's `experimental_caller` with the Next.js App-Dir caller so the procedure becomes a plain async function you can hand to a `<form>`:

```ts
// server/trpc.ts
import { initTRPC } from "@trpc/server";
import { experimental_nextAppDirCaller } from "@trpc/server/adapters/next-app-dir";
import { z } from "zod";

const t = initTRPC.create();

// Makes every procedure a directly-callable async function.
const serverAction = t.procedure.experimental_caller(
  experimental_nextAppDirCaller({}),
);

export const createUser = serverAction
  .input(
    z.object({
      name: z.string().min(2, "Name must be at least 2 characters"),
      email: z.string().email("Enter a valid email"),
      tags: z.array(z.string()).optional(),
      address: z
        .object({
          city: z.string(),
          country: z.string(),
        })
        .optional(),
    }),
  )
  .mutation(async ({ input }) => {
    return { id: crypto.randomUUID(), ...input };
  });
```

### 2. Wrap it and use it in a form

```tsx
// app/users/new/page.tsx
"use client";

import { useActionState } from "react";
import { withActionState, idleState } from "trpc-action-state-adapter";
import { createUser } from "@/server/trpc";

const createUserAction = withActionState(createUser);

export default function NewUserPage() {
  const [state, formAction] = useActionState(createUserAction, idleState);

  return (
    <form action={formAction}>
      <label>
        Name
        <input name="name" />
      </label>
      {state.fieldErrors?.name && (
        <span>{state.fieldErrors.name.join(", ")}</span>
      )}

      <label>
        Email
        <input name="email" type="email" />
      </label>
      {state.fieldErrors?.email && (
        <span>{state.fieldErrors.email.join(", ")}</span>
      )}

      <fieldset>
        <legend>Address</legend>
        <input name="address.city" placeholder="City" />
        <input name="address.country" placeholder="Country" />
      </fieldset>

      <label>
        <input type="checkbox" name="tags[]" value="beta" />
        Beta tester
      </label>
      <label>
        <input type="checkbox" name="tags[]" value="newsletter" />
        Newsletter
      </label>

      {state.formError && <span>{state.formError}</span>}
      {state.status === "success" && <p>Created user {state.data?.id}</p>}

      <button type="submit">Create user</button>
    </form>
  );
}
```

That is the whole integration. On a successful submit, `state.data` is fully typed as the return value of `createUser`. On a validation failure, `state.fieldErrors` is keyed by your Zod field names — `name`, `email`, `address`, `tags` — with the messages from your schema.

## How field names are parsed

The adapter walks each `FormData` key and builds a nested object. You do not write any parsing code.

| HTML `name` attribute | Parsed value |
| --- | --- |
| `email` | `{ email: "..." }` |
| `user.name` | `{ user: { name: "..." } }` |
| `tags[]` | `{ tags: ["a", "b"] }` |
| `items[0]` | `{ items: ["a"] }` |
| `user.address.tags[]` | `{ user: { address: { tags: ["a", "b"] } } }` |
| `users[].name` | `{ users: [{ name: "Ann" }, { name: "Bob" }] }` |

- **Dot notation** (`user.name`) creates nested objects.
- **Bracket notation** (`tags[]`) appends to an array. Use it for repeated inputs like checkboxes or multi-selects.
- **Indexed brackets** (`items[0]`) place a value at a specific array index.
- Combine them freely: `user.address.tags[]`, `matrix[0][1]`, `users[].name`.

Scalar coercion is applied to string values by default:

| Form value | Parsed as |
| --- | --- |
| `"on"`, `"true"`, `"1"`, `"yes"` | `true` |
| `"off"`, `"false"`, `"0"`, `"no"` | `false` |
| everything else | string |

Numbers stay as strings by default so Zod's `z.coerce.number()` or `z.number()` can handle them at the schema layer. If you want the parser to convert numeric strings itself, pass `coerceNumbers: true` (see [`parseFormData`](#parseformdataformdata-options)).

Empty file inputs are skipped. `File` objects are passed through unchanged.

## API reference

### `withActionState(procedure, options?)`

Wraps a tRPC v11 procedure (configured with `experimental_nextAppDirCaller`) into a function matching React 19's `useActionState` signature.

```ts
import { withActionState } from "trpc-action-state-adapter";

const action = withActionState(createUser, {
  errorMessage: "Could not create the user.",
  onError(error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
      return { status: "error", formError: "Please sign in and try again." };
    }
    // return undefined to fall through to the default formatting
  },
});
```

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| `procedure` | `tRPC procedure` | A tRPC v11 mutation or query, configured with `experimental_nextAppDirCaller` so it is callable as a plain async function. |
| `options.errorMessage` | `string` | Custom message used as `formError` for non-validation errors. Defaults to `"Something went wrong. Please try again."`. |
| `options.onError` | `(error: unknown) => ActionState \| undefined \| void` | Called with every caught error. Return an `ActionState` to override the default formatting, or `undefined`/`void` to fall through. Great for logging or custom error reshaping. |

**Returns**

A function with the signature `(prevState, formData) => Promise<ActionState<TData, TInput>>`, ready to pass to `useActionState`.

### `parseFormData(formData, options?)`

Parses a `FormData` instance into a nested JSON object. Exported separately in case you want to use the parser outside of `withActionState` — for example inside a custom action or a test.

```ts
import { parseFormData } from "trpc-action-state-adapter";

const input = parseFormData(formData, { coerceNumbers: true });
```

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| `formData` | `FormData` | The native `FormData` submitted by a `<form>`. |
| `options.coerceNumbers` | `boolean` | When `true`, numeric strings are converted to JavaScript numbers. Defaults to `false`. |

**Returns**

A nested plain object, or `undefined` when the form is empty.

### `idleState`

The initial state to pass as the second argument to `useActionState`:

```ts
import { useActionState } from "react";
import { withActionState, idleState } from "trpc-action-state-adapter";

const [state, formAction] = useActionState(action, idleState);
```

It is `{ status: "idle" }` — a constant you can reuse across forms.

### Types

```ts
type ActionState<TData = unknown, TInput = any> = {
  status: "idle" | "success" | "error";
  data?: TData;
  fieldErrors?: Partial<Record<keyof TInput, string[]>>;
  formError?: string;
};
```

- `status` — the high-level outcome: `idle` before any submit, `success` after the procedure returns, `error` on validation or server failure.
- `data` — the procedure's return value, present only on success. The type is inferred from your tRPC procedure.
- `fieldErrors` — per-field validation messages keyed by Zod field name. Present only on validation failure.
- `formError` — a form-wide message (server errors, refinement failures, or your custom `errorMessage`).

The input and output types are inferred from the procedure you pass to `withActionState`, so `state.data` is typed as the return value of your mutation and `state.fieldErrors` is keyed by your Zod schema's keys.

## Advanced patterns

### Logging and telemetry with `onError`

`onError` runs for every error before the default formatting. Return an `ActionState` to take over completely, or return nothing to keep the default behavior:

```ts
const action = withActionState(createUser, {
  onError(error) {
    // Send to Sentry, but let the adapter handle the user-facing shape.
    Sentry.captureException(error);
  },
});
```

```ts
const action = withActionState(createUser, {
  onError(error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
      return { status: "error", formError: "Your session expired. Please sign in." };
    }
    // Everything else falls through to the default formatting.
  },
});
```

### Custom error messages

Override the fallback message for non-validation errors (anything that is not a Zod `BAD_REQUEST`):

```ts
const action = withActionState(createUser, {
  errorMessage: "We could not create the user. Please try again in a moment.",
});
```

Validation errors still come through as `fieldErrors` from your Zod messages — `errorMessage` only applies to server-side failures.

### Using `parseFormData` standalone

The parser is useful on its own whenever you have a `FormData` instance and need a JSON object — for example inside a raw Server Action or in tests:

```ts
import { parseFormData } from "trpc-action-state-adapter";

export async function importUsersAction(formData: FormData) {
  const users = parseFormData(formData)?.users;
  // users is typed as unknown[] — validate with your own Zod schema here.
}
```

### Files and uploads

`File` objects are passed through unchanged, so file inputs reach your tRPC procedure as `File` instances. Empty file inputs (no file selected) are skipped automatically:

```tsx
<input type="file" name="avatar" />
<input type="file" name="attachments[]" multiple />
```

Both `avatar` (a single `File`) and `attachments` (an array of `File`) arrive in your procedure's `input` ready to process.

## Requirements

- React 19 (for `useActionState`)
- Next.js 15 (or any React framework with Server Actions)
- `@trpc/server` v11, with procedures configured via `experimental_nextAppDirCaller`
- `zod` v3 or v4
- TypeScript 5.6+ (recommended; the package ships type definitions)

## FAQ

**Do I need to use `experimental_nextAppDirCaller`?**

Yes — that is what turns a tRPC procedure into a plain async function the adapter can call. Without it, tRPC procedures are not directly callable. See the [tRPC Server Actions guide](https://trpc.io/blog/trpc-actions) for background.

**Does this work with `z.infer` types?**

The adapter infers input and output types from the procedure's `_def`, so `state.data` is typed as the return value of your mutation and `state.fieldErrors` is keyed by your Zod schema's keys. You usually do not need to write any type parameters yourself.

**What about queries, not just mutations?**

`withActionState` works with any procedure that takes a single input argument — queries included. In practice, forms usually call mutations, but nothing stops you from wrapping a query.

**Is the parser safe for untrusted input?**

The parser only reshapes data; it does not evaluate code or touch prototypes. Validation is still your Zod schema's job. Treat the output of `parseFormData` as untrusted until Zod has validated it, the same way you would treat any user input.

**Why are numbers strings by default?**

Because Zod's `z.coerce.number()` and `z.number()` handle numeric coercion at the schema layer, which is where validation belongs. If you want the parser to convert numeric strings to numbers for you, pass `coerceNumbers: true` to `parseFormData`.

## License

MIT
