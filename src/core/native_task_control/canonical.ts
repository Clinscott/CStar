import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import {
    failNativeTaskControl,
    NATIVE_TASK_CONTROL_ERROR_CODES,
} from './errors.js';
import type { JsonValue } from '../../types/native_task_control.js';

export type NativeJsonInput = string | Uint8Array | ArrayBuffer;

export type NativeJsonKeyAllowlist =
    | readonly string[]
    | ReadonlySet<string>
    | Readonly<Record<string, readonly string[] | ReadonlySet<string>>>
    | ((path: readonly string[], key: string) => boolean);

export interface StrictNativeJsonOptions {
    allowedKeys?: NativeJsonKeyAllowlist;
    allowlist?: NativeJsonKeyAllowlist;
}

type ParsedObject = {
    kind: 'object';
    entries: Array<{ key: string; value: ParsedJson }>;
};

type ParsedJson = JsonValue | ParsedObject;

function isParsedObject(value: ParsedJson): value is ParsedObject {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as { kind?: unknown; entries?: unknown };
    return candidate.kind === 'object' && Array.isArray(candidate.entries);
}

const PROTOTYPE_MUTATING_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const HEX_DIGITS = /^[0-9a-fA-F]$/;
const JSON_WHITESPACE = new Set([' ', '\t', '\r', '\n']);

function pathText(path: readonly string[]): string {
    return path.length === 0 ? '$' : `$${path.map((part) => `.${part}`).join('')}`;
}

function failInvalid(path: readonly string[], reason: string): never {
    return failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON, {
        path: pathText(path),
        reason,
    });
}

function failPrototype(path: readonly string[], key: string): never {
    return failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.PROTOTYPE_KEY, {
        key,
        path: pathText([...path, key]),
    });
}

function isWellFormedString(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(index + 1);
            if (next < 0xdc00 || next > 0xdfff) return false;
            index += 1;
        } else if (code >= 0xdc00 && code <= 0xdfff) {
            return false;
        }
    }
    return true;
}

function decodeInput(input: NativeJsonInput): string {
    if (typeof input === 'string') return input;
    let bytes: Uint8Array;
    if (input instanceof Uint8Array) {
        bytes = input;
    } else if (input instanceof ArrayBuffer) {
        bytes = new Uint8Array(input);
    } else {
        return failInvalid([], 'input must be a string or UTF-8 bytes');
    }

    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return failInvalid([], 'invalid UTF-8');
    }
}

function isStringList(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function allowlistForObject(
    allowlist: NativeJsonKeyAllowlist | undefined,
    path: readonly string[],
): readonly string[] | ReadonlySet<string> | ((path: readonly string[], key: string) => boolean) | undefined {
    if (allowlist === undefined) return undefined;
    if (typeof allowlist === 'function') return allowlist;
    if (Array.isArray(allowlist) || allowlist instanceof Set) return allowlist;

    const map = allowlist as Readonly<Record<string, readonly string[] | ReadonlySet<string>>>;
    const pathKey = path.join('.');
    const candidates = path.length === 0
        ? ['', '*']
        : [pathKey, `${pathKey}.*`, '*'];
    for (const candidate of candidates) {
        if (Object.prototype.hasOwnProperty.call(map, candidate)) return map[candidate];
    }
    return undefined;
}

function assertAllowedKey(
    allowlist: NativeJsonKeyAllowlist | undefined,
    path: readonly string[],
    key: string,
): void {
    const allowed = allowlistForObject(allowlist, path);
    if (allowed === undefined) return;
    const isAllowed = allowed instanceof Set
        ? allowed.has(key)
        : Array.isArray(allowed)
            ? allowed.includes(key)
            : typeof allowed === 'function'
                ? allowed(path, key)
                : false;
    if (!isAllowed) {
        failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.UNKNOWN_FIELD, {
            key,
            path: pathText([...path, key]),
        });
    }
}

