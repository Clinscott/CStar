import { createHash } from 'node:crypto';

import type { JsonValue } from '../../types/native_task_control.js';
import { failNativeTaskControl } from './errors.js';

export type NativeJsonInput = string | Uint8Array | ArrayBuffer | ArrayBufferView;

export interface NativeJsonParseOptions {
    /** Allowlist applied to object keys at the document root. */
    readonly allowedKeys?: readonly string[] | ReadonlySet<string>;
    /** Alias accepted for callers that use the contract's allowlist wording. */
    readonly allowlist?: readonly string[] | ReadonlySet<string>;
    readonly maxDepth?: number;
}

function invalidJson(details: Record<string, unknown> = {}): never {
    return failNativeTaskControl('CSTAR_NATIVE_TASK_INVALID_JSON', details);
}

function ensureUnicodeScalarString(value: string, path: string): void {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(index + 1);
            if (next < 0xdc00 || next > 0xdfff) {
                invalidJson({ path, reason: 'unpaired_high_surrogate' });
            }
            index += 1;
        } else if (code >= 0xdc00 && code <= 0xdfff) {
            invalidJson({ path, reason: 'unpaired_low_surrogate' });
        }
    }
}

function decodeNativeJsonInput(input: NativeJsonInput): { text: string; bytes: Uint8Array } {
    if (typeof input === 'string') {
        ensureUnicodeScalarString(input, '$');
        return { text: input, bytes: new TextEncoder().encode(input) };
    }

    let bytes: Uint8Array;
    if (input instanceof Uint8Array) {
        bytes = input;
    } else if (input instanceof ArrayBuffer) {
        bytes = new Uint8Array(input);
    } else if (ArrayBuffer.isView(input)) {
        bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    } else {
        return invalidJson({ reason: 'input_is_not_utf8_json' });
    }

    let text: string;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return invalidJson({ reason: 'invalid_utf8' });
    }
    ensureUnicodeScalarString(text, '$');
    return { text, bytes };
}

function isSafeNativeNumber(value: number): boolean {
    if (!Number.isFinite(value)) return false;
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) return false;
    return true;
}

function serializeNativeJson(value: unknown, path: string, ancestors: Set<object>): string {
    if (value === null) return 'null';

    switch (typeof value) {
        case 'string':
            ensureUnicodeScalarString(value, path);
            return JSON.stringify(value);
        case 'boolean':
            return value ? 'true' : 'false';
        case 'number':
            if (!isSafeNativeNumber(value)) {
                return failNativeTaskControl('CSTAR_NATIVE_TASK_INVALID_JSON', {
                    path,
                    reason: 'unsafe_or_non_finite_number',
                });
            }
            return Object.is(value, -0) ? '0' : String(value);
        case 'undefined':
        case 'bigint':
        case 'function':
        case 'symbol':
            return failNativeTaskControl('CSTAR_NATIVE_TASK_INVALID_JSON', {
                path,
                reason: `unsupported_${typeof value}`,
            });
        default:
            break;
    }

    if (typeof value !== 'object' || value === null) {
        return failNativeTaskControl('CSTAR_NATIVE_TASK_INVALID_JSON', { path });
    }
    if (ancestors.has(value)) {
        return failNativeTaskControl('CSTAR_NATIVE_TASK_INVALID_JSON', {
            path,
            reason: 'cyclic_value',
        });
    }
    ancestors.add(value);

    let result: string;
    if (Array.isArray(value)) {
        const parts: string[] = [];
        for (let index = 0; index < value.length; index += 1) {
            if (!Object.prototype.hasOwnProperty.call(value, index)) {
                ancestors.delete(value);
                return failNativeTaskControl('CSTAR_NATIVE_TASK_INVALID_JSON', {
                    path: `${path}[${index}]`,
                    reason: 'array_hole',
                });
            }
            parts.push(serializeNativeJson(value[index], `${path}[${index}]`, ancestors));
        }
        result = `[${parts.join(',')}]`;
    } else {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            ancestors.delete(value);
            return failNativeTaskControl('CSTAR_NATIVE_TASK_INVALID_JSON', {
                path,
                reason: 'non_plain_object',
            });
        }
        for (const key of Reflect.ownKeys(value)) {
            if (typeof key !== 'string') {
                ancestors.delete(value);
                return failNativeTaskControl('CSTAR_NATIVE_TASK_INVALID_JSON', {
                    path,
                    reason: 'symbol_key',
                });
            }
        }
        const keys = Object.keys(value).sort();
        const parts: string[] = [];
        for (const key of keys) {
            parts.push(`${JSON.stringify(key)}:${serializeNativeJson(
                (value as Record<string, unknown>)[key],
                `${path}.${key}`,
                ancestors,
            )}`);
        }
        result = `{${parts.join(',')}}`;
    }

    ancestors.delete(value);
    return result;
}

