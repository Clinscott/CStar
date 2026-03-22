import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Import the database object to mock its methods
import { database } from '../../src/tools/pennyone/intel/database.ts';
import { upsertHallBead, getHallBead, getBeadCount } from '../../src/tools/pennyone/intel/bead_controller.ts';
import { HallBeadRecord } from '../../src/types/hall.ts';

/**
 * Unit tests for BeadController using Node.js native test runner and mocking.
 * This suite verifies the CRUD operations for Hall Beads with 1:1 database isolation.
 */
describe('BeadController Unit Tests', () => {
    let prepareMock: any;
    let runMock: any;
    let getMock: any;
    let allMock: any;

    beforeEach(() => {
        // Initialize mocks for each test to ensure isolation
        runMock = mock.fn();
        getMock = mock.fn();
        allMock = mock.fn();
        
        const statementMock = {
            run: runMock,
            get: getMock,
            all: allMock,
        };

        prepareMock = mock.fn(() => statementMock);

        const mockDb = {
            prepare: prepareMock,
        };

        // Mock the database object's getDb method
        mock.method(database, 'getDb', () => mockDb);
    });

    afterEach(() => {
        // Reset all mocks after each test
        mock.reset();
    });

    it('upsertHallBead should call database.prepare and run with correct parameters', () => {
        const record: HallBeadRecord = {
            bead_id: 'bead-123',
            repo_id: 'repo-456',
            rationale: 'Reason for existence',
            status: 'OPEN',
            created_at: 1000,
            updated_at: 2000,
            contract_refs: ['ref1'],
            baseline_scores: { overall: 0.8 },
        };

        upsertHallBead(record);

        // Verify database interactions
        assert.strictEqual(prepareMock.mock.callCount(), 1, 'prepare should be called once');
        assert.strictEqual(runMock.mock.callCount(), 1, 'run should be called once');
        
        const sql = prepareMock.mock.calls[0].arguments[0];
        assert.ok(sql.includes('INSERT INTO hall_beads'), 'SQL should be an INSERT');
        assert.ok(sql.includes('ON CONFLICT(bead_id)'), 'SQL should handle conflicts');

        const params = runMock.mock.calls[0].arguments;
        assert.strictEqual(params[0], 'bead-123', 'First param should be bead_id');
        assert.strictEqual(params[1], 'repo-456', 'Second param should be repo_id');
        assert.strictEqual(params[7], 'Reason for existence', 'Rationale should be correctly passed');
        assert.strictEqual(params[12], 'OPEN', 'Status should be correctly passed');
    });

    it('getHallBead should return a SovereignBead when record exists', () => {
        const mockRow = {
            bead_id: 'bead-123',
            repo_id: 'repo-456',
            rationale: 'Reason',
            status: 'SET',
            created_at: 1000,
            updated_at: 2000,
            contract_refs_json: '["ref1"]',
            baseline_scores_json: '{"overall":0.9}',
            critique_payload_json: '{}',
        };

        // Correct way to set a return value for a mock in Node.js test runner
        getMock.mock.mockImplementation(() => mockRow);

        const result = getHallBead('bead-123');

        assert.strictEqual(prepareMock.mock.callCount(), 1);
        assert.strictEqual(getMock.mock.callCount(), 1);
        assert.strictEqual(getMock.mock.calls[0].arguments[0], 'bead-123');
        
        assert.ok(result, 'Result should not be null');
        assert.strictEqual(result?.id, 'bead-123');
        assert.strictEqual(result?.status, 'SET');
        assert.deepEqual(result?.contract_refs, ['ref1']);
        assert.deepEqual(result?.baseline_scores, { overall: 0.9 });
    });

    it('getHallBead should return null when record does not exist', () => {
        getMock.mock.mockImplementation(() => undefined);

        const result = getHallBead('missing-bead');

        assert.strictEqual(result, null, 'Result should be null for missing bead');
    });

    it('getBeadCount should return the count from the database', () => {
        getMock.mock.mockImplementation(() => ({ count: 42 }));

        const count = getBeadCount('/mock/project/root');

        assert.strictEqual(prepareMock.mock.callCount(), 1);
        assert.strictEqual(getMock.mock.callCount(), 1);
        assert.strictEqual(count, 42, 'Count should match the mocked database return value');
        
        const sql = prepareMock.mock.calls[0].arguments[0];
        assert.ok(sql.includes('SELECT COUNT(*)'), 'SQL should perform a count');
        assert.ok(sql.includes('FROM hall_beads'), 'SQL should target hall_beads table');
    });
});
