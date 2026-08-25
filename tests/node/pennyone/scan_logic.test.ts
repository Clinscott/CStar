import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runScan } from '../../../src/tools/pennyone/index.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';

describe('PennyOne Scan Logic', () => {
    it('runs a bounded isolated scan with deterministic local intent', async () => {
        const originalRoot = registry.getRoot();
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-pennyone-scan-'));
        const sourceRoot = path.join(root, 'src');
        fs.mkdirSync(sourceRoot, { recursive: true });
        fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
        fs.mkdirSync(path.join(root, '.stats'), { recursive: true });
        fs.writeFileSync(path.join(root, '.agents', 'config.json'), '{"system":{"persona":"A.L.F.R.E.D."}}');
        fs.writeFileSync(path.join(sourceRoot, 'sample.ts'), 'export const sample = 1;\n');
        registry.setRoot(root);

        try {
            const results = await runScan(sourceRoot, true, {
                include_history: false,
                evaluate_warden: false,
                throttle_ms: 0,
            });
            assert.strictEqual(results.length, 1);
            assert.match(results[0]?.intent ?? '', /sample\.ts contains runtime or tooling logic/i);
        } finally {
            registry.setRoot(originalRoot);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
