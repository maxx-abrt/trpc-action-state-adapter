// src/parseFormData.ts
var ARRAY_PUSH = "[]";
function isNumericString(value) {
  return value.length > 0 && Number.isSafeInteger(Number(value));
}
var BOOLEAN_TRUE = /* @__PURE__ */ new Set(["on", "true", "1", "yes"]);
var BOOLEAN_FALSE = /* @__PURE__ */ new Set(["off", "false", "0", "no"]);
function coerceScalar(value, coerceNumbers) {
  if (BOOLEAN_TRUE.has(value)) return true;
  if (BOOLEAN_FALSE.has(value)) return false;
  if (coerceNumbers) {
    const asNum = Number(value);
    if (value.trim() !== "" && Number.isFinite(asNum)) return asNum;
  }
  return value;
}
function tokenizeKey(key) {
  const tokens = [];
  let i = 0;
  let segment = "";
  const flushSegment = () => {
    if (segment.length > 0) {
      tokens.push(segment);
      segment = "";
    }
  };
  while (i < key.length) {
    const char = key[i];
    if (char === ".") {
      flushSegment();
      i += 1;
      continue;
    }
    if (char === "[") {
      flushSegment();
      const end = key.indexOf("]", i + 1);
      if (end === -1) {
        segment = key.slice(i + 1);
        flushSegment();
        return tokens;
      }
      const inner = key.slice(i + 1, end);
      if (inner.length === 0) {
        tokens.push(ARRAY_PUSH);
      } else if (isNumericString(inner)) {
        tokens.push(Number(inner));
      } else {
        tokens.push(inner);
      }
      i = end + 1;
      continue;
    }
    segment += char;
    i += 1;
  }
  flushSegment();
  return tokens;
}
function isObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}
function ensureObjectAt(parent, key) {
  if (Array.isArray(parent)) {
    const idx = Number(key);
    if (Number.isNaN(idx)) {
      throw new Error("Cannot use string key on array");
    }
    const existing2 = parent[idx];
    if (!isObject(existing2)) {
      const obj = {};
      parent[idx] = obj;
      return obj;
    }
    return existing2;
  }
  const existing = parent[key];
  if (!isObject(existing)) {
    const obj = {};
    parent[key] = obj;
    return obj;
  }
  return existing;
}
function ensureArrayAt(parent, key) {
  if (Array.isArray(parent)) {
    const idx = Number(key);
    if (Number.isNaN(idx)) {
      throw new Error("Cannot use string key on array");
    }
    const existing2 = parent[idx];
    if (!Array.isArray(existing2)) {
      const arr = [];
      parent[idx] = arr;
      return arr;
    }
    return existing2;
  }
  const existing = parent[key];
  if (!Array.isArray(existing)) {
    const arr = [];
    parent[key] = arr;
    return arr;
  }
  return existing;
}
function setIndexed(arr, idx, value, isLast) {
  if (isLast) {
    arr[idx] = value;
    return;
  }
  while (arr.length <= idx) arr.push(void 0);
  if (!isObject(arr[idx])) {
    arr[idx] = {};
  }
}
function setPath(root, tokens, value) {
  let cursor = root;
  for (let depth = 0; depth < tokens.length; depth++) {
    const token = tokens[depth];
    const isLast = depth === tokens.length - 1;
    const next = tokens[depth + 1];
    const isArrayPushToken = token === ARRAY_PUSH;
    const isIndexToken = typeof token === "number";
    if (isArrayPushToken) {
      if (!Array.isArray(cursor)) return;
      if (isLast) {
        cursor.push(value);
        return;
      }
      const obj = {};
      cursor.push(obj);
      cursor = obj;
      continue;
    }
    if (isIndexToken) {
      if (!Array.isArray(cursor)) return;
      const idx = token;
      if (isLast) {
        setIndexed(cursor, idx, value, true);
        return;
      }
      setIndexed(cursor, idx, value, false);
      cursor = cursor[idx];
      continue;
    }
    const key = token;
    const nextIsArrayPush = next === ARRAY_PUSH;
    const nextIsIndex = typeof next === "number";
    if (isLast) {
      if (Array.isArray(cursor)) {
        cursor[Number(key)] = value;
      } else {
        cursor[key] = value;
      }
      return;
    }
    if (nextIsArrayPush) {
      const arr = ensureArrayAt(cursor, key);
      depth += 1;
      const afterPush = tokens[depth + 1];
      if (afterPush === void 0) {
        arr.push(value);
        return;
      }
      const obj = {};
      arr.push(obj);
      cursor = obj;
      continue;
    }
    if (nextIsIndex) {
      const arr = ensureArrayAt(cursor, key);
      const idx = next;
      depth += 1;
      const afterIdx = tokens[depth + 1];
      if (afterIdx === void 0) {
        arr[idx] = value;
        return;
      }
      while (arr.length <= idx) arr.push(void 0);
      if (!isObject(arr[idx])) arr[idx] = {};
      cursor = arr[idx];
      continue;
    }
    cursor = ensureObjectAt(cursor, key);
  }
}
function parseFormData(formData, options = {}) {
  const root = {};
  const coerceNumbers = options.coerceNumbers ?? false;
  for (const [rawKey, rawValue] of formData.entries()) {
    if (rawValue instanceof File && rawValue.size === 0 && rawValue.name === "") {
      continue;
    }
    const tokens = tokenizeKey(rawKey);
    if (tokens.length === 0) continue;
    const value = rawValue instanceof File ? rawValue : coerceScalar(String(rawValue), coerceNumbers);
    setPath(root, tokens, value);
  }
  if (Object.keys(root).length === 0) return void 0;
  return root;
}

