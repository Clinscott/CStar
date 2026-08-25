const MAX_ATTACHMENT_JSON_BYTES = 4 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

class DuplicateSafeJsonScanner {
    private offset = 0;

    constructor(
        private readonly source: string,
        private readonly failureCode: string,
    ) {}

    scan(): void {
        if (Buffer.byteLength(this.source, 'utf-8') > MAX_ATTACHMENT_JSON_BYTES) this.fail();
        this.skipWhitespace();
        this.parseValue();
        this.skipWhitespace();
        if (this.offset !== this.source.length) this.fail();
    }

    private fail(): never {
        throw new Error(this.failureCode);
    }

    private skipWhitespace(): void {
        while (/[\t\n\r ]/u.test(this.source[this.offset] ?? '')) this.offset += 1;
    }

    private consume(expected: string): void {
        if (this.source[this.offset] !== expected) this.fail();
        this.offset += 1;
    }

    private parseValue(): void {
        this.skipWhitespace();
        const current = this.source[this.offset];
        if (current === '{') this.parseObject();
        else if (current === '[') this.parseArray();
        else if (current === '"') this.parseString();
        else if (current === '-' || /[0-9]/u.test(current ?? '')) this.parseNumber();
        else if (this.source.startsWith('true', this.offset)) this.offset += 4;
        else if (this.source.startsWith('false', this.offset)) this.offset += 5;
        else if (this.source.startsWith('null', this.offset)) this.offset += 4;
        else this.fail();
    }

    private parseObject(): void {
        this.consume('{');
        this.skipWhitespace();
        if (this.source[this.offset] === '}') {
            this.offset += 1;
            return;
        }
        const keys = new Set<string>();
        while (true) {
            this.skipWhitespace();
            if (this.source[this.offset] !== '"') this.fail();
            const key = this.parseString();
            if (keys.has(key)) this.fail();
            keys.add(key);
            this.skipWhitespace();
            this.consume(':');
            this.parseValue();
            this.skipWhitespace();
            const delimiter = this.source[this.offset];
            if (delimiter === '}') {
                this.offset += 1;
                return;
            }
            this.consume(',');
        }
    }

    private parseArray(): void {
        this.consume('[');
        this.skipWhitespace();
        if (this.source[this.offset] === ']') {
            this.offset += 1;
            return;
        }
        while (true) {
            this.parseValue();
            this.skipWhitespace();
            const delimiter = this.source[this.offset];
            if (delimiter === ']') {
                this.offset += 1;
                return;
            }
            this.consume(',');
        }
    }

    private parseString(): string {
        const start = this.offset;
        this.consume('"');
        while (this.offset < this.source.length) {
            const current = this.source[this.offset]!;
            if (current === '"') {
                this.offset += 1;
                try {
                    const value = JSON.parse(this.source.slice(start, this.offset)) as unknown;
                    if (typeof value !== 'string') this.fail();
                    return value;
                } catch {
                    this.fail();
                }
            }
            if (current === '\\') {
                this.offset += 1;
                const escaped = this.source[this.offset];
                if (escaped === 'u') {
                    if (!/^[a-f0-9]{4}$/i.test(this.source.slice(this.offset + 1, this.offset + 5))) {
                        this.fail();
                    }
                    this.offset += 5;
                    continue;
                }
                if (!escaped || !/["\\/bfnrt]/u.test(escaped)) this.fail();
                this.offset += 1;
                continue;
            }
            if (current.charCodeAt(0) < 0x20) this.fail();
            this.offset += 1;
        }
        this.fail();
    }

    private parseNumber(): void {
        const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u
            .exec(this.source.slice(this.offset));
        if (!match) this.fail();
        this.offset += match[0].length;
    }
}

/** Parse one bounded JSON object while rejecting duplicate keys at every depth. */
export function parseAttachmentJsonObject(value: string, failureCode: string): Record<string, unknown> {
    try {
        new DuplicateSafeJsonScanner(value, failureCode).scan();
        const parsed = JSON.parse(value) as unknown;
        if (!isRecord(parsed)) throw new Error(failureCode);
        return parsed;
    } catch {
        throw new Error(failureCode);
    }
}
