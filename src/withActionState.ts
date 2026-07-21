import { parseFormData } from "./parseFormData";
import type {
  ActionFn,
  ActionState,
  IdleActionState,
  InferProcedureInput,
  InferProcedureOutput,
} from "./types";

/* -------------------------------------------------------------------------- */
/* tRPC error shape                                                            */
/* -------------------------------------------------------------------------- */

interface TRPCErrorLike {
  code: string;
  message?: string;
  data?: {
    code?: string;
    httpStatus?: number;
    zodError?: ZodErrorLike;
  };
  cause?: unknown;
}

interface ZodErrorLike {
  name?: string;
  flatten?: () => {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };
  issues?: Array<{ path?: PropertyKey[]; message: string }>;
}

function isTRPCErrorLike(value: unknown): value is TRPCErrorLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string"
  );
}

function isZodErrorLike(value: unknown): value is ZodErrorLike {
  return (
    typeof value === "object" &&
    value !== null &&
    ("flatten" in value || "issues" in value)
  );
}

function resolveZodError(error: TRPCErrorLike): ZodErrorLike | undefined {
  if (isZodErrorLike(error.data?.zodError)) return error.data?.zodError;
  if (isZodErrorLike(error.cause)) return error.cause as ZodErrorLike;
  return undefined;
}

function extractFieldErrors(
  error: TRPCErrorLike,
): Record<string, string[]> | undefined {
  const zod = resolveZodError(error);
  if (!zod) return undefined;

  const flattened = zod.flatten?.();
  if (flattened?.fieldErrors) {
    const out: Record<string, string[]> = {};
    for (const [key, messages] of Object.entries(flattened.fieldErrors)) {
      if (messages && messages.length > 0) out[key] = messages;
    }
    if (Object.keys(out).length > 0) return out;
  }

  if (zod.issues && zod.issues.length > 0) {
    const out: Record<string, string[]> = {};
    for (const issue of zod.issues) {
      const path = issue.path;
      if (!path || path.length === 0) continue;
      const key = String(path[0]);
      (out[key] ??= []).push(issue.message);
    }
    if (Object.keys(out).length > 0) return out;
  }

  return undefined;
}

function extractFormError(
  error: TRPCErrorLike,
  hasFieldErrors: boolean,
): string | undefined {
  const zod = resolveZodError(error);
  const flattened = zod?.flatten?.();
  if (flattened?.formErrors && flattened.formErrors.length > 0) {
    return flattened.formErrors[0];
  }
  if (hasFieldErrors) return undefined;
  if (error.message) return error.message;
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* options                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Options for {@link withActionState}.
 */
export interface WithActionStateOptions {
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

/* -------------------------------------------------------------------------- */
/* idle state                                                                  */
/* -------------------------------------------------------------------------- */

export const idleState: IdleActionState = {
  status: "idle",
};

/* -------------------------------------------------------------------------- */
/* withActionState                                                             */
/* -------------------------------------------------------------------------- */

export function withActionState<TProcedure extends (input: never) => Promise<unknown>>(
  trpcProcedure: TProcedure,
  options: WithActionStateOptions = {},
): ActionFn<InferProcedureOutput<TProcedure>, InferProcedureInput<TProcedure>> {
  const fallbackMessage =
    options.errorMessage ?? "Something went wrong. Please try again.";

  return async (
    _prevState: ActionState<
      InferProcedureOutput<TProcedure>,
      InferProcedureInput<TProcedure>
    >,
    formData: FormData,
  ): Promise<
    ActionState<InferProcedureOutput<TProcedure>, InferProcedureInput<TProcedure>>
  > => {
    const input = parseFormData(formData) ?? {};

    try {
      const data = (await trpcProcedure(
        input as never,
      )) as InferProcedureOutput<TProcedure>;
      return {
        status: "success",
        data,
      };
    } catch (error: unknown) {
      const overridden = options.onError?.(error);
      if (overridden) {
        return overridden as ActionState<
          InferProcedureOutput<TProcedure>,
          InferProcedureInput<TProcedure>
        >;
      }

      if (isTRPCErrorLike(error)) {
        const isBadRequest =
          error.code === "BAD_REQUEST" ||
          error.data?.code === "BAD_REQUEST" ||
          error.data?.httpStatus === 400;

        const fieldErrors = extractFieldErrors(error);
        const formError = extractFormError(error, !!fieldErrors);

        if (isBadRequest && (fieldErrors || formError)) {
          return {
            status: "error",
            fieldErrors: fieldErrors as
              | Partial<Record<keyof InferProcedureInput<TProcedure>, string[]>>
              | undefined,
            formError,
          };
        }

        return {
          status: "error",
          formError: formError ?? fallbackMessage,
        };
      }

      const message =
        error instanceof Error && error.message ? error.message : fallbackMessage;

      return {
        status: "error",
        formError: message,
      };
    }
  };
}