function assertSafeNumber(value: number, path: readonly string[]): void {
    if (!Number.isFinite(value)) failInvalid(path, 'non-finite number');
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        failInvalid(path, 'unsafe integer');
    }
}

class JsonReader {
    private position = 0;

    constructor(
        private readonly source: string,
        private readonly options: StrictNativeJsonOptions,
    ) {}

    read(): ParsedJson {
        this.skipWhitespace();
        const value = this.readValue([]);
        this.skipWhitespace();
        if (this.position !== this.source.length) failInvalid([], 'trailing bytes');
        return value;
    }

    private current(): string | undefined {
        return this.source[this.position];
    }

    private skipWhitespace(): void {
        while (this.current() !== undefined && JSON_WHITESPACE.has(this.current() as string)) {
            this.position += 1;
        }
    }

    private expect(character: string, path: readonly string[]): void {
        if (this.current() !== character) failInvalid(path, `expected ${character}`);
        this.position += 1;
    }

    private readValue(path: readonly string[]): ParsedJson {
        const character = this.current();
        if (character === undefined) failInvalid(path, 'unexpected end of input');
        if (character === '"') return this.readString(path);
        if (character === '{') return this.readObject(path);
        if (character === '[') return this.readArray(path);
        if (character === 't') return this.readLiteral('true', true, path);
        if (character === 'f') return this.readLiteral('false', false, path);
        if (character === 'n') return this.readLiteral('null', null, path);
        if (character === '-' || (character >= '0' && character <= '9')) {
            return this.readNumber(path);
        }
        failInvalid(path, 'unexpected token');
    }

    private readLiteral<T extends boolean | null>(
        literal: string,
        value: T,
        path: readonly string[],
    ): T {
        if (this.source.slice(this.position, this.position + literal.length) !== literal) {
            failInvalid(path, 'invalid literal');
        }
        this.position += literal.length;
        return value;
    }

    private readString(path: readonly string[]): string {
        this.expect('"', path);
        let result = '';
        while (this.position < this.source.length) {
            const code = this.source.charCodeAt(this.position);
            this.position += 1;
            if (code === 0x22) {
                if (!isWellFormedString(result)) failInvalid(path, 'unpaired surrogate');
                return result;
            }
            if (code < 0x20) failInvalid(path, 'control character in string');
            if (code === 0x5c) {
                result += this.readEscape(path);
                continue;
            }
            if (code >= 0xd800 && code <= 0xdbff) {
                const next = this.source.charCodeAt(this.position);
                if (next < 0xdc00 || next > 0xdfff) failInvalid(path, 'unpaired surrogate');
                result += String.fromCharCode(code, next);
                this.position += 1;
                continue;
            }
            if (code >= 0xdc00 && code <= 0xdfff) failInvalid(path, 'unpaired surrogate');
            result += String.fromCharCode(code);
        }
        failInvalid(path, 'unterminated string');
    }

    private readEscape(path: readonly string[]): string {
        const escape = this.current();
        if (escape === undefined) failInvalid(path, 'unterminated escape');
        this.position += 1;
        if (escape === '"' || escape === '\\' || escape === '/') return escape;
        if (escape === 'b') return '\b';
        if (escape === 'f') return '\f';
        if (escape === 'n') return '\n';
        if (escape === 'r') return '\r';
        if (escape === 't') return '\t';
        if (escape !== 'u') failInvalid(path, 'invalid escape');

        if (this.position + 4 > this.source.length) failInvalid(path, 'short unicode escape');
        const digits = this.source.slice(this.position, this.position + 4);
        if (![...digits].every((digit) => HEX_DIGITS.test(digit))) {
            failInvalid(path, 'invalid unicode escape');
        }
        this.position += 4;
        const code = Number.parseInt(digits, 16);
        if (code >= 0xd800 && code <= 0xdbff) {
            if (this.source.slice(this.position, this.position + 2) !== '\\u') {
                failInvalid(path, 'unpaired surrogate escape');
            }
            this.position += 2;
            const lowDigits = this.source.slice(this.position, this.position + 4);
            if (lowDigits.length !== 4 || ![...lowDigits].every((digit) => HEX_DIGITS.test(digit))) {
                failInvalid(path, 'invalid low surrogate escape');
            }
            const low = Number.parseInt(lowDigits, 16);
            if (low < 0xdc00 || low > 0xdfff) failInvalid(path, 'invalid low surrogate escape');
            this.position += 4;
            return String.fromCharCode(code, low);
        }
        if (code >= 0xdc00 && code <= 0xdfff) failInvalid(path, 'unpaired surrogate escape');
        return String.fromCharCode(code);
    }

