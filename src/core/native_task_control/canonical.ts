import { createHash } from 'node:crypto';

import { isRecord } from '../../types/native_task_control.js';

export class CanonicalizationError extends Error {
    readonly code: 'INVALID_JSON' | 'DUPLICATE_FIELD' | 'UNKNOWN_FIELD' | 'INVALID_VALUE' | 'NON_CANONICAL_JSON';
    readonly path: string;

    constructor(
        code: CanonicalizationError['code'],
        message: string,
        path = '$',
    ) {
        super(message);
        this.name = 'CanonicalizationError';
        this.code = code;
        this.path = path;
    }
}

function compareKeys(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

/** Return a JSON-compatible value with every object key in byte-stable order. */
export function canonicalize(value: unknown, path = '$'): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new CanonicalizationError('INVALID_VALUE', 'non-finite numbers are not canonical', path);
        }
        return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value === 'bigint' || typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
        throw new CanonicalizationError('INVALID_VALUE', 'value is not JSON-compatible', path);
    }
    if (Array.isArray(value)) {
        return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
    }
    if (!isRecord(value)) {
        throw new CanonicalizationError('INVALID_VALUE', 'value has a non-plain object prototype', path);
    }
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareKeys)) {
        normalized[key] = canonicalize(value[key], `${path}.${key}`);
    }
    return normalized;
}

export function canonicalJson(value: unknown): string {
    const normalized = canonicalize(value);
    const json = JSON.stringify(normalized);
    if (json === undefined) throw new CanonicalizationError('INVALID_VALUE', 'value has no JSON representation');
    return json;
}

export const stableJson = canonicalJson;

export function sha256(value: string | Uint8Array | unknown): string {
    const bytes = typeof value === 'string' || value instanceof Uint8Array
        ? value
        : canonicalJson(value);
    return createHash('sha256').update(bytes).digest('hex');
}

export function hashCanonical(value: unknown): string {
    return sha256(canonicalJson(value));
}

export function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
    if (!isRecord(value)) throw new CanonicalizationError('INVALID_VALUE', `${label} must be an object`, label);
}

export function assertAllowedKeys(
    value: Record<string, unknown>,
    allowed: readonly string[],
    label = '$',
): void {
    const allowedSet = new Set(allowed);
    for (const key of Object.keys(value)) {
        if (!allowedSet.has(key)) {
            throw new CanonicalizationError('UNKNOWN_FIELD', `unknown field ${key}`, `${label}.${key}`);
        }
    }
}

export function assertExactKeys(
    value: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[] = [],
    label = '$',
): void {
    assertAllowedKeys(value, [...required, ...optional], label);
    const keys = new Set(Object.keys(value));
    for (const key of required) {
        if (!keys.has(key)) throw new CanonicalizationError('INVALID_VALUE', `missing field ${key}`, `${label}.${key}`);
    }
}

interface ParseOptions {
    readonly allowedKeys?: readonly string[];
    readonly requireCanonical?: boolean;
}

class JsonReader {
    private index = 0;

    constructor(private readonly source: string) {}

    parse(options: ParseOptions): unknown {
        this.skipWhitespace();
        const result = this.value('$', options);
        this.skipWhitespace();
        if (this.index !== this.source.length) this.fail('trailing bytes');
        if (options.requireCanonical && canonicalJson(result) !== this.source) {
            throw new CanonicalizationError('NON_CANONICAL_JSON', 'JSON bytes are not canonical');
        }
        return result;
    }

    private fail(message: string, path = '$'): never {
        throw new CanonicalizationError('INVALID_JSON', `${message} at byte ${this.index}`, path);
    }

    private skipWhitespace(): void {
        while (this.index < this.source.length && /[\u0009\u000a\u000d\u0020]/.test(this.source[this.index]!)) this.index += 1;
    }

