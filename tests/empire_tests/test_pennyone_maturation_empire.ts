import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getDb, savePing, getSessionsWithSummaries, getSessionPings } from '../../src/tools/pennyone/intel/database.js';
import { analyzeFile } from '../../src/tools/pennyone/analyzer.js';

/**
 * [EMPIRE TDD] PennyOne Maturation
 * Verifies the Linscott Standard compliance for the Hall of Records and API Tagging.
 */

describe('PennyOne Maturation and Hall of Records', () => {
    test('SQLite Hall of Records stores telemetry', async () => {
        const testRepo = process.cwd();
        const mockAgent = 'TEST_AGENT_EMPIRE_001';
        
        // WHEN an AgentPing is saved
        await savePing({
            agent_id: mockAgent,
            action: 'THINK',
            target_path: 'src/mock/target.ts',
            timestamp: Date.now()
        }, testRepo);

        // THEN the session should be recorded in the database
        const sessions = getSessionsWithSummaries(testRepo);
        const agentSession = sessions.find(s => s.agent_id === mockAgent);
        
        assert.ok(agentSession, 'Session should be created and retrievable');
        
        // AND the ping should be retrievable via Chronicle queries
        const pings = getSessionPings(agentSession.id, testRepo);
        assert.strictEqual(pings.length, 1, 'There should be exactly one ping for this test session');
        assert.strictEqual(pings[0].action, 'THINK', 'Action should be correctly recorded');
    });

    test('Analyzer detects API endpoints (Fastify/Express)', async () => {
        const mockCode = `
            import { FastifyInstance } from 'fastify';
            export default async function (fastify: FastifyInstance) {
                fastify.post('/api/test/route', async () => { return {}; });
                fastify.get('/api/test/status', async () => { return {}; });
            }
        `;
        
        // WHEN the code is analyzed by PennyOne
        const data = await analyzeFile(mockCode, 'src/api/routes.ts');
        
        // THEN the resulting FileData should contain the detected endpoints
        assert.strictEqual(data.is_api, true, 'is_api flag should be true');
        assert.ok(data.endpoints && data.endpoints.includes('[POST] /api/test/route'), 'POST endpoint should be detected');
        assert.ok(data.endpoints && data.endpoints.includes('[GET] /api/test/status'), 'GET endpoint should be detected');
    });
});
