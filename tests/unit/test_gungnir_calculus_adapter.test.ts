import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    CalculusAdapter,
    resolveCalculusTarget,
    type CalculusReport,
} from '../../src/node/core/runtime/adapters/calculus.js';
import type { RuntimeContext } from '../../src/node/core/runtime/contracts.js';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-CALCULUS',
        bead_id: 'bead:calculus:test',
        trace_id: 'trace-calculus',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: {},
        timestamp: 1,
    };
}

describe('Gungnir Calculus adapter', () => {
    it('scores a contained file without mutating runtime state', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calculus-adapter-'));
        fs.mkdirSync(path.join(root, 'src'));
        fs.writeFileSync(
            path.join(root, 'src', 'clean.ts'),
            'export const answer = 42;\n',
            'utf-8',
        );

        const result = await new CalculusAdapter().execute({
            weave_id: 'prime:calculus',
            payload: { action: 'score', file: 'src/clean.ts' },
        }, createContext(root));
        const report = result.metadata?.calculus as CalculusReport;

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.weave_id, 'prime:calculus');
        assert.equal(result.metrics_delta, undefined);
        assert.equal(report.file, 'src/clean.ts');
        assert.equal(report.matrix.overall, 10);
        assert.equal(report.verdict, 'PASS');
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });

    it('returns deterministic breach evidence as a successful audit', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calculus-audit-'));
        fs.writeFileSync(path.join(root, 'broken.ts'), 'export function broken(: void {}', 'utf-8');

        const result = await new CalculusAdapter().execute({
            weave_id: 'prime:calculus',
            payload: { action: 'audit', file: 'broken.ts' },
        }, createContext(root));
        const report = result.metadata?.calculus as CalculusReport;

        assert.equal(result.status, 'SUCCESS');
        assert.equal(report.verdict, 'BREACH');
        assert.equal(report.breaches[0]?.code, 'logic.parse');
    });

    it('rejects traversal, outside absolute paths, directories, and unsupported files', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calculus-containment-'));
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'calculus-outside-'));
        fs.writeFileSync(path.join(outside, 'outside.ts'), 'export const outside = true;\n');
        fs.writeFileSync(path.join(root, 'binary.bin'), 'opaque');
        const adapter = new CalculusAdapter();

        for (const file of ['../outside.ts', path.join(outside, 'outside.ts'), '.', 'binary.bin']) {
            const result = await adapter.execute({
                weave_id: 'prime:calculus',
                payload: { action: 'score', file },
            }, createContext(root));
            assert.equal(result.status, 'FAILURE', file);
        }
    });

    it('rejects symlinks that escape the selected workspace', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calculus-symlink-'));
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'calculus-symlink-outside-'));
        const outsideFile = path.join(outside, 'outside.ts');
        fs.writeFileSync(outsideFile, 'export const outside = true;\n');
        fs.symlinkSync(outsideFile, path.join(root, 'escape.ts'));

        assert.throws(
            () => resolveCalculusTarget(root, 'escape.ts'),
            /rejects symlinks that escape/,
        );
    });
});
