import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    DistillLessonsWeave,
    LESSON_DISTILLATION_DECOMMISSIONED_ERROR,
} from '../../../../src/node/core/runtime/weaves/distill_lessons.js';
import {
    HarvestLessonsWeave,
    LESSON_HARVEST_DECOMMISSIONED_ERROR,
} from '../../../../src/node/core/runtime/weaves/harvest_lessons.js';
import { database } from '../../../../src/tools/pennyone/intel/database.js';
import { handleHallMaintenance } from '../../../../src/tools/cstar-kernel-mcp/tools/hall.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

describe('decommissioned model-written lesson paths', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    it('fails lesson distillation before looking up an Engram or invoking a host/model', async () => {
        const getEpisodicMemory = mock.method(database, 'getEpisodicMemory', () => {
            throw new Error('decommissioned adapter attempted to read Hall state');
        });

        const result = await new DistillLessonsWeave().execute(
            { weave_id: 'weave:distill-lessons', payload: { memory_id: 'engram:test' } },
            { workspace_root: '/target-that-must-not-be-read', env: {}, timestamp: Date.now() } as any,
        );

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.error, LESSON_DISTILLATION_DECOMMISSIONED_ERROR);
        assert.equal(result.metadata?.decommissioned, true);
        assert.equal(result.metadata?.actuated, false);
        assert.equal(getEpisodicMemory.mock.callCount(), 0);
    });

    it('fails recursive lesson harvesting without Hall discovery or dispatch', async () => {
        const listUnstudied = mock.method(database, 'listUnstudiedEngrams', () => {
            throw new Error('decommissioned adapter attempted to scan Hall state');
        });

        const result = await new HarvestLessonsWeave().execute(
            { weave_id: 'weave:harvest-lessons', payload: { project_root: '/target-that-must-not-be-read', limit: 20 } },
            { workspace_root: '/target-that-must-not-be-read', env: {}, timestamp: Date.now() } as any,
        );

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.error, LESSON_HARVEST_DECOMMISSIONED_ERROR);
        assert.equal(result.metadata?.decommissioned, true);
        assert.equal(result.metadata?.actuated, false);
        assert.equal(listUnstudied.mock.callCount(), 0);
    });

    it('keeps the public Hall maintenance compatibility call fail-closed and non-reading', async () => {
        const getDb = mock.method(database, 'getDb', () => {
            throw new Error('retired MCP tool attempted to open SQLite');
        });
        const listUnstudied = mock.method(database, 'listUnstudiedEngrams', () => {
            throw new Error('retired MCP tool attempted to inspect a harvest queue');
        });

        for (const args of [
            { action: 'study' as const, memory_id: 'engram:test' },
            { action: 'harvest' as const, limit: 20 },
        ]) {
            const response = await handleHallMaintenance(args);
            assert.equal(response.isError, true);
            const payload = JSON.parse(response.content[0].text) as {
                decommissioned?: boolean;
                actuated?: boolean;
                replacement?: string;
            };
            assert.equal(payload.decommissioned, true);
            assert.equal(payload.actuated, false);
            assert.match(payload.replacement ?? '', /cstar_hall_search/);
        }

        assert.equal(getDb.mock.callCount(), 0);
        assert.equal(listUnstudied.mock.callCount(), 0);
    });

    it('contains no dormant execution dependency in retired source paths', () => {
        const distillSource = fs.readFileSync(
            path.join(PROJECT_ROOT, 'src/node/core/runtime/weaves/distill_lessons.ts'),
            'utf-8',
        );
        const harvestSource = fs.readFileSync(
            path.join(PROJECT_ROOT, 'src/node/core/runtime/weaves/harvest_lessons.ts'),
            'utf-8',
        );
        const engraveSource = fs.readFileSync(
            path.join(PROJECT_ROOT, 'scripts/engrave_sessions.ts'),
            'utf-8',
        );

        assert.doesNotMatch(distillSource, /host_bridge|defaultHostTextInvoker|resolveRuntimeHostProvider|\bexeca\b|database\.|\.runner\(/);
        assert.doesNotMatch(harvestSource, /\bexeca\b|dispatchPort|database\.|setTimeout|\.runner\(/);
        assert.doesNotMatch(engraveSource, /--learn|node:child_process|detached:\s*true|\.unref\(/);
    });
});