    private readNumber(path: readonly string[]): number {
        const start = this.position;
        if (this.current() === '-') this.position += 1;
        const first = this.current();
        if (first === '0') {
            this.position += 1;
            const next = this.current();
            if (next !== undefined && next >= '0' && next <= '9') {
                failInvalid(path, 'leading zero');
            }
        } else if (first !== undefined && first >= '1' && first <= '9') {
            this.position += 1;
            while (this.current() !== undefined && /[0-9]/.test(this.current() as string)) {
                this.position += 1;
            }
        } else {
            failInvalid(path, 'invalid number');
        }
        if (this.current() === '.') {
            this.position += 1;
            const fractionStart = this.position;
            while (this.current() !== undefined && /[0-9]/.test(this.current() as string)) {
                this.position += 1;
            }
            if (this.position === fractionStart) failInvalid(path, 'empty fraction');
        }
        if (this.current() === 'e' || this.current() === 'E') {
            this.position += 1;
            if (this.current() === '+' || this.current() === '-') this.position += 1;
            const exponentStart = this.position;
            while (this.current() !== undefined && /[0-9]/.test(this.current() as string)) {
                this.position += 1;
            }
            if (this.position === exponentStart) failInvalid(path, 'empty exponent');
        }
        const token = this.source.slice(start, this.position);
        const value = Number(token);
        assertSafeNumber(value, path);
        return value;
    }

    private readArray(path: readonly string[]): ParsedJson[] {
        this.expect('[', path);
        const values: ParsedJson[] = [];
        this.skipWhitespace();
        if (this.current() === ']') {
            this.position += 1;
            return values;
        }
        while (true) {
            values.push(this.readValue([...path, String(values.length)]));
            this.skipWhitespace();
            if (this.current() === ']') {
                this.position += 1;
                return values;
            }
            this.expect(',', path);
            this.skipWhitespace();
        }
    }

    private readObject(path: readonly string[]): ParsedObject {
        this.expect('{', path);
        const entries: Array<{ key: string; value: ParsedJson }> = [];
        const seen = new Set<string>();
        const allowlist = this.options.allowedKeys ?? this.options.allowlist;
        this.skipWhitespace();
        if (this.current() === '}') {
            this.position += 1;
            return { kind: 'object', entries };
        }
        while (true) {
            if (this.current() !== '"') failInvalid(path, 'object key must be a string');
            const key = this.readString(path);
            if (PROTOTYPE_MUTATING_KEYS.has(key)) failPrototype(path, key);
            if (seen.has(key)) {
                failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.DUPLICATE_FIELD, {
                    key,
                    path: pathText([...path, key]),
                });
            }
            assertAllowedKey(allowlist, path, key);
            seen.add(key);
            this.skipWhitespace();
            this.expect(':', [...path, key]);
            this.skipWhitespace();
            const value = this.readValue([...path, key]);
            entries.push({ key, value });
            this.skipWhitespace();
            if (this.current() === '}') {
                this.position += 1;
                return { kind: 'object', entries };
            }
            this.expect(',', path);
            this.skipWhitespace();
        }
    }
}

function materialize(value: ParsedJson): JsonValue {
    if (value !== null && typeof value === 'object') {
        if (Array.isArray(value)) return value.map((item) => materialize(item));
        if (isParsedObject(value)) {
            const object: { [key: string]: JsonValue } = {};
            for (const entry of value.entries) {
                Object.defineProperty(object, entry.key, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: materialize(entry.value),
                });
            }
            return object;
        }
    }
    return value as JsonValue;
}

