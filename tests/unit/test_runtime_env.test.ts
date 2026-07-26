import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
    expandTestFileArgs,
    resolveTsxLaunch,
} from '../../scripts/runtime-env.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

describe('cross-platform TypeScript runtime environment', () => {
    it('passes the local tsx loader to Node as a file URL', () => {
        const loaderPath = path.join(PROJECT_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
        const launch = resolveTsxLaunch(PROJECT_ROOT, ['cstar.ts', '--version']);

        assert.equal(launch.command, process.execPath);
        assert.deepEqual(launch.args.slice(0, 2), ['--import', pathToFileURL(loaderPath).href]);
    });

    it('expands test globs and omits patterns with no active files', () => {
        const args = expandTestFileArgs([
            '--test',
            'tests/*.test.ts',
            'tests/unit/war_game/*.test.ts',
            'tests/crucible/*.ts',
        ], PROJECT_ROOT);

        assert.equal(args[0], '--test');
        assert.equal(args.includes('tests/crucible/*.ts'), false);
        assert.equal(args.some((arg) => arg.includes('*')), false);
        assert.ok(args.slice(1).length > 0);
        assert.ok(args.slice(1).every((arg) => fs.existsSync(path.join(PROJECT_ROOT, arg))));
    });

    it('preserves wildcard arguments outside Node test mode', () => {
        const args = ['cstar.ts', 'search', '*.ts'];
        assert.deepEqual(expandTestFileArgs(args, PROJECT_ROOT), args);
    });
});
