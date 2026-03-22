import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { OrchestratorScheduler } from  '../../../src/node/core/runtime/scheduler.js';
import { database } from  '../../../src/tools/pennyone/intel/database.js';

describe('OrchestratorScheduler', () => {
    it('should reclaim zombie beads', async () => {
        const mockDb = {
            prepare: mock.fn(() => ({
                run: mock.fn(() => ({ changes: 2 }))
            }))
        };
        mock.method(database, 'getDb', () => mockDb);

        const scheduler = new OrchestratorScheduler('/mock/root');
        const changes = await scheduler.reclaimZombies();

        assert.strictEqual(changes, 2);
        assert.strictEqual(mockDb.prepare.mock.callCount(), 1);
        assert.ok(mockDb.prepare.mock.calls[0].arguments[0].includes('UPDATE hall_beads'));
        mock.reset();
    });

    it('should fetch next batch of beads sorted by priority', async () => {
        const mockRows = [
            { bead_id: 'bead-low', status: 'SET', created_at: 1000, baseline_scores_json: '{"overall": 0.9}' },
            { bead_id: 'bead-high', status: 'SET', created_at: 2000, baseline_scores_json: '{"overall": 0.2}' },
            { bead_id: 'bead-new', status: 'SET', created_at: 1500, baseline_scores_json: '' }
        ];

        const mockDb = {
            prepare: mock.fn(() => ({
                all: mock.fn(() => mockRows)
            }))
        };
        mock.method(database, 'getDb', () => mockDb);

        const scheduler = new OrchestratorScheduler('/mock/root');
        const batch = await scheduler.getNextBatch(2);

        assert.strictEqual(batch.length, 2);
        // Priority: bead-new (0 overall -> 10 priority), then bead-high (0.2 overall -> 9.8 priority)
        assert.strictEqual(batch[0].id, 'bead-new');
        assert.strictEqual(batch[1].id, 'bead-high');
        
        mock.reset();
    });
});
