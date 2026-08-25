import { createHash } from 'node:crypto';

import {
    NATIVE_TASK_CONTROL_ERROR_CODES,
    NativeTaskControlError,
    failNativeTaskControl,
} from './errors.js';

export type CanonicalJsonPrimitive = null | boolean | number | string;
export type CanonicalJsonValue =
    | CanonicalJsonPrimitive
    | CanonicalJsonValue[]
    | { readonly [key: string]: CanonicalJsonValue };

function decodeUtf8(input: string | Uint8Array): string {
    if (typeof input === 'string') {
        if (input.charCodeAt(0) === 0xfeff) {
            failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.invalid_utf8, { reason: 'bom' });
        }
        return input;
    }
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(input);
        if (text.charCodeAt(0) === 0xfeff) {
            failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.invalid_utf8, { reason: 'bom' });
        }
        return text;
    } catch (error) {
        if (error instanceof NativeTaskControlError) throw error;
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.invalid_utf8);
    }
}

class StrictJsonParser {
    private readonly text: string;
    private index = 0;

    constructor(text: string) {
        this.text = text;
    }

    parse(): unknown {
        this.skipWhitespace();
        const value = this.parseValue();
        this.skipWhitespace();
        if (this.index !== this.text.length) this.invalid('trailing_bytes');
        return value;
    }

    private invalid(reason: string): never {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.invalid_json, {
            offset: this.index,
            reason,
        });
    }

    private skipWhitespace(): void {
        while (this.index < this.text.length && /[\u0009\u000a\u000d\u0020]/.test(this.text[this.index] ?? '')) {
            this.index += 1;
        }
    }

    private parseValue(): unknown {
        const character = this.text[this.index];
        if (character === '{') return this.parseObject();
        if (character === '[') return this.parseArray();
        if (character === '"') return this.parseString();
        if (character === 't' && this.text.slice(this.index, this.index + 4) === 'true') {
            this.index += 4;
            return true;
        }
        if (character === 'f' && this.text.slice(this.index, this.index + 5) === 'false') {
            this.index += 5;
            return false;
        }
        if (character === 'n' && this.text.slice(this.index, this.index + 4) === 'null') {
            this.index += 4;
            return null;
        }
        if (character === '-' || (character !== undefined && /\d/.test(character))) {
            return this.parseNumber();
        }
        this.invalid('value');
    }

    private parseString(): string {
        const start = this.index;
        this.index += 1;
        while (this.index < this.text.length) {
            const character = this.text[this.index];
            if (character === '"') {
                this.index += 1;
                const token = this.text.slice(start, this.index);
                try {
                    return JSON.parse(token) as string;
                } catch {
                    this.invalid('string');
                }
            }
            if (character === '\\') {
                this.index += 1;
                const escape = this.text[this.index];
                if (escape === 'u') {
                    const hex = this.text.slice(this.index + 1, this.index + 5);
                    if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.invalid('unicode_escape');
                    this.index += 5;
                } else if (escape !== '"' && escape !== '\\' && escape !== '/'
                    && escape !== 'b' && escape !== 'f' && escape !== 'n'
                    && escape !== 'r' && escape !== 't') {
                    this.invalid('escape');
                } else {
                    this.index += 1;
                }
                continue;
            }
            if (character !== undefined && character.charCodeAt(0) < 0x20) this.invalid('control_character');
            this.index += 1;
        }
        this.invalid('unterminated_string');
    }

    private parseNumber(): number {
        const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
            this.text.slice(this.index),
        )?.[0];
        if (!token) this.invalid('number');
        const value = Number(token);
        if (!Number.isFinite(value)) this.invalid('number_range');
        this.index += token.length;
        return value;
    }

    private parseArray(): unknown[] {
        this.index += 1;
        this.skipWhitespace();
        const result: unknown[] = [];
        if (this.text[this.index] === ']') {
            this.index += 1;
            return result;
        }
        while (true) {
            result.push(this.parseValue());
            this.skipWhitespace();
            const delimiter = this.text[this.index];
            if (delimiter === ']') {
                this.index += 1;
                return result;
            }
            if (delimiter !== ',') this.invalid('array_delimiter');
            this.index += 1;
            this.skipWhitespace();
            if (this.text[this.index] === ']') this.invalid('array_trailing_comma');
        }
    }

    private parseObject(): Record<string, unknown> {
        this.index += 1;
        this.skipWhitespace();
        const result: Record<string, unknown> = {};
        const seen = new Set<string>();
        if (this.text[this.index] === '}') {
            this.index += 1;
            return result;
        }
        while (true) {
            if (this.text[this.index] !== '"') this.invalid('object_key');
            const key = this.parseString();
            if (seen.has(key)) {
                throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.duplicate_field, {
                    field: key,
                });
            }
            seen.add(key);
            this.skipWhitespace();
            if (this.text[this.index] !== ':') this.invalid('object_colon');
            this.index += 1;
            this.skipWhitespace();
            Object.defineProperty(result, key, {
                configurable: true,
                enumerable: true,
                value: this.parseValue(),
                writable: true,
            });
            this.skipWhitespace();
            const delimiter = this.text[this.index];
            if (delimiter === '}') {
                this.index += 1;
                return result;
            }
            if (delimiter !== ',') this.invalid('object_delimiter');
            this.index += 1;
            this.skipWhitespace();
            if (this.text[this.index] === '}') this.invalid('object_trailing_comma');
        }
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

