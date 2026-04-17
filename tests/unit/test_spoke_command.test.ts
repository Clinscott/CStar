import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { registerSpokeCommand } from '../../src/node/core/commands/spoke.js';
import { closeDb, listHallMountedSpokes } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

describe('spoke command', () => {
    let estateRoot: string;
    let controlRoot: string;
    let spokeRoot: string;
    const originalControlRoot = process.env.CSTAR_CONTROL_ROOT;

    beforeEach(() => {
        estateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-spoke-command-estate-'));
        controlRoot = path.join(estateRoot, 'CStar');
        spokeRoot = path.join(estateRoot, 'NexplayNexus');
        fs.mkdirSync(path.join(controlRoot, '.agents'), { recursive: true });
        fs.mkdirSync(spokeRoot, { recursive: true });
        process.env.CSTAR_CONTROL_ROOT = controlRoot;
        registry.setRoot(controlRoot);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        if (originalControlRoot === undefined) {
            delete process.env.CSTAR_CONTROL_ROOT;
        } else {
            process.env.CSTAR_CONTROL_ROOT = originalControlRoot;
        }
    });

    it('links the explicit spoke directory instead of ascending to the estate root', async () => {
        const program = new Command();
        registerSpokeCommand(program, () => controlRoot);

        await program.parseAsync([
            'node',
            'test',
            'spoke',
            'link',
            'NexplayNexus',
            spokeRoot,
            '--write-policy',
            'read_write',
        ]);

        const mounted = listHallMountedSpokes(controlRoot);
        assert.equal(mounted.length, 1);
        assert.equal(mounted[0]?.slug, 'nexplaynexus');
        assert.equal(mounted[0]?.root_path, spokeRoot.replace(/\\/g, '/'));
        assert.equal(mounted[0]?.write_policy, 'read_write');
    });
});
