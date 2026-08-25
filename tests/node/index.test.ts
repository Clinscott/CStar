import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { indexSector } from '../../src/tools/pennyone/index.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

test('Targeted Incremental Scan (indexSector) is bounded and deterministic', async () => {
    const originalRoot = registry.getRoot();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-index-sector-'));
    const targetFile = path.join(root, 'src', 'sample.ts');
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
    fs.mkdirSync(path.join(root, '.stats'), { recursive: true });
    fs.writeFileSync(path.join(root, '.agents', 'config.json'), '{"system":{"persona":"A.L.F.R.E.D."}}');
    fs.writeFileSync(targetFile, 'export function sample(value: number) { return value + 1; }\n');
    registry.setRoot(root);

    try {
        const result = await indexSector(targetFile);
        assert.ok(result, 'Should return a FileData object');
        assert.strictEqual(result.path, targetFile);
        assert.ok(result.matrix);
        assert.ok(result.hash);
        assert.match(result.intent ?? '', /sample\.ts contains runtime or tooling logic/i);
    } finally {
        registry.setRoot(originalRoot);
        fs.rmSync(root, { recursive: true, force: true });
    }
});