/** Return the whitespace-free, recursively key-sorted JSON representation. */
export function canonicalNativeJson(value: JsonValue): string {
    return serializeNativeJson(value, '$', new Set<object>());
}

function isHexDigit(value: string | undefined): boolean {
    return value !== undefined && /^[0-9a-fA-F]$/.test(value);
}

class StrictNativeJsonParser {
    private readonly text: string;
    private readonly options: NativeJsonParseOptions;
    private index = 0;
    private readonly rootAllowedKeys?: ReadonlySet<string>;

    constructor(text: string, options: NativeJsonParseOptions) {
        this.text = text;
        this.options = options;
        const allowlist = options.allowedKeys ?? options.allowlist;
        if (allowlist !== undefined) {
            this.rootAllowedKeys = allowlist instanceof Set
                ? allowlist
                : new Set(allowlist);
        }
    }

    parse(): JsonValue {
        this.skipWhitespace();
        const value = this.parseValue('$', 0);
        this.skipWhitespace();
        if (this.index !== this.text.length) {
            this.fail('trailing_bytes');
        }
        return value;
    }

    private fail(reason: string, details: Record<string, unknown> = {}): never {
        return failNativeTaskControl('CSTAR_NATIVE_TASK_INVALID_JSON', {
            ...details,
            position: this.index,
            reason,
        });
    }

    private skipWhitespace(): void {
        while (
            this.text[this.index] === ' '
            || this.text[this.index] === '\n'
            || this.text[this.index] === '\r'
            || this.text[this.index] === '\t'
        ) {
            this.index += 1;
        }
    }

    private parseValue(path: string, depth: number): JsonValue {
        const maxDepth = this.options.maxDepth ?? 128;
        if (depth > maxDepth) this.fail('maximum_depth_exceeded', { path, maxDepth });
        this.skipWhitespace();
        const current = this.text[this.index];
        if (current === '{') return this.parseObject(path, depth);
        if (current === '[') return this.parseArray(path, depth);
        if (current === '"') return this.parseString(path);
        if (current === 't' && this.consumeLiteral('true')) return true;
        if (current === 'f' && this.consumeLiteral('false')) return false;
        if (current === 'n' && this.consumeLiteral('null')) return null;
        if (current === '-' || (current !== undefined && /[0-9]/.test(current))) {
            return this.parseNumber(path);
        }
        this.fail('unexpected_value', { path, token: current ?? 'eof' });
    }

    private consumeLiteral(literal: string): boolean {
        if (this.text.slice(this.index, this.index + literal.length) !== literal) {
            this.fail('invalid_literal');
        }
        this.index += literal.length;
        return true;
    }

    private parseObject(path: string, depth: number): JsonValue {
        this.index += 1;
        this.skipWhitespace();
        const result: Record<string, JsonValue> = {};
        const seen = new Set<string>();
        if (this.text[this.index] === '}') {
            this.index += 1;
            return result;
        }

        while (this.index < this.text.length) {
            this.skipWhitespace();
            if (this.text[this.index] !== '"') this.fail('object_key_expected', { path });
            const key = this.parseString(`${path}.<key>`);
            if (seen.has(key)) {
                failNativeTaskControl('CSTAR_NATIVE_TASK_DUPLICATE_FIELD', {
                    key,
                    path,
                });
            }
            seen.add(key);
            if (depth === 0 && this.rootAllowedKeys && !this.rootAllowedKeys.has(key)) {
                failNativeTaskControl('CSTAR_NATIVE_TASK_UNKNOWN_FIELD', { key, path });
            }
            this.skipWhitespace();
            if (this.text[this.index] !== ':') this.fail('object_colon_expected', { path, key });
            this.index += 1;
            result[key] = this.parseValue(`${path}.${key}`, depth + 1);
            this.skipWhitespace();
            if (this.text[this.index] === '}') {
                this.index += 1;
                return result;
            }
            if (this.text[this.index] !== ',') this.fail('object_comma_expected', { path });
            this.index += 1;
        }
        this.fail('unterminated_object', { path });
    }

