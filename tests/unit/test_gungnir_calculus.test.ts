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

function isBoundedScore(value: unknown): boolean {
    return typeof value === 'number'
        && Number.isFinite(value)
        && value >= 0
        && value <= 10;
}

describe('Gungnir Calculus engine', () => {
    it('declares the reviewed supported extension set', () => {
        assert.deepEqual(GUNGNIR_CALCULUS_SUPPORTED_EXTENSIONS, [
            '.css', '.js', '.json', '.jsx', '.md', '.py',
            '.qmd', '.scss', '.ts', '.tsx', '.yaml', '.yml',
        ]);
        assert.deepEqual(
            [...SUPPORTED_GUNGNIR_EXTENSIONS],
            GUNGNIR_CALCULUS_SUPPORTED_EXTENSIONS,
        );
    });

    it('fails closed for unsupported extensions', () => {
        assert.throws(
            () => auditGungnirSource('opaque', '.bin'),
            /Unsupported Gungnir file extension ".bin"/,
        );
        assert.throws(
            () => scoreGungnirSource('opaque', 'ts'),
            /Unsupported Gungnir file extension "ts"/,
        );
    });

    it('returns a deterministic bounded matrix for clean source', () => {
        const source = 'export function add(left: number, right: number): number {\n    return left + right;\n}\n';
        const first = evaluateGungnirSource(source, '.TS');
        const second = evaluateGungnirSource(source, '.TS');

        assert.deepEqual(first, second);
        assert.equal(first.extension, '.ts');
        assert.deepEqual(first.breaches, []);
        assert.equal(first.matrix.version, '1.0');
        assert.equal(first.matrix.overall, 10);
        for (const key of [
            'logic', 'style', 'intel', 'vigil', 'evolution',
            'sovereignty', 'overall', 'stability', 'aesthetic',
        ] as const) {
            assert.equal(isBoundedScore(first.matrix[key]), true, key);
        }
    });

    it('does not mistake TypeScript generics for JSX', () => {
        const result = evaluateGungnirSource(
            'export function identity<TValue>(value: TValue): TValue { return value; }\n',
            '.ts',
        );
        assert.deepEqual(result.breaches, []);
        assert.equal(result.matrix.overall, 10);
    });

    it('penalizes over-coupled parseable TypeScript', () => {
        const source = `${Array.from(
            { length: 11 },
            (_, index) => `import dependency${index} from 'dependency-${index}';`,
        ).join('\n')}\nexport const value = 1;\n`;
        const result = evaluateGungnirSource(source, '.ts');

        assert.equal(result.coverage, 'heuristic');
        assert.equal(
            result.breaches.some((breach) => breach.code === 'logic.script.coupling'),
            true,
        );
        assert.ok(result.matrix.overall < 10);
    });

    it('emits immutable parse breach evidence and penalties', () => {
        const result = evaluateGungnirSource('export function broken(: void {}', '.ts');

        assert.equal(Object.isFrozen(result.breaches), true);
        assert.equal(Object.isFrozen(result.breaches[0]), true);
        assert.deepEqual(result.breaches, [{
            severity: 'CRITICAL',
            code: 'logic.parse',
            message: 'GUNGNIR_PARSE_ERROR: Source could not be parsed.',
        }]);
        assert.equal(result.matrix.logic, 6);
        assert.equal(result.matrix.anomaly, 1);
        assert.ok(result.matrix.overall < 10);
    });

    it('detects Python rules in stable order without invoking Python', () => {
        const imports = Array.from(
            { length: 11 },
            (_, index) => `import dependency_${index}`,
        ).join('\n');
        const body = Array.from(
            { length: 13 },
            (_, index) => `    value_${index} = ${index}`,
        ).join('\n');
        const source = `${imports}\n\ndef overloaded():\n${body}\n    return value_0\n`;

        assert.deepEqual(
            auditGungnirSource(source, '.py').map((breach) => breach.code),
            [
                'logic.python.coupling',
                'intel.python.documentation',
                'logic.python.balance',
                'style.python.claustrophobia',
            ],
        );
        assert.equal(
            evaluateGungnirSource('def alpha(:\n    return 1\n', '.py').breaches[0]?.code,
            'logic.parse',
        );
    });

    it('detects UI, stylesheet, data, and document rules', () => {
        const ui = `
            export const View = () => (
                <div className="w-[12px] absolute">
                    <span>One</span><span>Two</span><span>Three</span>
                    <button>Four</button><button>Five</button>
                </div>
            );
        `;
        const stylesheet = `.card {\n${Array.from(
            { length: 11 },
            (_, index) => `  property-${index}: ${index};`,
        ).join('\n')}\n}`;
        const data = '{"a":{"b":{"c":{"d":{"e":{"f":{"g":1}}}}}}}';
        const document = 'dense prose\n'.repeat(60);

        assert.deepEqual(
            auditGungnirSource(ui, '.tsx').map((breach) => breach.code),
            ['style.ui.arbitrary-pixels', 'style.ui.birkhoff'],
        );
        assert.equal(auditGungnirSource(stylesheet, '.css')[0]?.code, 'style.stylesheet.tokens');
        assert.equal(auditGungnirSource(data, '.json')[0]?.code, 'intel.data.nesting');
        assert.equal(auditGungnirSource(document, '.md')[0]?.code, 'intel.document.structure');
    });

    it('has no filesystem side effects', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gungnir-calculus-'));
        const previous = process.cwd();
        try {
            process.chdir(root);
            const calculus = new GungnirCalculus();
            calculus.audit('const value = 1;\n', '.ts');
            calculus.score('const value = 1;\n', '.ts');
            calculus.evaluate('const value = 1;\n', '.ts');
            assert.deepEqual(fs.readdirSync(root), []);
        } finally {
            process.chdir(previous);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
