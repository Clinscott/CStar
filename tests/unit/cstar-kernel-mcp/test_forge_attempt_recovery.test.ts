import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    getForgeAttempt,
    getForgeRequest,
    markForgeAttemptStarted,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    inspectForgeAttemptRecovery,
    reconcileForgeAttemptIfAbandoned,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_attempt_recovery.js';
import {
    buildForgeExecutionOwnerProof,
    FORGE_EXECUTION_GRACE_MS,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_execution_owner.js';
import {
    cleanupForgeReceiptFixtures,
    createForgeReceiptFixture,
    forgeRequestInput,
    insertForgeReceiptBead,
    saveAndAuthorizeForgeRequest,
} from './forge_receipt_test_support.js';

afterEach(cleanupForgeReceiptFixtures);

function startedFixture(startedAt = Date.now()) {
    const fixture = createForgeReceiptFixture();
    const beadId = 'bead:test:forge-attempt-recovery';
    insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
    const request = forgeRequestInput(fixture.repoId, beadId, { now: startedAt - 1_000 });
    const authorization = saveAndAuthorizeForgeRequest(fixture.db, request, {
        authorized_at: startedAt - 1_000,
        expires_at: startedAt + FORGE_EXECUTION_GRACE_MS,
        now: startedAt - 1_000,
    }).authorization;
    const executionReceiptId = `forge-execute-${request.request_id.slice('dispatch-forge-'.length)}`;
    const attempt = reserveForgeAttempt(fixture.db, {
        request_id: request.request_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: 'recovery-test',
        execution_receipt_id: executionReceiptId,
        adapter_ref: request.adapter_ref!,
        now: startedAt - 500,
    }).attempt;
    markForgeAttemptStarted(fixture.db, attempt.attempt_id, startedAt);
    return { ...fixture, request, attempt: getForgeAttempt(fixture.db, attempt.attempt_id)! };
}

function writeTrace(
    root: string,
    attempt: ReturnType<typeof startedFixture>['attempt'],
    status: string,
    executionOwner?: unknown,
): void {
    const directory = path.join(root, 'work', 'forge-executions', attempt.execution_receipt_id);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(directory, 'adapter-execution-envelope.json'), JSON.stringify({
        schema: 'cstar.forge_adapter_execution_trace.v2',
        status,
        execution_receipt_id: attempt.execution_receipt_id,
        forge_request_receipt_id: attempt.request_id,
        execution_owner: executionOwner,
    }), { mode: 0o600 });
}

describe('Forge abandoned-attempt recovery', () => {
    it('keeps a STARTED attempt nonterminal while its exact kernel owner is alive', () => {
        const fixture = startedFixture();
        const owner = buildForgeExecutionOwnerProof();
        assert.ok(owner, 'Linux test host must expose exact process identity');
        writeTrace(fixture.root, fixture.attempt, 'started', owner);

        const recovery = inspectForgeAttemptRecovery(fixture.root, fixture.attempt);
        assert.equal(recovery.classification, 'owner_alive');
        assert.equal(recovery.owner_proof, 'verified_alive');
        const result = reconcileForgeAttemptIfAbandoned(
            fixture.root, fixture.db, fixture.attempt,
        );
        assert.equal(result.attempt.status, 'STARTED');
        assert.equal(result.request.status, 'AUTHORIZED');
        assert.equal(result.recovery.reconciled, false);
        fixture.db.close();
    });

    it('terminalizes a STARTED attempt as UNKNOWN when its exact owner is gone', () => {
        const fixture = startedFixture();
        const owner = buildForgeExecutionOwnerProof();
        assert.ok(owner);
        writeTrace(fixture.root, fixture.attempt, 'started', { ...owner, pid: 2_147_483_647 });

        const result = reconcileForgeAttemptIfAbandoned(
            fixture.root, fixture.db, fixture.attempt,
        );
        assert.equal(result.recovery.classification, 'owner_terminated');
        assert.equal(result.recovery.reconciled, true);
        assert.equal(result.attempt.status, 'UNKNOWN');
        assert.equal(result.request.status, 'AMBIGUOUS');
        assert.equal(
            result.attempt.error_code,
            'forge_execution_owner_terminated_before_terminal_trace',
        );
        fixture.db.close();
    });

    it('terminalizes a legacy ownerless STARTED trace only after the hard deadline', () => {
        const now = Date.now();
        const fixture = startedFixture(now - FORGE_EXECUTION_GRACE_MS - 1);
        writeTrace(fixture.root, fixture.attempt, 'started');

        const result = reconcileForgeAttemptIfAbandoned(
            fixture.root, fixture.db, fixture.attempt, now,
        );
        assert.equal(result.recovery.classification, 'deadline_elapsed');
        assert.equal(result.attempt.status, 'UNKNOWN');
        assert.equal(result.request.status, 'AMBIGUOUS');
        assert.equal(
            result.attempt.error_code,
            'forge_execution_deadline_elapsed_without_terminal_trace',
        );
        fixture.db.close();
    });

    it('does not overwrite a terminal trace that still needs receipt reconciliation', () => {
        const fixture = startedFixture();
        writeTrace(fixture.root, fixture.attempt, 'ok');

        const result = reconcileForgeAttemptIfAbandoned(
            fixture.root, fixture.db, fixture.attempt,
        );
        assert.equal(result.recovery.classification, 'terminal_trace_unreconciled');
        assert.equal(result.recovery.reconciled, false);
        assert.equal(getForgeAttempt(fixture.db, fixture.attempt.attempt_id)?.status, 'STARTED');
        assert.equal(getForgeRequest(fixture.db, fixture.request.request_id)?.status, 'AUTHORIZED');
        fixture.db.close();
    });
});