    private value(path: string, options: ParseOptions): unknown {
        const ch = this.source[this.index];
        if (ch === '{') return this.object(path, options);
        if (ch === '[') return this.array(path, options);
        if (ch === '"') return this.string(path);
        if (ch === 't' && this.source.slice(this.index, this.index + 4) === 'true') {
            this.index += 4;
            return true;
        }
        if (ch === 'f' && this.source.slice(this.index, this.index + 5) === 'false') {
            this.index += 5;
            return false;
        }
        if (ch === 'n' && this.source.slice(this.index, this.index + 4) === 'null') {
            this.index += 4;
            return null;
        }
        if (ch && '-0123456789'.includes(ch)) return this.number(path);
        this.fail('expected JSON value', path);
    }

    private object(path: string, options: ParseOptions): Record<string, unknown> {
        this.index += 1;
        this.skipWhitespace();
        const result: Record<string, unknown> = {};
        const seen = new Set<string>();
        if (this.source[this.index] === '}') {
            this.index += 1;
            return result;
        }
        while (this.index < this.source.length) {
            if (this.source[this.index] !== '"') this.fail('object key must be a string', path);
            const key = this.string(`${path}.<key>`);
            if (seen.has(key)) throw new CanonicalizationError('DUPLICATE_FIELD', `duplicate field ${key}`, `${path}.${key}`);
            seen.add(key);
            if (options.allowedKeys && !options.allowedKeys.includes(key)) {
                throw new CanonicalizationError('UNKNOWN_FIELD', `unknown field ${key}`, `${path}.${key}`);
            }
            this.skipWhitespace();
            if (this.source[this.index] !== ':') this.fail('expected colon', `${path}.${key}`);
            this.index += 1;
            this.skipWhitespace();
            result[key] = this.value(`${path}.${key}`, {});
            this.skipWhitespace();
            const delimiter = this.source[this.index];
            if (delimiter === '}') {
                this.index += 1;
                return result;
            }
            if (delimiter !== ',') this.fail('expected comma or closing brace', path);
            this.index += 1;
            this.skipWhitespace();
        }
        this.fail('unterminated object', path);
    }

    private array(path: string, options: ParseOptions): unknown[] {
        this.index += 1;
        this.skipWhitespace();
        const result: unknown[] = [];
        if (this.source[this.index] === ']') {
            this.index += 1;
            return result;
        }
        while (this.index < this.source.length) {
            result.push(this.value(`${path}[${result.length}]`, options));
            this.skipWhitespace();
            const delimiter = this.source[this.index];
            if (delimiter === ']') {
                this.index += 1;
                return result;
            }
            if (delimiter !== ',') this.fail('expected comma or closing bracket', path);
            this.index += 1;
            this.skipWhitespace();
        }
        this.fail('unterminated array', path);
    }

    private string(path: string): string {
        const start = this.index;
        this.index += 1;
        while (this.index < this.source.length) {
            const ch = this.source[this.index]!;
            if (ch === '"') {
                const raw = this.source.slice(start, this.index + 1);
                this.index += 1;
                try {
                    return JSON.parse(raw) as string;
                } catch {
                    throw new CanonicalizationError('INVALID_JSON', 'invalid JSON string', path);
                }
            }
            if (ch === '\\') {
                this.index += 2;
                if (this.index > this.source.length) this.fail('unterminated escape', path);
                continue;
            }
            if (ch < ' ') this.fail('control character in string', path);
            this.index += 1;
        }
        this.fail('unterminated string', path);
    }

    private number(path: string): number {
        const raw = this.source.slice(this.index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/)?.[0];
        if (!raw) this.fail('invalid number', path);
        this.index += raw.length;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) this.fail('number is not finite', path);
        return Object.is(parsed, -0) ? 0 : parsed;
    }
}

export function parseCanonicalJson(source: string, options: ParseOptions = {}): unknown {
    if (typeof source !== 'string') throw new CanonicalizationError('INVALID_JSON', 'JSON input must be text');
    return new JsonReader(source).parse(options);
}

export const parseStrictJson = parseCanonicalJson;

export function assertCanonicalJson(source: string): void {
    parseCanonicalJson(source, { requireCanonical: true });
}
