/**
 * Public type definitions for `trpc-action-state-adapter`.
 *
 * These types model the shape that React 19's `useActionState` hook expects
 * from a Server Action, while remaining generic enough to infer the data and
 * input types from any tRPC v11 procedure passed to {@link withActionState}.
 */
/**
 * The standardized state object returned by an action wrapped with
 * {@link withActionState}. It mirrors the contract that React 19's
 * `useActionState` hook consumes:
 *
 * - `status`    - the high-level outcome of the action.
 * - `data`      - the successful return value of the tRPC procedure (if any).
 * - `fieldErrors` - per-field validation messages keyed by input field name.
 * - `formError` - a non-field-specific error message (e.g. server errors).
 */
type ActionState<TData = unknown, TInput = any> = {
    status: "idle" | "success" | "error";
    data?: TData;
    fieldErrors?: Partial<Record<keyof TInput, string[]>>;
    formError?: string;
};
/**
 * The initial "idle" state returned before an action has ever run, or used as
 * the default `prevState` on the first render. Keeping it as a constant value
 * avoids `undefined` checks at every call site.
 */
type IdleActionState<TData = unknown, TInput = any> = ActionState<TData, TInput> & {
    status: "idle";
};
/**
 * The signature of the Server Action produced by {@link withActionState}.
 * It matches what `useActionState(action, initialState)` expects:
 *
 * `(prevState, formData) => Promise<nextState>`
 */
type ActionFn<TData = unknown, TInput = any> = (prevState: ActionState<TData, TInput>, formData: FormData) => Promise<ActionState<TData, TInput>>;
/**
 * Extracts the raw input type from a tRPC v11 procedure. tRPC procedures
 * expose their input contract via the `_def.inputs` tuple (the chain of
 * input parsers, typically Zod schemas). We union the input types across the
 * chain and fall back to `unknown` when the internal shape is unavailable.
 */
type InferProcedureInput<TProcedure> = TProcedure extends {
    _def: {
        inputs: infer TInputs extends readonly unknown[];
    };
} ? TInputs extends readonly [infer First, ...infer _Rest] ? First : unknown : TProcedure extends {
    _def: {
        input: infer TInput;
    };
} ? TInput : unknown;
/**
 * Extracts the output (success) type from a tRPC v11 procedure. The output
 * contract is exposed via `_def.output` on the resolved procedure node.
 */
type InferProcedureOutput<TProcedure> = TProcedure extends {
    _def: {
        output: infer TOutput;
    };
} ? TOutput : unknown;
/**
 * Narrows a tRPC procedure to something we can invoke as a Server Action.
 * tRPC v11 exposes a callable shape; this helper keeps the generic parameter
 * while letting us call the procedure with a single typed argument.
 */
type AnyTRpcProcedure = {
    (input: unknown): Promise<unknown>;
};

/**
 * Options for {@link withActionState}.
 */
interface WithActionStateOptions {
    /**
     * Custom message returned as `formError` when a non-validation error occurs
     * (any tRPC error code other than `BAD_REQUEST`, or a non-tRPC throw).
     * Defaults to `"Something went wrong. Please try again."`.
     */
    errorMessage?: string;
    /**
     * Called with every error before the default formatting runs. Return an
     * `ActionState` to override the default behavior entirely, or return
     * `undefined` to fall through to the built-in formatting.
     *
     * Useful for logging, telemetry, or custom error reshaping.
     */
    onError?: (error: unknown) => ActionState | undefined | void;
}
declare const idleState: IdleActionState;
declare function withActionState<TProcedure extends (input: never) => Promise<unknown>>(trpcProcedure: TProcedure, options?: WithActionStateOptions): ActionFn<InferProcedureOutput<TProcedure>, InferProcedureInput<TProcedure>>;

/**
 * Deeply parse a `FormData` instance into a nested JSON object.
 *
 * Supported field naming conventions:
 *
 * - Flat keys:        `name="email"`                 -> `{ email: "..." }`
 * - Dot notation:     `name="user.name"`             -> `{ user: { name: "..." } }`
 * - Bracket arrays:   `name="tags[]"`                -> `{ tags: ["a", "b"] }`
 * - Indexed arrays:   `name="items[0]"`              -> `{ items: ["a"] }`
 * - Nested + arrays:  `name="user.address.tags[]"`   -> `{ user: { address: { tags: [...] } } }`
 * - Boolean values:   `"on"` / `"true"` / `"1"`      -> `true`; `"off"` / `"false"` / `"0"` -> `false`
 * - Empty file inputs are skipped.
 *
 * The parser is intentionally permissive: it never throws on malformed keys,
 * it simply does its best to coerce them into the nested shape.
 */
interface ParseFormDataOptions {
    /**
     * When `true`, numeric strings (e.g. `"42"`, `"3.14"`) are converted to
     * JavaScript numbers. Defaults to `false` — numbers are left as strings so
     * Zod's `z.coerce.number()` or `z.number()` can handle them at the schema
     * layer, which is usually what you want.
     */
    coerceNumbers?: boolean;
}
declare function parseFormData(formData: FormData, options?: ParseFormDataOptions): Record<string, unknown> | undefined;

export { type ActionFn, type ActionState, type AnyTRpcProcedure, type IdleActionState, type InferProcedureInput, type InferProcedureOutput, type ParseFormDataOptions, type WithActionStateOptions, idleState, parseFormData, withActionState };
