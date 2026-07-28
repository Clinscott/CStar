import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    GUNGNIR_CALCULUS_SUPPORTED_EXTENSIONS,
    GungnirCalculus,
    SUPPORTED_GUNGNIR_EXTENSIONS,
    auditGungnirSource,
    evaluateGungnirSource,
    scoreGungnirSource,
} from '../../src/core/engine/gungnir/calculus.js';
import { isCanonicalGungnirScore } from '../../src/types/gungnir.js';

describe('Gungnir Calculus engine', () => {
    it('aligns its supported extensions with UniversalGungnir', () => {
        assert.deepStrictEqual(GUNGNIR_CALCULUS_SUPPORTED_EXTENSIONS, [
            '.css',
            '.js',
            '.json',
            '.jsx',
            '.md',
            '.py',
            '.qmd',
            '.scss',
            '.ts',
            '.tsx',
            '.yaml',
            '.yml',
        ]);
        assert.deepStrictEqual(
            [...SUPPORTED_GUNGNIR_EXTENSIONS],
            GUNGNIR_CALCULUS_SUPPORTED_EXTENSIONS,
        );
    });

    it('fails closed instead of assigning a perfect score to unsupported files', () => {
        assert.throws(
            () => auditGungnirSource('opaque', '.bin'),
            /Unsupported Gungnir file extension ".bin"/,
        );
        assert.throws(
            () => scoreGungnirSource('opaque', 'ts'),
            /Unsupported Gungnir file extension "ts"/,
        );
    });

    it('returns a canonical matrix for clean source', () => {
        const result = evaluateGungnirSource(
            'export function add(left: number, right: number): number {\n    return left + right;\n}\n',
            '.TS',
        );

        assert.strictEqual(result.extension, '.ts');
        assert.deepStrictEqual(result.breaches, []);
        assert.strictEqual(result.matrix.version, '1.0');
        assert.strictEqual(result.matrix.overall, 10);
        for (const key of [
            'logic',
            'style',
            'intel',
            'vigil',
            'evolution',
            'sovereignty',
            'overall',
            'stability',
            'aesthetic',
        ] as const) {
            assert.strictEqual(isCanonicalGungnirScore(result.matrix[key]), true, key);
        }
    });

    it('does not mistake TypeScript generic syntax for JSX UI elements', () => {
        const result = evaluateGungnirSource(
            'export function identity<TValue>(value: TValue): TValue { return value; }\n',
            '.ts',
        );

        assert.deepStrictEqual(result.breaches, []);
        assert.equal(result.matrix.overall, 10);
    });

    it('does not award a perfect score to over-coupled parseable TypeScript', () => {
        const source = `${Array.from(
            { length: 11 },
            (_, index) => `import dependency${index} from 'dependency-${index}';`,
        ).join('\n')}\nexport const value = 1;\n`;
        const result = evaluateGungnirSource(source, '.ts');

        assert.equal(result.coverage, 'heuristic');
        assert.equal(result.breaches.some((breach) => breach.code === 'logic.script.coupling'), true);
        assert.ok(result.matrix.overall < 10);
    });

    it('emits deterministic, immutable breach records and score penalties', () => {
        const malformed = 'export function broken(: void {}';
        const first = evaluateGungnirSource(malformed, '.ts');
        const second = evaluateGungnirSource(malformed, '.ts');

        assert.deepStrictEqual(first, second);
        assert.strictEqual(Object.isFrozen(first.breaches), true);
        assert.strictEqual(Object.isFrozen(first.breaches[0]), true);
        assert.deepStrictEqual(first.breaches, [{
            severity: 'CRITICAL',
            code: 'logic.parse',
            message: 'GUNGNIR_PARSE_ERROR: Source could not be parsed.',
        }]);
        assert.strictEqual(first.matrix.logic, 6);
        assert.strictEqual(first.matrix.style, 10);
        assert.strictEqual(first.matrix.anomaly, 1);
        assert.ok(first.matrix.overall < 10);
    });

    it('detects Python balance, coupling, documentation, and claustrophobia rules', () => {
        const imports = Array.from(
            { length: 11 },
            (_, index) => `import dependency_${index}`,
        ).join('\n');
        const body = Array.from(
            { length: 13 },
            (_, index) => `    value_${index} = ${index}`,
        ).join('\n');
        const source = `${imports}\n\ndef overloaded():\n${body}\n    return value_0\n`;
        const breaches = auditGungnirSource(source, '.py');

        assert.deepStrictEqual(
            breaches.map((breach) => breach.code),
            [
                'logic.python.coupling',
                'intel.python.documentation',
                'logic.python.balance',
                'style.python.claustrophobia',
            ],
        );
    });

    it('normalizes Python parse failures without invoking Python', () => {
        const result = evaluateGungnirSource('def alpha(:\n    return 1\n', '.py');

        assert.strictEqual(result.breaches[0]?.code, 'logic.parse');
        assert.strictEqual(result.matrix.logic, 6);
        assert.strictEqual(result.matrix.anomaly, 1);
    });

    it('detects the JavaScript-family UI rules in stable order', () => {
        const source = `
            export const View = () => (
                <div className="w-[12px] absolute">
                    <span>One</span>
                    <span>Two</span>
                    <span>Three</span>
                    <button>Four</button>
                    <button>Five</button>
                </div>
            );
        `;
        const breaches = auditGungnirSource(source, '.tsx');

        assert.deepStrictEqual(
            breaches.map((breach) => breach.code),
            ['style.ui.arbitrary-pixels', 'style.ui.birkhoff'],
        );
        assert.strictEqual(scoreGungnirSource(source, '.tsx').matrix.style, 3.5);
    });

    it('detects stylesheet, data, and document structure rules', () => {
        const stylesheet = `.card {\n${Array.from(
            { length: 11 },
            (_, index) => `  property-${index}: ${index};`,
        ).join('\n')}\n}`;
        const data = '{"a":{"b":{"c":{"d":{"e":{"f":{"g":1}}}}}}}';
        const document = `${'dense prose\n'.repeat(60)}`;

        assert.strictEqual(
            auditGungnirSource(stylesheet, '.css')[0]?.code,
            'style.stylesheet.tokens',
        );
        assert.strictEqual(
            auditGungnirSource(data, '.json')[0]?.code,
            'intel.data.nesting',
        );
        assert.strictEqual(
            auditGungnirSource(document, '.md')[0]?.code,
            'intel.document.structure',
        );
    });

    it('is read-only and never creates Hall, gravity, or database state', () => {
        const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gungnir-calculus-'));
        const previousDirectory = process.cwd();
        try {
            process.chdir(temporaryRoot);
            const calculus = new GungnirCalculus();
            calculus.audit('const value = 1;\n', '.ts');
            calculus.score('const value = 1;\n', '.ts');
            calculus.evaluate('const value = 1;\n', '.ts');
            assert.deepStrictEqual(fs.readdirSync(temporaryRoot), []);
        } finally {
            process.chdir(previousDirectory);
            fs.rmSync(temporaryRoot, { recursive: true, force: true });
        }
    });
});
