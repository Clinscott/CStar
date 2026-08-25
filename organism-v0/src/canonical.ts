import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

export type CanonicalJsonPrimitive = null | boolean | number | string;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

type JsonRecord = Record<string, unknown>;

const hasOwn = Object.prototype.hasOwnProperty;

function isPlainRecord(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalize(value: unknown, path: string): CanonicalJsonValue {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`Non-finite number at ${path}`);
      }
      return value;
    case "object":
      break;
    default:
      throw new TypeError(`Unsupported JSON value at ${path}`);
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => normalize(entry, `${path}[${index}]`));
  }

  if (!isPlainRecord(value)) {
    throw new TypeError(`Expected a plain JSON object at ${path}`);
  }

  const sorted: Record<string, CanonicalJsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = normalize(value[key], `${path}.${key}`);
  }
  return sorted;
}

/**
 * Return compact sorted-key JSON with one final LF.
 * Object keys are sorted recursively. Array order is preserved.
 */
export function canonicalJson(value: unknown): string {
  const normalized = normalize(value, "$root");
  const encoded = JSON.stringify(normalized);
  if (encoded === undefined) {
    throw new TypeError("Value cannot be represented as canonical JSON");
  }
  return `${encoded}\n`;
}

export const canonicalize = canonicalJson;

/** Return canonical JSON as UTF-8 bytes. */
export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalJson(value), "utf8");
}

export const canonicalUtf8 = canonicalBytes;

function inputBytes(input: string | Uint8Array): Buffer {
  return typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
}

/** Hash raw UTF-8 text or bytes. */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(inputBytes(input)).digest("hex");
}

/** Hash canonical JSON bytes. */
export function canonicalSha256(value: unknown): string {
  return sha256Hex(canonicalBytes(value));
}

export const hashCanonical = canonicalSha256;
export const sha256Canonical = canonicalSha256;

function withoutField(value: unknown, field: string): JsonRecord {
  if (!isPlainRecord(value)) {
    throw new TypeError("Self-hashed values must be plain JSON objects");
  }
  if (field.length === 0) {
    throw new TypeError("Self-hash field must not be empty");
  }
  const copy: JsonRecord = { ...value };
  delete copy[field];
  return copy;
}

/** Hash canonical JSON after omitting exactly the named self-hash field. */
export function hashOmittingField(value: unknown, field: string): string {
  return canonicalSha256(withoutField(value, field));
}

export const omitSelfHash = hashOmittingField;
export const hashWithoutField = hashOmittingField;

/** Add or replace one self-hash field, hashing all other fields only. */
export function withSelfHash<T extends JsonRecord>(value: T, field: string): T & Record<string, string> {
  const copy = withoutField(value, field) as T & Record<string, string>;
  copy[field] = hashOmittingField(value, field);
  return copy;
}

/** Verify a self-hash field without accepting malformed values. */
export function verifySelfHash(value: unknown, field: string): boolean {
  if (!isPlainRecord(value) || !hasOwn.call(value, field) || typeof value[field] !== "string") {
    return false;
  }
  try {
    return value[field] === hashOmittingField(value, field);
  } catch {
    return false;
  }
}

export function isPlainJsonObject(value: unknown): value is JsonRecord {
  return isPlainRecord(value);
}