/** Parse JSON while retaining duplicate-key detection before object materialisation. */
export function parseStrictJson(input: string | Uint8Array): unknown {
    return new StrictJsonParser(decodeUtf8(input)).parse();
}

/** Assert that a parsed record contains only the declared contract fields. */
export function assertKnownFields<T extends Record<string, unknown>>(
    value: unknown,
    allowedFields: readonly string[],
    context = 'object',
): T {
    if (!isPlainObject(value)) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.invalid_input, { context });
    }
    const allowed = new Set(allowedFields);
    const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort()[0];
    if (unknown !== undefined) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.unknown_field, {
            context,
            field: unknown,
        });
    }
    return value as T;
}

export function parseStrictObject<T extends Record<string, unknown>>(
    input: string | Uint8Array,
    allowedFields: readonly string[],
    context = 'object',
): T {
    return assertKnownFields<T>(parseStrictJson(input), allowedFields, context);
}

function canonicalNumber(value: number): string {
    if (!Number.isFinite(value)) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.invalid_input, {
            reason: 'non_finite_number',
        });
    }
    return Object.is(value, -0) ? '0' : String(value);
}

/** Serialize JSON values with sorted object keys and no insignificant bytes. */
export function canonicalize(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return canonicalNumber(value);
    if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`;
    if (!isPlainObject(value)) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.invalid_input, {
            reason: 'non_json_value',
        });
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.invalid_input, {
            reason: 'symbol_key',
        });
    }
    const entries = Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
    return `{${entries.join(',')}}`;
}

export function canonicalBytes(value: unknown): Uint8Array {
    return Buffer.from(canonicalize(value), 'utf8');
}

export function sha256Bytes(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
}

export function canonicalSha256(value: unknown): string {
    return sha256Bytes(canonicalBytes(value));
}

/** Parse and require an already canonical JSON representation. */
export function parseCanonicalJson(
    input: string | Uint8Array,
    options: { readonly allowTrailingLf?: boolean } = {},
): CanonicalJsonValue {
    const text = decodeUtf8(input);
    const parsed = parseStrictJson(text);
    const canonical = canonicalize(parsed);
    const accepted = text === canonical
        || (options.allowTrailingLf === true && text === `${canonical}\n`);
    if (!accepted) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.non_canonical);
    }
    return parsed as CanonicalJsonValue;
}

export const canonicalJson = canonicalize;
export const canonicalHash = canonicalSha256;
export const hashCanonical = canonicalSha256;
export const canonicalizeJson = canonicalize;
export const parseCanonical = parseCanonicalJson;
