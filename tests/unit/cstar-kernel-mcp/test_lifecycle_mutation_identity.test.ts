import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { closeDb } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { handleBead } from '../../../src/tools/cstar-kernel-mcp/tools/bead.js';
import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import { handleSpokeBeadImport } from '../../../src/tools/cstar-kernel-mcp/tools/spoke_bead_import.js';

function parse(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0]!.text) as Record<string, any>;
}

describe('authoritative lifecycle mutation request identity', () => {
    let root = '';
    let previousRoot = '';

    beforeEach(() => {
        previousRoot = registry.getRoot();
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-lifecycle-identity-'));
        registry.setRoot(root);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(previousRoot);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('rejects bead creation before Hall bootstrap when request metadata is absent', async () => {
        const result = parse(await handleBead({
            action: 'create',
            bead_id: 'bead:test:identity-gate',
            rationale: 'Synthetic request identity gate probe.',
        }));

        assert.match(result.error, /^codex_request_identity_/);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });

    it('rejects spoke imports before inspecting or creating Hall', async () => {
        const result = parse(await handleSpokeBeadImport({
            spoke: 'synthetic-spoke',
            intent: 'Synthetic import identity gate probe.',
            acceptance_criteria: 'No durable mutation without a bound root-user turn.',
            lore_path: 'tests/features/synthetic.feature',
        }));

        assert.match(result.error, /^codex_request_identity_/);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });

    it('rejects validation recording before Hall bootstrap', async () => {
        const result = parse(await handleRecordResult({
            bead_id: 'bead:test:identity-gate',
            verdict: 'INCONCLUSIVE',
            notes: 'Synthetic validation identity gate probe.',
        }));

        assert.match(result.error, /^codex_request_identity_/);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });
});