function canonicalString(value: string, path: readonly string[]): string {
    if (!isWellFormedString(value)) failInvalid(path, 'unpaired surrogate');
    return JSON.stringify(value);
}

function canonicalNumber(value: number, path: readonly string[]): string {
    assertSafeNumber(value, path);
    const encoded = JSON.stringify(value);
    if (encoded === undefined) failInvalid(path, 'number cannot be encoded');
    return encoded;
}

function canonicalValue(
    value: unknown,
    path: readonly string[],
    ancestors: WeakSet<object>,
): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return canonicalString(value, path);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return canonicalNumber(value, path);
    if (typeof value !== 'object') failInvalid(path, 'value is not JSON');

    if (ancestors.has(value)) failInvalid(path, 'cyclic value');
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            const prototype = Object.getPrototypeOf(value);
            if (prototype !== Array.prototype && prototype !== null) {
                failInvalid(path, 'array has an unsafe prototype');
            }
            const ownKeys = Reflect.ownKeys(value);
            for (const key of ownKeys) {
                if (typeof key === 'symbol') failInvalid(path, 'symbol array property');
                if (key === 'length') continue;
                if (!/^(0|[1-9][0-9]*)$/.test(key)) failInvalid(path, 'extra array property');
                const index = Number(key);
                if (!Number.isSafeInteger(index) || index >= value.length) {
                    failInvalid([...path, key], 'invalid array index');
                }
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
                    failInvalid([...path, key], 'array property is not a data property');
                }
            }
            const items: string[] = [];
            for (let index = 0; index < value.length; index += 1) {
                if (!Object.prototype.hasOwnProperty.call(value, String(index))) {
                    failInvalid([...path, String(index)], 'array has a hole');
                }
                items.push(canonicalValue(value[index], [...path, String(index)], ancestors));
            }
            return `[${items.join(',')}]`;
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            failInvalid(path, 'object has an unsafe prototype');
        }
        const ownKeys = Reflect.ownKeys(value);
        if (ownKeys.some((key) => typeof key === 'symbol')) failInvalid(path, 'symbol object property');
        const keys = ownKeys as string[];
        const values: string[] = [];
        for (const key of keys) {
            if (PROTOTYPE_MUTATING_KEYS.has(key)) failPrototype(path, key);
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
                failInvalid([...path, key], 'object property is not an enumerable data property');
            }
            values.push(key);
        }
        values.sort();
        return `{${values.map((key) => `${canonicalString(key, path)}:${canonicalValue((value as { [key: string]: unknown })[key], [...path, key], ancestors)}`).join(',')}}`;
    } finally {
        ancestors.delete(value);
    }
}

export function canonicalNativeJson(value: unknown): string {
    return canonicalValue(value, [], new WeakSet<object>());
}

export function hashCanonicalNative(value: unknown): string {
    return createHash('sha256')
        .update(Buffer.from(canonicalNativeJson(value), 'utf8'))
        .digest('hex');
}

export function parseStrictNativeJson(
    input: NativeJsonInput,
    options: StrictNativeJsonOptions = {},
): JsonValue {
    const source = decodeInput(input);
    if (!isWellFormedString(source)) failInvalid([], 'unpaired surrogate');
    return materialize(new JsonReader(source, options).read());
}

export function assertCanonicalNativeJson(
    input: NativeJsonInput,
    options: StrictNativeJsonOptions = {},
): JsonValue {
    const source = decodeInput(input);
    const parsed = parseStrictNativeJson(source, options);
    const canonical = canonicalNativeJson(parsed);
    if (source !== canonical) {
        failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.NON_CANONICAL, {
            expected_sha256: createHash('sha256').update(canonical, 'utf8').digest('hex'),
        });
    }
    return parsed;
}
