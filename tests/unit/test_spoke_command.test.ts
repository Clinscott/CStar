import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    registerSpokeCommand,
    SPOKE_COMMAND_RETIRED_ERROR,
} from '../../src/node/core/commands/spoke.js';

describe('retired spoke command', () => {
    it('fails before resolving a workspace, projecting files, or writing Hall', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-retired-spoke-'));
        let workspaceResolutions = 0;
        const program = new Command().exitOverride();
        registerSpokeCommand(program, () => {
            workspaceResolutions += 1;
            return root;
        });

        await assert.rejects(
            program.parseAsync(['node', 'test', 'spoke', 'link', 'synthetic', root]),
            new RegExp(SPOKE_COMMAND_RETIRED_ERROR),
        );

        assert.equal(workspaceResolutions, 0);
        assert.deepEqual(fs.readdirSync(root), []);
    });
});
