import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    getSessionStringMetadata,
    getSessionNumberMetadata,
    buildResearchPayload,
    buildArchitectPayload,
    buildAutobotInvocation,
    isTerminalPlanningStatus,
    asStringArray,
    normalizeIdFragment,
    isVerificationLikeTarget,
    extractArtifactPathCandidates,
    augmentResearchPayloadForArchitect,
    persistArchitectProposal,
    deps,
} from '../../../../src/node/core/runtime/weaves/chant_planner.ts';

describe('Chant Planner Unit Tests', () => {
    describe('Metadata Utilities', () => {
        it('getSessionStringMetadata finds first valid string', () => {
            const session: any = { metadata: { key1: ' value1 ', key2: 'value2' } };
            assert.equal(getSessionStringMetadata(session, ['key3', 'key1']), 'value1');
        });

        it('getSessionNumberMetadata finds and parses numbers', () => {
            const session: any = { metadata: { key1: ' 123 ', key2: 456 } };
            assert.equal(getSessionNumberMetadata(session, ['key1']), 123);
            assert.equal(getSessionNumberMetadata(session, ['key2']), 456);
        });
    });

    it('isTerminalPlanningStatus identifies terminal states', () => {
        assert.ok(isTerminalPlanningStatus('COMPLETED'));
        assert.ok(isTerminalPlanningStatus('FAILED'));
        assert.ok(!isTerminalPlanningStatus('INTENT_RECEIVED'));
    });

    it('buildAutobotInvocation constructs correct payload', () => {
        const payload: any = { project_root: '/root', cwd: '/root', source: 'cli' };
        const session: any = { metadata: { autobot_timeout: 300 } };
        const invocation = buildAutobotInvocation(payload, session, 'bead-1');
        
        assert.equal(invocation.weave_id, 'weave:autobot');
        assert.equal(invocation.payload.bead_id, 'bead-1');
        assert.equal(invocation.payload.timeout, 300);
    });

    it('asStringArray handles mixed input', () => {
        assert.deepEqual(asStringArray([' a ', 1, 'b']), ['a', 'b']);
        assert.deepEqual(asStringArray(null), []);
    });

    it('normalizeIdFragment cleans strings for IDs', () => {
        assert.equal(normalizeIdFragment('  My Bead ID!  ', 'fallback'), 'my-bead-id');
        assert.equal(normalizeIdFragment('!!!', 'fallback'), 'fallback');
    });

    it('isVerificationLikeTarget identifies test files', () => {
        assert.ok(isVerificationLikeTarget('tests/my.test.ts'));
        assert.ok(isVerificationLikeTarget('src/my.spec.py'));
        assert.ok(!isVerificationLikeTarget('src/main.ts'));
    });

    it('extractArtifactPathCandidates finds files in strings', () => {
        mock.method(deps.fs, 'existsSync', () => true);
        mock.method(deps.fs, 'statSync', () => ({ isFile: () => true }));
        
        const results = extractArtifactPathCandidates('/root', 'check src/app.ts and tests/app.test.ts');
        assert.ok(results.includes('src/app.ts'));
        assert.ok(results.includes('tests/app.test.ts'));
    });

    it('augmentResearchPayloadForArchitect adds file budgets', () => {
        // We need to mock readFileBudget or the things it calls
        mock.method(deps.fs, 'existsSync', () => true);
        mock.method(deps.fs, 'statSync', () => ({ isFile: () => true }));
        mock.method(deps.fs, 'readFileSync', () => 'line1\nline2');
        
        const research = { research_artifacts: ['file1.ts'] };
        const augmented = augmentResearchPayloadForArchitect('/root', research);
        
        assert.ok((augmented.local_worker_file_budgets as any[]).length > 0);
        assert.equal((augmented.local_worker_file_budgets as any[])[0].line_count, 2);
    });

    it('persistArchitectProposal upserts beads and proposals', () => {
        mock.method(deps.database, 'upsertHallBead', () => {});
        mock.method(deps.database, 'saveHallSkillProposal', () => {});
        mock.method(deps.fs, 'mkdirSync', () => {});
        mock.method(deps.fs, 'writeFileSync', () => {});
        
        const proposal = {
            proposal_summary: 'test proposal',
            beads: [{
                id: 'bead1',
                title: 'Bead 1',
                targets: ['file1.ts'],
                test_file_path: 'tests/file1.test.ts',
                test_file_content: 'test content'
            }]
        };
        
        const result = persistArchitectProposal('/root', 'repo-1', 'session-1', proposal);
        assert.equal(result.beadIds.length, 1);
        assert.ok(result.beadIds[0].includes('bead1'));
    });

    it('buildResearchPayload preserves the original trace-bearing chant query as rationale', () => {
        const payload: any = {
            query: '// Corvus Star Trace [Ω]\nIntent Category: ORCHESTRATE\nIntent: test',
            project_root: '/root',
            cwd: '/root',
        };

        const result = buildResearchPayload(payload, 'normalized intent');
        assert.equal(result.intent, 'normalized intent');
        assert.equal(result.rationale, payload.query);
    });

    it('buildArchitectPayload preserves the original trace-bearing chant query as rationale', () => {
        const payload: any = {
            query: '// Corvus Star Trace [Ω]\nIntent Category: ORCHESTRATE\nIntent: test',
            project_root: '/root',
            cwd: '/root',
        };

        const result = buildArchitectPayload(payload, 'normalized intent', { summary: 'research' });
        assert.equal(result.intent, 'normalized intent');
        assert.equal(result.rationale, payload.query);
    });
});