    private parseArray(path: string, depth: number): JsonValue {
        this.index += 1;
        this.skipWhitespace();
        const result: JsonValue[] = [];
        if (this.text[this.index] === ']') {
            this.index += 1;
            return result;
        }
        while (this.index < this.text.length) {
            result.push(this.parseValue(`${path}[${result.length}]`, depth + 1));
            this.skipWhitespace();
            if (this.text[this.index] === ']') {
                this.index += 1;
                return result;
            }
            if (this.text[this.index] !== ',') this.fail('array_comma_expected', { path });
            this.index += 1;
            this.skipWhitespace();
            if (this.text[this.index] === ']') this.fail('array_trailing_comma', { path });
        }
        this.fail('unterminated_array', { path });
    }

    private parseString(path: string): string {
        if (this.text[this.index] !== '"') this.fail('string_expected', { path });
        this.index += 1;
        let result = '';
        while (this.index < this.text.length) {
            const code = this.text.charCodeAt(this.index);
            if (code === 0x22) {
                this.index += 1;
                ensureUnicodeScalarString(result, path);
                return result;
            }
            if (code < 0x20) this.fail('unescaped_control_character', { path });
            if (code !== 0x5c) {
                result += this.text[this.index];
                this.index += 1;
                continue;
            }

            this.index += 1;
            const escape = this.text[this.index];
            const simpleEscapes: Record<string, string> = {
                '"': '"',
                '\\': '\\',
                '/': '/',
                b: '\b',
                f: '\f',
                n: '\n',
                r: '\r',
                t: '\t',
            };
            if (escape !== undefined && escape in simpleEscapes) {
                result += simpleEscapes[escape];
                this.index += 1;
                continue;
            }
            if (escape !== 'u') this.fail('invalid_string_escape', { path });
            const first = this.readUnicodeEscape(path);
            if (first >= 0xd800 && first <= 0xdbff) {
                if (this.text[this.index] !== '\\' || this.text[this.index + 1] !== 'u') {
                    this.fail('unpaired_high_surrogate', { path });
                }
                this.index += 1;
                const second = this.readUnicodeEscape(path);
                if (second < 0xdc00 || second > 0xdfff) {
                    this.fail('invalid_surrogate_pair', { path });
                }
                result += String.fromCodePoint(
                    0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00),
                );
            } else if (first >= 0xdc00 && first <= 0xdfff) {
                this.fail('unpaired_low_surrogate', { path });
            } else {
                result += String.fromCharCode(first);
            }
        }
        this.fail('unterminated_string', { path });
    }

    private readUnicodeEscape(path: string): number {
        const start = this.index + 1;
        const digits = this.text.slice(start, start + 4);
        if (digits.length !== 4 || [...digits].some((digit) => !isHexDigit(digit))) {
            this.fail('invalid_unicode_escape', { path });
        }
        this.index = start + 4;
        return Number.parseInt(digits, 16);
    }

    private parseNumber(path: string): number {
        const match = this.text.slice(this.index).match(
            /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/,
        );
        if (!match) this.fail('invalid_number', { path });
        const token = match[0];
        this.index += token.length;
        const value = Number(token);
        if (!isSafeNativeNumber(value)) {
            failNativeTaskControl('CSTAR_NATIVE_TASK_INVALID_JSON', {
                path,
                reason: 'unsafe_or_non_finite_number',
            });
        }
        return value;
    }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    if (left.byteLength !== right.byteLength) return false;
    for (let index = 0; index < left.byteLength; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

/** Parse JSON while rejecting duplicate keys and unsafe/non-finite numbers. */
export function parseStrictNativeJson(
    input: NativeJsonInput,
    options: NativeJsonParseOptions = {},
): JsonValue {
    const decoded = decodeNativeJsonInput(input);
    return new StrictNativeJsonParser(decoded.text, options).parse();
}

/** Parse and require the exact canonical UTF-8 byte representation. */
export function assertCanonicalNativeJson(
    input: NativeJsonInput,
    options: NativeJsonParseOptions = {},
): JsonValue {
    const decoded = decodeNativeJsonInput(input);
    const parsed = new StrictNativeJsonParser(decoded.text, options).parse();
    const canonical = new TextEncoder().encode(canonicalNativeJson(parsed));
    if (!equalBytes(decoded.bytes, canonical)) {
        return failNativeTaskControl('CSTAR_NATIVE_TASK_NON_CANONICAL', {
            expected_sha256: createHash('sha256').update(canonical).digest('hex'),
        });
    }
    return parsed;
}

/** Hash the exact canonical UTF-8 bytes using lowercase SHA-256. */
export function hashCanonicalNative(value: JsonValue): string {
    return createHash('sha256')
        .update(new TextEncoder().encode(canonicalNativeJson(value)))
        .digest('hex');
}
