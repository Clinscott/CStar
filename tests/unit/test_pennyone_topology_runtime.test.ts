import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    importRepositoryIntoEstate,
    PENNYONE_IMPORT_RETIRED,
} from '../../src/tools/pennyone/intel/importer.js';

test('legacy PennyOne import retires before clone, scan, state, or Hall effects', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pennyone-import-retired-'));
    let cloneCalls = 0;
    let scanCalls = 0;
    try {
        await assert.rejects(
            importRepositoryIntoEstate('https://user:password@example.invalid/repo.git', {
                workspaceRoot,
                cloneRunner: async () => { cloneCalls += 1; },
                scanRunner: async () => { scanCalls += 1; },
            }),
            new RegExp(PENNYONE_IMPORT_RETIRED),
        );
        assert.strictEqual(cloneCalls, 0);
        assert.strictEqual(scanCalls, 0);
        assert.strictEqual(fs.existsSync(path.join(workspaceRoot, '.estate')), false);
    } finally {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
});
