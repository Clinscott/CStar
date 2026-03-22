import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Path } from 'node:fs'; // Mocking fs for path operations

// Import the refactored database facade
import { database } from  '../../../src/tools/pennyone/intel/database.js';
// Import other modules that might be used by the facade's methods, if needed for mocking
import * as hallSchema from  '../../../src/tools/pennyone/intel/schema.js';
import * as pennyonePathRegistry from  '../../../src/tools/pennyone/pathRegistry.js';
import * as hallTypes from  '../../../types/hall.js';

// Constants and Mock Data
const MOCK_ROOT_PATH = '/mock/corvus/cstar';
const MOCK_REPO_ID = 'repo:mock-id';

describe('HallDatabase Facade', () => {
    let mockDbInstance: any;
    let mockPrepare: any;
    let mockRun: any;
    let mockGet: any;
    let mockAll: any;
    let mockExec: any;

    beforeEach(() => {
        // Initialize mocks for each test to ensure isolation
        mockRun = mock.fn();
        mockGet = mock.fn();
        mockAll = mock.fn();
        mockExec = mock.fn();

        const mockStatement = {
            run: mockRun,
            get: mockGet,
            all: mockAll,
        };

        mockPrepare = mock.fn(() => mockStatement);

        mockDbInstance = {
            prepare: mockPrepare,
            exec: mockExec,
            close: mock.fn(),
        };

        // Mock the getDb method on the imported database INSTANCE
        mock.method(database, 'getDb', () => mockDbInstance); 
        mock.method(hallSchema, 'ensureHallSchema', mock.fn());
        mock.method(pennyonePathRegistry, 'buildHallRepositoryId', () => MOCK_REPO_ID);
        mock.method(pennyonePathRegistry, 'normalizeHallPath', (p: string) => p);
    });

    afterEach(() => {
        // Reset all mocks after each test
        mock.reset();
    });

    it('getDb creates and ensures schema when db is not initialized', () => {
        const dbFacade = new HallDatabase();
        dbFacade.getDb(MOCK_ROOT_PATH);

        assert.strictEqual(mockDbInstance.prepare.mock.callCount(), 0, 'prepare should not be called on init');
        assert.strictEqual(mockExec.mock.callCount(), 1, 'ensureHallSchema should be called once');
        assert.ok(mockExec.mock.calls[0].arguments[0].includes('CREATE TABLE IF NOT EXISTS hall_repositories'));
    });

    it('getDb returns existing instance if already initialized', () => {
        const dbFacade = new HallDatabase();
        const firstInstance = dbFacade.getDb(MOCK_ROOT_PATH);
        const secondInstance = dbFacade.getDb(MOCK_ROOT_PATH);

        assert.strictEqual(firstInstance, secondInstance, 'getDb should return the same instance');
        assert.strictEqual(mockDbInstance.prepare.mock.callCount(), 0); // Should not initialize again
    });

    it('close releases the database connection', () => {
        const dbFacade = new HallDatabase();
        dbFacade.getDb(MOCK_ROOT_PATH);
        dbFacade.close();
        assert.strictEqual(mockDbInstance.close.mock.callCount(), 1, 'close should be called once');
    });

    it('upsertHallBead calls prepare and run with correct parameters', () => {
        const mockRecord = {
            bead_id: 'bead-123',
            repo_id: MOCK_REPO_ID,
            rationale: 'Test rationale',
            created_at: 1678886400000,
            updated_at: 1678886400000,
            status: 'OPEN',
            target_kind: 'FILE',
            target_ref: 'src/file.ts',
            target_path: '/mock/root/src/file.ts',
            contract_refs_json: '["contract1"]',
            baseline_scores_json: '{"score": 0.9}',
            acceptance_criteria: 'pass',
            checker_shell: 'echo "ok"',
            source_kind: 'TEST',
            triage_reason: 'test reason',
            resolution_note: 'test note',
            resolved_validation_id: 'val-1',
            superseded_by: null,
        };

        dbModule.upsertHallBead(mockRecord);

        assert.strictEqual(mockPrepare.mock.callCount(), 1);
        assert.ok(mockPrepare.mock.calls[0].arguments[0].includes('INSERT INTO hall_beads'));
        assert.strictEqual(mockRun.mock.callCount(), 1);
        assert.deepStrictEqual(mockRun.mock.calls[0].arguments, [
            mockRecord.bead_id, MOCK_REPO_ID, null, null, mockRecord.target_kind,
            mockRecord.target_ref, mockRecord.target_path, mockRecord.rationale,
            mockRecord.contract_refs_json, mockRecord.baseline_scores_json, mockRecord.acceptance_criteria,
            mockRecord.checker_shell, mockRecord.status, null, mockRecord.source_kind,
            mockRecord.triage_reason, mockRecord.resolution_note, mockRecord.resolved_validation_id,
            mockRecord.superseded_by, mockRecord.created_at, mockRecord.updated_at
        ]);
    });

    it('getHallBead should return bead data correctly', () => {
        const mockRow = {
            bead_id: 'bead-123',
            repo_id: MOCK_REPO_ID,
            rationale: 'Test rationale',
            status: 'OPEN',
            created_at: 1000,
            updated_at: 2000,
            contract_refs_json: '["contract1"]',
            baseline_scores_json: '{"score": 0.9}',
            critique_payload_json: '{}',
            target_path: 'src/file.ts'
        };
        mockGet.mock.setReturnValue(mockRow);

        const result = dbModule.getHallBead('bead-123');

        assert.ok(result);
        assert.strictEqual(result.id, 'bead-123');
        assert.strictEqual(result.repoId, MOCK_REPO_ID);
        assert.strictEqual(result.status, 'OPEN');
        assert.deepEqual(result.contract_refs, ['contract1']);
        assert.deepEqual(result.baseline_scores, { score: 0.9 });
    });

    it('getBeadCount should return the correct count', () => {
        mockGet.mock.setReturnValue({ count: 42 });

        const count = dbModule.getBeadCount(MOCK_ROOT_PATH);

        assert.strictEqual(count, 42, 'getBeadCount should return the correct count');
        assert.ok(mockPrepare.mock.calls[0][0].includes('SELECT COUNT(*) FROM hall_beads'), 'SQL should perform a count');
    });

    it('getHallBeads retrieves all beads for a repo', () => {
        const mockRows = [{ bead_id: 'b1', repo_id: MOCK_REPO_ID }, { bead_id: 'b2', repo_id: MOCK_REPO_ID }];
        mockAll.mock.setReturnValue(mockRows);

        const beads = dbModule.getHallBeads(MOCK_REPO_ID);
        assert.strictEqual(beads.length, 2);
        assert.strictEqual(beads[0].id, 'b1');
    });
    
    it('getHallBeadsByStatus retrieves beads by status', () => {
        const mockRows = [{ bead_id: 'b1', status: 'SET' }];
        mockAll.mock.setReturnValue(mockRows);

        const beads = dbModule.getHallBeadsByStatus(MOCK_REPO_ID, 'SET');
        assert.strictEqual(beads.length, 1);
        assert.strictEqual(beads[0].status, 'SET');
    });

    it('getHallBeadsBySource retrieves beads by source', () => {
        const mockRows = [{ bead_id: 'b1', source_kind: 'TEST' }];
        mockAll.mock.setReturnValue(mockRows);

        const beads = dbModule.getHallBeadsBySource(MOCK_REPO_ID, 'TEST');
        assert.strictEqual(beads.length, 1);
        assert.strictEqual(beads[0].source_kind, 'TEST');
    });

    it('getHallBeadsByEpic retrieves beads by epic rationale', () => {
        const mockRows = [{ bead_id: 'b1', target_ref: 'epic-abc' }];
        mockAll.mock.setReturnValue(mockRows);

        const beads = dbModule.getHallBeadsByEpic(MOCK_REPO_ID, 'epic-abc');
        assert.strictEqual(beads.length, 1);
        assert.strictEqual(beads[0].target_ref, 'epic-abc');
    });

    it('deleteHallBead removes a bead', () => {
        mockRun.mock.setReturnValue({ changes: 1 });
        dbModule.deleteHallBead('bead-to-delete');
        assert.strictEqual(mockPrepare.mock.callCount(), 1);
        assert.ok(mockPrepare.mock.calls[0][0].includes('DELETE FROM hall_beads'));
        assert.strictEqual(mockRun.mock.callCount(), 1);
        assert.strictEqual(mockRun.mock.calls[0].arguments[0], 'bead-to-delete');
    });

    it('upsertBeadCritique handles new and existing critiques', () => {
        const mockRecord = {
            critique_id: 'crit-1', bead_id: 'bead-1', repo_id: MOCK_REPO_ID, agent_id: 'agent-1',
            agent_expertise: 'AI', critique: 'Critique text', proposed_path: 'path/to/fix',
            evidence_json: '{}', is_architect_approved: true, architect_feedback: 'Good',
            created_at: 1234567890
        };
        dbModule.upsertBeadCritique(mockRecord as any);
        assert.strictEqual(mockPrepare.mock.callCount(), 1);
        assert.ok(mockPrepare.mock.calls[0][0].includes('INSERT INTO hall_bead_critiques'));
        assert.ok(mockPrepare.mock.calls[0][0].includes('ON CONFLICT(critique_id) DO UPDATE'));
        assert.strictEqual(mockRun.mock.callCount(), 1);
    });

    it('getBeadCritiques retrieves critiques for a bead', () => {
        const mockRows = [{ critique_id: 'crit-1', bead_id: 'bead-1' }];
        mockAll.mock.setReturnValue(mockRows);

        const critiques = dbModule.getBeadCritiques('bead-1');
        assert.strictEqual(critiques.length, 1);
        assert.strictEqual(critiques[0].critique_id, 'crit-1');
    });

    it('saveEpisodicMemory handles new and existing memory entries', () => {
        const mockRecord = {
            memory_id: 'mem-1', bead_id: 'bead-1', repo_id: MOCK_REPO_ID,
            tactical_summary: 'Summary', files_touched_json: '{}', successes_json: '[]',
            metadata_json: '{}', created_at: 123, updated_at: 456
        };
        dbModule.saveEpisodicMemory(mockRecord as any);
        assert.ok(mockPrepare.mock.calls[0][0].includes('INSERT INTO hall_episodic_memory'));
        assert.ok(mockPrepare.mock.calls[0][0].includes('ON CONFLICT(memory_id) DO UPDATE'));
        assert.strictEqual(mockRun.mock.callCount(), 1);
    });

    it('getEpisodicMemory retrieves memories for a bead', () => {
        const mockRows = [{ memory_id: 'mem-1', bead_id: 'bead-1' }];
        mockAll.mock.setReturnValue(mockRows);

        const memories = dbModule.getEpisodicMemory('bead-1');
        assert.strictEqual(memories.length, 1);
        assert.strictEqual(memories[0].memory_id, 'mem-1');
    });

    it('saveValidationRun inserts a new validation record', () => {
        const mockRecord = {
            validation_id: 'val-1', repo_id: MOCK_REPO_ID, scan_id: 'scan-1', bead_id: 'bead-1',
            target_path: 'src/file.ts', verdict: 'PASS', sprt_verdict: 'ACCEPTED',
            pre_scores_json: '{}', post_scores_json: '{}', benchmark_json: '{}', created_at: 123
        };
        dbModule.saveValidationRun(mockRecord as any);
        assert.ok(mockPrepare.mock.calls[0][0].includes('INSERT INTO hall_validation_runs'));
        assert.strictEqual(mockRun.mock.callCount(), 1);
    });

    it('getValidationRuns retrieves validation runs for a bead', () => {
        const mockRows = [{ validation_id: 'val-1', bead_id: 'bead-1' }];
        mockAll.mock.setReturnValue(mockRows);

        const runs = dbModule.getValidationRuns('bead-1');
        assert.strictEqual(runs.length, 1);
        assert.strictEqual(runs[0].validation_id, 'val-1');
    });
});
