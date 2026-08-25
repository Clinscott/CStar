import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { scoreGungnirSource } from '../../src/core/engine/gungnir/calculus.js';
import { isParseablePythonSource } from '../../src/core/engine/gungnir/python_syntax.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

const HARD_PYTHON_KEYWORDS = [
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
    'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
    'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
] as const;

describe('Gungnir bounded Python syntax seam', () => {
    it('accepts decorated synchronous multiline signatures', () => {
        const source = `
@decorator
def calculate(
    left: int,
    right: int = 1,
    *,
    options: dict[str, int] | None = None,
) -> int:
    return left + right
`;
        assert.equal(isParseablePythonSource(source), true);
        assert.equal(scoreGungnirSource(source, '.py').breaches.some(
            (breach) => breach.code === 'logic.parse',
        ), false);
    });

    it('accepts async multiline signatures with annotations and defaults', () => {
        const source = `
@router.get('/items')
async def fetch_items(
    url: str,
    timeout: float = 1.0,
    headers: dict[str, str] | None = None,
) -> list[dict[str, str]]:
    return []
`;
        assert.equal(isParseablePythonSource(source), true);
    });

    it('accepts nested delimiters in defaults and return annotations', () => {
        const source = `
def build(
    values: tuple[int, ...] = (1, 2),
    mapping: dict[str, list[int]] = {'one': [1, 2]},
) -> tuple[dict[str, list[int]], int]:
    return mapping, len(values)
`;
        assert.equal(isParseablePythonSource(source), true);
    });

    it('accepts PEP 695 generic, constrained, and variadic type parameters', () => {
        const sources = [
            'def identity[T](value: T) -> T:\n    return value\n',
            'def choose[T: (str, bytes)](value: T) -> T:\n    return value\n',
            `async def collect[T, *Ts, **P](
    value: T,
    *args: *Ts,
    **kwargs: P.kwargs,
) -> tuple[T, *Ts]:
    return (value, *args)
`,
        ];
        for (const source of sources) {
            assert.equal(isParseablePythonSource(source), true, source);
        }
    });

    it('rejects malformed or unclosed PEP 695 type parameters', () => {
        const sources = [
            'def empty[](value):\n    return value\n',
            'def doubled[T,, U](value):\n    return value\n',
            'def missing_comma[T U](value):\n    return value\n',
            'def unclosed[T(value):\n    return value\n',
        ];
        for (const source of sources) {
            assert.equal(isParseablePythonSource(source), false, source);
        }
    });

    it('rejects every hard keyword as a function name with logic.parse', () => {
        for (const keyword of HARD_PYTHON_KEYWORDS) {
            const source = `def ${keyword}(value):\n    return value\n`;
            assert.equal(isParseablePythonSource(source), false, keyword);
            assert.equal(
                scoreGungnirSource(source, '.py').breaches.some(
                    (breach) => breach.code === 'logic.parse',
                ),
                true,
                keyword,
            );
        }
    });

    it('accepts near-collisions and syntactically permitted soft keywords', () => {
        for (const name of ['class_name', 'TrueValue', 'match', 'case', 'type']) {
            const source = `def ${name}(value):\n    return value\n`;
            assert.equal(isParseablePythonSource(source), true, name);
        }
    });

    it('rejects a missing function-header colon', () => {
        assert.equal(isParseablePythonSource(
            'def missing_colon(\n    value: int,\n)\n    return value\n',
        ), false);
    });

    it('rejects malformed names and missing closing parentheses', () => {
        assert.equal(isParseablePythonSource(
            'def 123invalid(value: int):\n    return value\n',
        ), false);
        assert.equal(isParseablePythonSource(
            'def missing_close(\n    value: int,\n:\n',
        ), false);
    });

    it('rejects unbalanced delimiters while ignoring strings and comments', () => {
        assert.equal(isParseablePythonSource(
            'text = "a closing bracket ] is data"\n# def ignored(value):\n',
        ), true);
        assert.equal(isParseablePythonSource('values = [1, 2\n'), false);
    });

    it('does not label current candidate Python files as logic.parse', () => {
        const candidates = [
            '.agents/skills/cstar-sprt-autoresearcher/scripts/cstar_workflow_sprt_core.py',
            '.agents/skills/cstar-sprt-autoresearcher/scripts/run_cstar_workflow_sprt.py',
            '.agents/skills/cstar-sprt-autoresearcher/scripts/cstar_workflow_gungnir.py',
            'tests/unit/test_cstar_sprt_autoresearcher.py',
            'tests/unit/test_cstar_sprt_autoresearcher_gungnir.py',
        ];
        for (const relative of candidates) {
            const result = scoreGungnirSource(
                fs.readFileSync(path.join(ROOT, relative), 'utf8'),
                '.py',
            );
            assert.equal(
                result.breaches.some((breach) => breach.code === 'logic.parse'),
                false,
                relative,
            );
        }
    });
});