// src/withActionState.ts
function isTRPCErrorLike(value) {
  return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string";
}
function isZodErrorLike(value) {
  return typeof value === "object" && value !== null && ("flatten" in value || "issues" in value);
}
function resolveZodError(error) {
  if (isZodErrorLike(error.data?.zodError)) return error.data?.zodError;
  if (isZodErrorLike(error.cause)) return error.cause;
  return void 0;
}
function extractFieldErrors(error) {
  const zod = resolveZodError(error);
  if (!zod) return void 0;
  const flattened = zod.flatten?.();
  if (flattened?.fieldErrors) {
    const out = {};
    for (const [key, messages] of Object.entries(flattened.fieldErrors)) {
      if (messages && messages.length > 0) out[key] = messages;
    }
    if (Object.keys(out).length > 0) return out;
  }
  if (zod.issues && zod.issues.length > 0) {
    const out = {};
    for (const issue of zod.issues) {
      const path = issue.path;
      if (!path || path.length === 0) continue;
      const key = String(path[0]);
      (out[key] ?? (out[key] = [])).push(issue.message);
    }
    if (Object.keys(out).length > 0) return out;
  }
  return void 0;
}
function extractFormError(error, hasFieldErrors) {
  const zod = resolveZodError(error);
  const flattened = zod?.flatten?.();
  if (flattened?.formErrors && flattened.formErrors.length > 0) {
    return flattened.formErrors[0];
  }
  if (hasFieldErrors) return void 0;
  if (error.message) return error.message;
  return void 0;
}
var idleState = {
  status: "idle"
};
function withActionState(trpcProcedure, options = {}) {
  const fallbackMessage = options.errorMessage ?? "Something went wrong. Please try again.";
  return async (_prevState, formData) => {
    const input = parseFormData(formData) ?? {};
    try {
      const data = await trpcProcedure(
        input
      );
      return {
        status: "success",
        data
      };
    } catch (error) {
      const overridden = options.onError?.(error);
      if (overridden) {
        return overridden;
      }
      if (isTRPCErrorLike(error)) {
        const isBadRequest = error.code === "BAD_REQUEST" || error.data?.code === "BAD_REQUEST" || error.data?.httpStatus === 400;
        const fieldErrors = extractFieldErrors(error);
        const formError = extractFormError(error, !!fieldErrors);
        if (isBadRequest && (fieldErrors || formError)) {
          return {
            status: "error",
            fieldErrors,
            formError
          };
        }
        return {
          status: "error",
          formError: formError ?? fallbackMessage
        };
      }
      const message = error instanceof Error && error.message ? error.message : fallbackMessage;
      return {
        status: "error",
        formError: message
      };
    }
  };
}

export { idleState, parseFormData, withActionState };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map