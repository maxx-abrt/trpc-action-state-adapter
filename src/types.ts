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
export type ActionState<TData = unknown, TInput = any> = {
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
export type IdleActionState<TData = unknown, TInput = any> = ActionState<
  TData,
  TInput
> & { status: "idle" };

/**
 * The signature of the Server Action produced by {@link withActionState}.
 * It matches what `useActionState(action, initialState)` expects:
 *
 * `(prevState, formData) => Promise<nextState>`
 */
export type ActionFn<TData = unknown, TInput = any> = (
  prevState: ActionState<TData, TInput>,
  formData: FormData,
) => Promise<ActionState<TData, TInput>>;

/* -------------------------------------------------------------------------- */
/* tRPC inference helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Extracts the raw input type from a tRPC v11 procedure. tRPC procedures
 * expose their input contract via the `_def.inputs` tuple (the chain of
 * input parsers, typically Zod schemas). We union the input types across the
 * chain and fall back to `unknown` when the internal shape is unavailable.
 */
export type InferProcedureInput<TProcedure> = TProcedure extends {
  _def: { inputs: infer TInputs extends readonly unknown[] };
}
  ? TInputs extends readonly [infer First, ...infer _Rest]
    ? First
    : unknown
  : TProcedure extends { _def: { input: infer TInput } }
    ? TInput
    : unknown;

/**
 * Extracts the output (success) type from a tRPC v11 procedure. The output
 * contract is exposed via `_def.output` on the resolved procedure node.
 */
export type InferProcedureOutput<TProcedure> = TProcedure extends {
  _def: { output: infer TOutput };
}
  ? TOutput
  : unknown;

/**
 * Narrows a tRPC procedure to something we can invoke as a Server Action.
 * tRPC v11 exposes a callable shape; this helper keeps the generic parameter
 * while letting us call the procedure with a single typed argument.
 */
export type AnyTRpcProcedure = {
  (input: unknown): Promise<unknown>;
};
