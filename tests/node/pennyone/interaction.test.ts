import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runScan } from '../../../src/tools/pennyone/index.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';

describe('PennyOne interaction projection', () => {
    it('writes deterministic local interaction metadata for Python and TSX sectors', async () => {
        const originalRoot = registry.getRoot();
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-pennyone-interaction-'));
        const fixtureRoot = path.join(root, 'fixture');
        fs.mkdirSync(fixtureRoot, { recursive: true });
        fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
        fs.mkdirSync(path.join(root, '.stats'), { recursive: true });
        fs.writeFileSync(path.join(root, '.agents', 'config.json'), '{"system":{"persona":"A.L.F.R.E.D."}}');
        fs.writeFileSync(path.join(fixtureRoot, 'warden.py'), 'class TestWarden:\n    pass\n');
        fs.writeFileSync(path.join(fixtureRoot, 'Node.tsx'), 'export const NeuralNode = () => <div />;\n');
        registry.setRoot(root);

        try {
            const results = await runScan(fixtureRoot, true, {
                include_history: false,
                evaluate_warden: false,
                throttle_ms: 0,
            });
            assert.strictEqual(results.length, 2);
            const pythonReport = fs.readFileSync(path.join(root, '.stats', 'fixture-warden-py.qmd'), 'utf-8');
            const tsxReport = fs.readFileSync(path.join(root, '.stats', 'fixture-Node-tsx.qmd'), 'utf-8');
            assert.match(pythonReport, /## Interaction Protocol[\s\S]*analyzer-detected exports/i);
            assert.match(tsxReport, /## Interaction Protocol[\s\S]*analyzer-detected exports/i);
        } finally {
            registry.setRoot(originalRoot);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
