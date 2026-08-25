import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import {
    FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS,
    type SaveForgeRequestInput,
} from '../../../src/types/forge.js';
import { bindForgeMissionGrantEnvelopeMetadata }
    from '../../../src/tools/pennyone/intel/forge_mission_grant_envelope.js';
import { handleBead } from '../../../src/tools/cstar-kernel-mcp/tools/bead.js';
import { handleForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
    buildForgeRequestId,
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
    type CanonicalForgeRequest,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import { verifyCodexRequestIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import {
    finalizeForgeAttempt,
    getForgeAuthorizationByRequest,
    getForgeRequest,
    getForgeRequestByDecision,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    appendUserMessage,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import {
    insertBead,
    parse,
    requestArgs,
    setupRoot,
} from './forge_natural_authorization_test_support.js';

export const CORRECTION_PARENT = 'bead:cstar:set-correction-parent';
export const CORRECTION_FIRST = 'bead:cstar:set-correction-first';
export const CORRECTION_SECOND = 'bead:cstar:set-correction-second';
export const CORRECTION_MISSION = 'decision:cstar:set-correction';
const DESIGN = 'd'.repeat(64);
const PROMPT_SUFFIX = ' Preserve the predecessor-authorized suffix.';

type Identity = Awaited<ReturnType<typeof verifyCodexRequestIdentity>>;

function mutationIdentity(identity: Identity) {
    return {
        source: 'codex_request_meta',
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        turn_record_set_sha256: identity.turn_record_set_sha256,
    };
}

function writeMetadata(
    fixture: ReturnType<typeof setupRoot>,
    beadId: string,
    metadata: object,
): void {
    fixture.db.prepare('UPDATE hall_beads SET metadata_json = ? WHERE bead_id = ?')
        .run(JSON.stringify(metadata), beadId);
}

function parentMetadata(
    value: ReturnType<typeof setupRoot>,
    extraTarget: string,
    identity: Identity,
) {
    return bindForgeMissionGrantEnvelopeMetadata({
        source: 'cstar-kernel-mcp',
        schema: 'cstar.set_manifest.v1',
        decision_id: CORRECTION_MISSION,
        design_revision: 1,
        design_sha256: DESIGN,
        batch_order: [CORRECTION_FIRST],
        operator_set: true,
        mission_grant_envelope: {
            schema: 'cstar.forge_mission_grant_envelope.v1',
            allowed_targets: [value.target, extraTarget],
            allowed_outputs: [value.target, extraTarget],
            allowed_actions: ['response_only'],
            prohibited_actions: [
                ...FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS,
                'project_files',
                'authorized_source_collection',
            ],
            adapter_ref: 'cstar-forge-hermes-minimax-adapter',
            write_capability: 'response_only',
            total_provider_attempt_ceiling: 1,
            retry_derived_iteration_ceiling: 0,
            paid_attempt_ceiling: 1,
        },
        mutation_request_identity: mutationIdentity(identity),
    });
}

function firstMetadata(identity: Identity) {
    return {
        source: 'cstar-kernel-mcp',
        parent_bead_id: CORRECTION_PARENT,
        order: 1,
        depends_on: [],
        design_sha256: DESIGN,
        owning_lane: 'Forge',
        mutation_request_identity: mutationIdentity(identity),
    };
}

function iterationInput(predecessorRequestSha256: string) {
    return {
        schema: 'cstar.set_manifest_iteration.v1',
        parent_bead_id: CORRECTION_PARENT,
        iteration_of: CORRECTION_FIRST,
        order: 2,
        design_sha256: DESIGN,
        owning_lane: 'Forge',
        max_attempts: 1,
        retry_budget: 0,
        live_source_allowed: false,
        fixture_policy: 'synthetic_only',
        predecessor_request_sha256: predecessorRequestSha256,
    };
}

function completeArgs(
    value: ReturnType<typeof setupRoot>,
    extraTarget: string,
    beadId: string,
    decisionId: string,
    threadId: string,
) {
    const args = requestArgs(value, beadId, decisionId, threadId);
    args.target_paths = [value.target, extraTarget];
    args.prompt += PROMPT_SUFFIX;
    return args;
}

function insertVerifiedInconclusive(
    fixture: ReturnType<typeof setupRoot>,
    requestId: string,
    attemptId: string,
    beadId: string,
): void {
    const validationId = `validation:set-correction:${randomUUID()}`;
    const evidenceSha256 = createHash('sha256').update(validationId).digest('hex');
    fixture.db.prepare(`
        INSERT INTO hall_validation_runs (
            validation_id, repo_id, bead_id, verdict, notes, authority_class,
            evidence_sha256, validator_identity, validator_identity_source,
            evidence_manifest_json, created_at
        )
        SELECT ?, repo_id, ?, 'INCONCLUSIVE', 'synthetic correction fixture',
               'verified_v2', ?, ?, 'test_fixture', '{}', ?
        FROM hall_forge_requests WHERE request_id = ?
    `).run(
        validationId, beadId, evidenceSha256, `validator-${validationId}`,
        Date.now(), requestId,
    );
    fixture.db.prepare(`
        UPDATE hall_forge_attempts
        SET validation_id = ?, validation_verdict = 'INCONCLUSIVE',
            validation_authority = 'verified_v2', validation_evidence_sha256 = ?
        WHERE attempt_id = ?
    `).run(validationId, evidenceSha256, attemptId);
}

export async function prepareForgeSetCorrection(label: string) {
    const value = setupRoot(`set-correction-${label}`);
    const extraTarget = path.join(value.root, 'target-two.txt');
    fs.writeFileSync(extraTarget, 'second synthetic target\n');
    const session = createSession({
        textParts: ['SET'],
        timestamp: new Date(Date.now() - 30_000).toISOString(),
    });
    const setContext = validRequestContext(session.threadId, session.turnId);
    const setIdentity = await verifyCodexRequestIdentity(setContext);
    insertBead(value, CORRECTION_PARENT, CORRECTION_MISSION);
    insertBead(value, CORRECTION_FIRST, `${CORRECTION_MISSION}:batch-1`);
    writeMetadata(
        value, CORRECTION_PARENT, parentMetadata(value, extraTarget, setIdentity),
    );
    writeMetadata(value, CORRECTION_FIRST, firstMetadata(setIdentity));
    const firstPending = parse(await handleForgeRequest(completeArgs(
        value, extraTarget, CORRECTION_FIRST,
        `${CORRECTION_MISSION}:batch-1`, session.threadId,
    ), setContext));
    if (firstPending.status !== 'AUTHORIZED') {
        throw new Error(`synthetic_first_authorization_failed:${JSON.stringify(firstPending)}`);
    }
    const firstRequest = getForgeRequest(value.db, firstPending.receipt_id)!;
    const authorization = getForgeAuthorizationByRequest(value.db, firstRequest.request_id)!;
    const attempt = reserveForgeAttempt(value.db, {
        request_id: firstRequest.request_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: `correction-${label}`,
        execution_receipt_id: `correction-receipt-${label}`,
        adapter_ref: firstRequest.adapter_ref!,
    }).attempt;
    finalizeForgeAttempt(value.db, {
        attempt_id: attempt.attempt_id,
        status: 'UNKNOWN',
        result_status: 'synthetic-ambiguous',
    });
    insertVerifiedInconclusive(value, firstRequest.request_id, attempt.attempt_id, CORRECTION_FIRST);
    const laterTurnId = randomUUID();
    appendUserMessage(
        session.sessionFile, laterTurnId, 'Continue the classified SET correction.',
        new Date(Date.parse(session.timestamp) + 20_000).toISOString(),
    );
    const laterContext = validRequestContext(session.threadId, laterTurnId);
    const created = parse(await handleBead({
        action: 'create',
        bead_id: CORRECTION_SECOND,
        target_kind: 'WORKFLOW',
        target_ref: `${CORRECTION_MISSION}:batch-2`,
        target_path: value.target,
        rationale: 'Create the bounded correction iteration.',
        status: 'IN_PROGRESS',
        metadata: iterationInput(firstRequest.request_sha256),
    }, laterContext));
    if (created.status !== 'created') {
        throw new Error(`synthetic_iteration_bead_failed:${JSON.stringify(created)}`);
    }
    const omittedArgs = requestArgs(
        value, CORRECTION_SECOND, `${CORRECTION_MISSION}:batch-2`, session.threadId,
    );
    const oldPending = parse(await handleForgeRequest(omittedArgs, laterContext));
    const oldRequest = getForgeRequestByDecision(
        value.db, CORRECTION_SECOND, `${CORRECTION_MISSION}:batch-2`,
    )!;
    const correctedArgs = completeArgs(
        value, extraTarget, CORRECTION_SECOND,
        `${CORRECTION_MISSION}:batch-2`, session.threadId,
    );
    return {
        value, session, laterContext, correctedArgs, omittedArgs,
        oldPending, oldRequest, firstRequest,
    };
}

export type CorrectionFixture = Awaited<ReturnType<typeof prepareForgeSetCorrection>>;

export function buildCorrectionInput(
    fixture: CorrectionFixture,
    mutate: (canonical: CanonicalForgeRequest) => void,
): SaveForgeRequestInput {
    const active = getForgeRequest(
        fixture.value.db,
        getActiveRequestId(fixture),
    )!;
    const canonical = JSON.parse(active.request_summary_json) as CanonicalForgeRequest;
    mutate(canonical);
    const requestSha256 = hashCanonicalForgeRequest(canonical);
    return {
        request_id: buildForgeRequestId(requestSha256),
        repo_id: active.repo_id,
        bead_id: active.bead_id,
        decision_id: active.decision_id,
        request_sha256: requestSha256,
        request_summary_json: stableJson(canonical),
        target_paths_sha256: hashForgeTargetPaths(canonical),
        live_source_allowed: canonical.spend_policy.live_source_allowed,
        max_attempts: canonical.max_attempts,
        requester_thread_id: active.requester_thread_id,
        requester_turn_id: active.requester_turn_id,
        requester_record_set_sha256: active.requester_record_set_sha256,
        authorization_profile: active.authorization_profile,
        adapter_ref: canonical.adapter_ref ?? undefined,
        write_capability: canonical.write_capability ?? undefined,
        now: active.updated_at + 1,
    };
}

function getActiveRequestId(fixture: CorrectionFixture): string {
    return String(fixture.value.db.prepare(`
        SELECT request_id FROM hall_forge_requests
        WHERE bead_id = ? AND decision_id = ? AND status <> 'SUPERSEDED'
    `).pluck().get(CORRECTION_SECOND, `${CORRECTION_MISSION}:batch-2`));
}
