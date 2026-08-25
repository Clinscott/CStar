import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    classifyWorkerOutcome,
    OrchestratorReaper,
    RETIRED_ORCHESTRATOR_RUNTIME_ERROR,
} from '../../../src/node/core/runtime/reaper.js';


describe('retired Orchestrator Reaper', () => {
    it('retains deterministic failure classification without Hall access', () => {
        const result = classifyWorkerOutcome({
            stdout: '',
            stderr: 'first\nsecond\nthird\nfourth\nfifth\nfinal crash',
            exitCode: 1,
            timedOut: false,
        }, 'IN_PROGRESS', 'ORIGINAL');
        assert.equal(result.finalStatus, 'BLOCKED');
        assert.match(result.triageReason ?? '', /final crash/);
        assert.doesNotMatch(result.triageReason ?? '', /first/);
        assert.match(result.triageReason ?? '', /Original assignment preserved: ORIGINAL/);
    });

    it('retains deterministic success and empty-output classification', () => {
        assert.equal(classifyWorkerOutcome({
            stdout: 'focused validation passed',
            stderr: '',
            exitCode: 0,
            timedOut: false,
        }).finalStatus, 'READY_FOR_REVIEW');
        assert.equal(classifyWorkerOutcome({
            stdout: 'tiny',
            stderr: '',
            exitCode: 0,
            timedOut: false,
        }).finalStatus, 'NEEDS_TRIAGE');
    });

    it('retains deterministic timeout classification', () => {
        const result = classifyWorkerOutcome({
            stdout: '',
            stderr: '',
            exitCode: 124,
            timedOut: true,
        });
        assert.equal(result.finalStatus, 'BLOCKED');
        assert.match(result.triageReason ?? '', /timed out/);
    });

    it('rejects lifecycle mapping before mutation', async () => {
        await assert.rejects(
            () => new OrchestratorReaper('/synthetic').mapOutcome('bead:synthetic', {
                stdout: 'focused validation passed',
                stderr: '',
                exitCode: 0,
                timedOut: false,
            }),
            { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR },
        );
    });
});
