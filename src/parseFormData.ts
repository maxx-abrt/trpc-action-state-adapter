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

/* --------------------------------- tokens --------------------------------- */

type Token = string | number;

const ARRAY_PUSH = "[]";

/* ------------------------------- primitives ------------------------------- */

function isNumericString(value: string): boolean {
  return value.length > 0 && Number.isSafeInteger(Number(value));
}

const BOOLEAN_TRUE = new Set(["on", "true", "1", "yes"]);
const BOOLEAN_FALSE = new Set(["off", "false", "0", "no"]);

/**
 * Coerce a string value into the most appropriate primitive. By default only
 * booleans are coerced; numbers are kept as strings because Zod's
 * `z.coerce.number()` handles that at the schema layer. Pass `coerceNumbers:
 * true` to also coerce numeric strings into numbers.
 */
function coerceScalar(value: string, coerceNumbers: boolean): unknown {
  if (BOOLEAN_TRUE.has(value)) return true;
  if (BOOLEAN_FALSE.has(value)) return false;
  if (coerceNumbers) {
    const asNum = Number(value);
    if (value.trim() !== "" && Number.isFinite(asNum)) return asNum;
  }
  return value;
}

/* ------------------------------ path parsing ------------------------------ */

function tokenizeKey(key: string): Token[] {
  const tokens: Token[] = [];
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

/* ------------------------------ value setting ----------------------------- */

type Container = Record<string, unknown> | unknown[];

function isObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function ensureObjectAt(parent: Container, key: string): Record<string, unknown> {
  if (Array.isArray(parent)) {
    const idx = Number(key);
    if (Number.isNaN(idx)) {
      throw new Error("Cannot use string key on array");
    }
    const existing = parent[idx];
    if (!isObject(existing)) {
      const obj: Record<string, unknown> = {};
      parent[idx] = obj;
      return obj;
    }
    return existing;
  }
  const existing = parent[key];
  if (!isObject(existing)) {
    const obj: Record<string, unknown> = {};
    parent[key] = obj;
    return obj;
  }
  return existing;
}

function ensureArrayAt(parent: Container, key: string): unknown[] {
  if (Array.isArray(parent)) {
    const idx = Number(key);
    if (Number.isNaN(idx)) {
      throw new Error("Cannot use string key on array");
    }
    const existing = parent[idx];
    if (!Array.isArray(existing)) {
      const arr: unknown[] = [];
      parent[idx] = arr;
      return arr;
    }
    return existing;
  }
  const existing = parent[key];
  if (!Array.isArray(existing)) {
    const arr: unknown[] = [];
    parent[key] = arr;
    return arr;
  }
  return existing;
}

function setIndexed(
  arr: unknown[],
  idx: number,
  value: unknown,
  isLast: boolean,
): void {
  if (isLast) {
    arr[idx] = value;
    return;
  }
  while (arr.length <= idx) arr.push(undefined);
  if (!isObject(arr[idx])) {
    arr[idx] = {};
  }
}

function setPath(root: Record<string, unknown>, tokens: Token[], value: unknown): void {
  let cursor: Container = root;

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
      const obj: Record<string, unknown> = {};
      cursor.push(obj);
      cursor = obj;
      continue;
    }

    if (isIndexToken) {
      if (!Array.isArray(cursor)) return;
      const idx = token as number;
      if (isLast) {
        setIndexed(cursor, idx, value, true);
        return;
      }
      setIndexed(cursor, idx, value, false);
      cursor = cursor[idx] as Container;
      continue;
    }

    const key = token as string;
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
      if (afterPush === undefined) {
        arr.push(value);
        return;
      }
      const obj: Record<string, unknown> = {};
      arr.push(obj);
      cursor = obj;
      continue;
    }

    if (nextIsIndex) {
      const arr = ensureArrayAt(cursor, key);
      const idx = next as number;
      depth += 1;
      const afterIdx = tokens[depth + 1];
      if (afterIdx === undefined) {
        arr[idx] = value;
        return;
      }
      while (arr.length <= idx) arr.push(undefined);
      if (!isObject(arr[idx])) arr[idx] = {};
      cursor = arr[idx] as Container;
      continue;
    }

    cursor = ensureObjectAt(cursor, key);
  }
}

/* --------------------------------- public --------------------------------- */

export interface ParseFormDataOptions {
  /**
   * When `true`, numeric strings (e.g. `"42"`, `"3.14"`) are converted to
   * JavaScript numbers. Defaults to `false` — numbers are left as strings so
   * Zod's `z.coerce.number()` or `z.number()` can handle them at the schema
   * layer, which is usually what you want.
   */
  coerceNumbers?: boolean;
}

export function parseFormData(
  formData: FormData,
  options: ParseFormDataOptions = {},
): Record<string, unknown> | undefined {
  const root: Record<string, unknown> = {};
  const coerceNumbers = options.coerceNumbers ?? false;

  for (const [rawKey, rawValue] of formData.entries()) {
    if (rawValue instanceof File && rawValue.size === 0 && rawValue.name === "") {
      continue;
    }

    const tokens = tokenizeKey(rawKey);
    if (tokens.length === 0) continue;

    const value =
      rawValue instanceof File
        ? rawValue
        : coerceScalar(String(rawValue), coerceNumbers);

    setPath(root, tokens, value);
  }

  if (Object.keys(root).length === 0) return undefined;
  return root;
}
