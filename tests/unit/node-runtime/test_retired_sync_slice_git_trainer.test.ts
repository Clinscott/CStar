import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
    deps,
    RETIRED_SYNC_SLICE_ERROR,
    runSyncSlice,
} from '../../../src/node/core/runtime/sync_slice.js';
import {
    RETIRED_GIT_TRAINER_ERROR,
    seedGitGravity,
} from '../../../src/tools/pennyone/intel/git_trainer.js';


const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');


describe('retired sync-slice and Git trainer actions', () => {
    it('sync-slice fails before Hall, source, or target access', async () => {
        assert.deepEqual(deps, { executionEnabled: false });
        await assert.rejects(
            () => runSyncSlice('/synthetic', 'bead:synthetic'),
            { message: RETIRED_SYNC_SLICE_ERROR },
        );
    });

    it('Git trainer fails before Git or gravity state access', async () => {
        await assert.rejects(
            () => seedGitGravity(),
            { message: RETIRED_GIT_TRAINER_ERROR },
        );
    });

    it('sources contain no Hall, Git process, filesystem, or gravity writer', () => {
        const source = [
            'src/node/core/runtime/sync_slice.ts',
            'src/tools/pennyone/intel/git_trainer.ts',
        ].map((relative) => fs.readFileSync(path.join(PROJECT_ROOT, relative), 'utf8')).join('\n');
        for (const forbidden of [
            'pennyone/intel/database',
            "from 'node:fs'",
            "from 'execa'",
            'getHallBeads(',
            'injectTargetSymbol(',
            "execa('git'",
            'setFileGravity(',
        ]) {
            assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
    });
});
