/** Deterministic, bounded Python syntax checks used by the Gungnir calculus. */

type PythonTokenKind = 'identifier' | 'punctuation' | 'newline';

interface PythonToken {
    kind: PythonTokenKind;
    value: string;
}

const OPENERS: Readonly<Record<string, string>> = {
    '(': ')',
    '[': ']',
    '{': '}',
};

const CLOSERS = new Set(Object.values(OPENERS));

const HARD_PYTHON_KEYWORDS = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
    'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
    'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

function isIdentifierStart(character: string): boolean {
    return /[A-Za-z_]/.test(character);
}

function isIdentifierPart(character: string): boolean {
    return /[A-Za-z0-9_]/.test(character);
}

function skipPythonString(source: string, start: number): number | null {
    const quote = source[start] ?? '';
    const triple = source.slice(start, start + 3) === quote.repeat(3);
    const delimiterLength = triple ? 3 : 1;
    let escaped = false;

    for (let index = start + delimiterLength; index < source.length; index += 1) {
        const character = source[index] ?? '';
        if (escaped) {
            escaped = false;
            continue;
        }
        if (character === '\\') {
            escaped = true;
            continue;
        }
        if (triple && source.slice(index, index + 3) === quote.repeat(3)) {
            return index + 3;
        }
        if (!triple && character === quote) {
            return index + 1;
        }
        if (!triple && character === '\n') {
            return null;
        }
    }
    return null;
}

function tokenizePython(source: string): readonly PythonToken[] | null {
    const tokens: PythonToken[] = [];
    const delimiterStack: string[] = [];
    let index = 0;

    while (index < source.length) {
        const character = source[index] ?? '';
        if (character === '\n') {
            tokens.push({ kind: 'newline', value: '\n' });
            index += 1;
            continue;
        }
        if (character === '\r' || character === ' ' || character === '\t' || character === '\f') {
            index += 1;
            continue;
        }
        if (character === '#') {
            const newline = source.indexOf('\n', index);
            index = newline < 0 ? source.length : newline;
            continue;
        }
        if (character === '"' || character === '\'') {
            const end = skipPythonString(source, index);
            if (end === null) return null;
            index = end;
            continue;
        }
        if (isIdentifierStart(character)) {
            let end = index + 1;
            while (end < source.length && isIdentifierPart(source[end] ?? '')) end += 1;
            tokens.push({ kind: 'identifier', value: source.slice(index, end) });
            index = end;
            continue;
        }

        if (OPENERS[character]) {
            delimiterStack.push(OPENERS[character]);
        } else if (CLOSERS.has(character) && delimiterStack.pop() !== character) {
            return null;
        }
        tokens.push({ kind: 'punctuation', value: character });
        index += 1;
    }

    return delimiterStack.length === 0 ? tokens : null;
}

function findClosingDelimiter(tokens: readonly PythonToken[], start: number): number | null {
    const expectedCloser = OPENERS[tokens[start]?.value ?? ''];
    if (!expectedCloser) return null;

    const stack: string[] = [expectedCloser];
    for (let index = start + 1; index < tokens.length; index += 1) {
        const value = tokens[index]?.value ?? '';
        if (OPENERS[value]) {
            stack.push(OPENERS[value]);
        } else if (CLOSERS.has(value)) {
            if (stack.pop() !== value) return null;
            if (stack.length === 0) return index;
        }
    }
    return null;
}

function isValidIdentifierToken(token: PythonToken | undefined): boolean {
    return token?.kind === 'identifier'
        && isIdentifierStart(token.value[0] ?? '')
        && !HARD_PYTHON_KEYWORDS.has(token.value);
}

function isValidTypeParameter(tokens: readonly PythonToken[]): boolean {
    const significant = tokens.filter((token) => token.kind !== 'newline');
    let index = 0;
    let stars = 0;
    while (significant[index]?.value === '*') {
        stars += 1;
        index += 1;
    }
    if (stars > 2 || !isValidIdentifierToken(significant[index])) return false;
    index += 1;

    if (stars > 0) return index === significant.length;
    if (index === significant.length) return true;
    return significant[index]?.value === ':' && index + 1 < significant.length;
}

function hasValidTypeParameters(
    tokens: readonly PythonToken[],
    openingIndex: number,
    closingIndex: number,
): boolean {
    let segmentStart = openingIndex + 1;
    const stack: string[] = [];
    let parameterCount = 0;

    for (let index = segmentStart; index < closingIndex; index += 1) {
        const value = tokens[index]?.value ?? '';
        if (OPENERS[value]) {
            stack.push(OPENERS[value]);
            continue;
        }
        if (CLOSERS.has(value)) {
            if (stack.pop() !== value) return false;
            continue;
        }
        if (value === ',' && stack.length === 0) {
            if (!isValidTypeParameter(tokens.slice(segmentStart, index))) return false;
            parameterCount += 1;
            segmentStart = index + 1;
        }
    }

    const trailing = tokens.slice(segmentStart, closingIndex);
    if (trailing.some((token) => token.kind !== 'newline')) {
        return isValidTypeParameter(trailing);
    }
    return parameterCount > 0;
}

function hasHeaderColon(tokens: readonly PythonToken[], start: number): boolean {
    const stack: string[] = [];
    for (let index = start; index < tokens.length; index += 1) {
        const value = tokens[index]?.value ?? '';
        if (OPENERS[value]) {
            stack.push(OPENERS[value]);
            continue;
        }
        if (CLOSERS.has(value)) {
            if (stack.pop() !== value) return false;
            continue;
        }
        if (value === ':' && stack.length === 0) return true;
        if (tokens[index]?.kind === 'newline' && stack.length === 0) return false;
    }
    return false;
}

function isFunctionHeader(tokens: readonly PythonToken[], defIndex: number): boolean {
    const name = tokens[defIndex + 1];
    if (!isValidIdentifierToken(name)) return false;

    let openingIndex = defIndex + 2;
    if (tokens[openingIndex]?.value === '[') {
        const typeParametersEnd = findClosingDelimiter(tokens, openingIndex);
        if (typeParametersEnd === null
            || !hasValidTypeParameters(tokens, openingIndex, typeParametersEnd)) {
            return false;
        }
        openingIndex = typeParametersEnd + 1;
    }
    if (tokens[openingIndex]?.value !== '(') return false;

    const closingIndex = findClosingDelimiter(tokens, openingIndex);
    if (closingIndex === null) return false;
    const afterSignature = tokens[closingIndex + 1];
    if (afterSignature?.value === ':') return true;
    if (afterSignature?.value !== '-' || tokens[closingIndex + 2]?.value !== '>') return false;
    return hasHeaderColon(tokens, closingIndex + 3);
}

function hasValidPythonFunctionHeaders(tokens: readonly PythonToken[]): boolean {
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token?.kind === 'identifier' && token.value === 'def'
            && !isFunctionHeader(tokens, index)) {
            return false;
        }
    }
    return true;
}

/** Return true only when delimiters and every discovered def header are valid. */
export function isParseablePythonSource(source: string): boolean {
    const tokens = tokenizePython(source);
    return tokens !== null && hasValidPythonFunctionHeaders(tokens);
}
