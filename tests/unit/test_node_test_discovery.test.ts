import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { withBoundedNodeTestConcurrency } from '../../scripts/runtime-env.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const KERNEL_TEST_ROOT = path.join(PROJECT_ROOT, 'tests', 'unit', 'cstar-kernel-mcp');

function sorted(values: Iterable<string>): string[] {
    return [...values].sort((left, right) => left.localeCompare(right));
}

function walkTests(root: string): string[] {
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(root, entry.name);
        if (entry.isDirectory()) return walkTests(absolute);
        return entry.isFile() && entry.name.endsWith('.test.ts')
            ? [path.relative(PROJECT_ROOT, absolute).replaceAll(path.sep, '/')]
            : [];
    });
}

function isCoveredMaintainedFamily(relative: string): boolean {
    if (/^tests\/[^/]+\.test\.ts$/.test(relative)) return true;
    if (/^tests\/node\/[^/]+\.test\.ts$/.test(relative)) return true;
    if (/^tests\/node\/pennyone\/[^/]+\.test\.ts$/.test(relative)) return true;
    if (/^tests\/unit\/[^/]+\.test\.ts$/.test(relative)) return true;
    if (/^tests\/unit\/(?:war_game|spoke_discovery|node-runtime)\/[^/]+\.test\.ts$/.test(relative)) return true;
    if (/^tests\/unit\/node-runtime\/(?:adapters|weaves)\/[^/]+\.test\.ts$/.test(relative)) return true;
    if (/^tests\/unit\/cstar-kernel-mcp\/[^/]+\.test\.ts$/.test(relative)) return true;
    if (/^tests\/integration\/[^/]+\.test\.ts$/.test(relative)) return true;
    return /^tests\/integration\/ipc\/[^/]+\.test\.ts$/.test(relative);
}

describe('Node test discovery contract', () => {
    it('bounds process-isolated test concurrency by default', () => {
        assert.deepEqual(
            withBoundedNodeTestConcurrency(['--test', 'tests/unit/example.test.ts'], {}),
            ['--test', '--test-concurrency=2', 'tests/unit/example.test.ts'],
        );
        assert.deepEqual(
            withBoundedNodeTestConcurrency(
                ['--test', 'tests/unit/example.test.ts'],
                { CSTAR_NODE_TEST_CONCURRENCY: '4' },
            ),
            ['--test', '--test-concurrency=4', 'tests/unit/example.test.ts'],
        );
    });

    it('preserves an explicit Node concurrency and rejects unsafe environment values', () => {
        assert.deepEqual(
            withBoundedNodeTestConcurrency(
                ['--test', '--test-concurrency=1', 'tests/unit/example.test.ts'],
                { CSTAR_NODE_TEST_CONCURRENCY: '8' },
            ),
            ['--test', '--test-concurrency=1', 'tests/unit/example.test.ts'],
        );
        assert.throws(
            () => withBoundedNodeTestConcurrency(
                ['--test', 'tests/unit/example.test.ts'],
                { CSTAR_NODE_TEST_CONCURRENCY: '0' },
            ),
            /integer from 1 through 8/,
        );
        assert.throws(
            () => withBoundedNodeTestConcurrency(
                ['--test', 'tests/unit/example.test.ts'],
                { CSTAR_NODE_TEST_CONCURRENCY: 'unbounded' },
            ),
            /integer from 1 through 8/,
        );
    });

    it('covers every focused cstar-kernel suite exactly once', () => {
        const allFocused = new Set(
            fs.readdirSync(KERNEL_TEST_ROOT)
                .filter((name) => name.endsWith('.test.ts')),
        );
        const aggregator = fs.readFileSync(
            path.join(PROJECT_ROOT, 'tests', 'unit', 'test_cstar_kernel_mcp.test.ts'),
            'utf-8',
        );
        const imported = new Set(
            [...aggregator.matchAll(/\.\/cstar-kernel-mcp\/(.+?\.test)\.js/g)]
                .map((match) => `${match[1]}.ts`),
        );
        const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
        const isolated = new Set(
            [...String(packageJson.scripts['test:node']).matchAll(/tests\/unit\/cstar-kernel-mcp\/(\S+?\.test\.ts)/g)]
                .map((match) => match[1]),
        );

        assert.deepEqual(sorted(new Set([...imported, ...isolated])), sorted(allFocused));
        assert.deepEqual(sorted([...imported].filter((name) => isolated.has(name))), []);
    });

    it('classifies every non-quarantined Node test into a maintained family', () => {
        const maintained = walkTests(path.join(PROJECT_ROOT, 'tests'))
            .filter((relative) => !relative.startsWith('tests/quarantine/'));
        const uncovered = maintained.filter((relative) => !isCoveredMaintainedFamily(relative));
        assert.deepEqual(uncovered, []);

        const script = String(JSON.parse(
            fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'),
        ).scripts['test:node']);
        for (const pattern of [
            'tests/node/*.test.ts',
            'tests/node/pennyone/*.test.ts',
            'tests/unit/node-runtime/*.test.ts',
            'tests/unit/node-runtime/adapters/*.test.ts',
            'tests/unit/node-runtime/weaves/*.test.ts',
            'tests/integration/ipc/*.test.ts',
        ]) {
            assert.ok(script.includes(pattern), `missing maintained test pattern: ${pattern}`);
        }
    });
});
