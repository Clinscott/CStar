import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { handleForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { handleBead } from
    '../../../src/tools/cstar-kernel-mcp/tools/bead.js';
import { verifyCodexRequestIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import {
    buildForgeOperatorIntentProjection,
    forgeOperatorIntentProjectionJson,
    hashRootUserForgeIntentBinding,
} from '../../../src/tools/pennyone/intel/forge_authorization_policy.js';
import { authorizeForgeRequest } from
    '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import {
    finalizeForgeAttempt,
    getForgeAuthorizationByRequest,
    getForgeRequest,
    getForgeRequestByDecision,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { bindForgeMissionGrantEnvelopeMetadata }
    from '../../../src/tools/pennyone/intel/forge_mission_grant_envelope.js';
import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS }
    from '../../../src/types/forge.js';
import {
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
    type CanonicalForgeRequest,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import {
    appendUserMessage,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    insertBead,
    parse,
    requestArgs,
    setupRoot,
} from './forge_natural_authorization_test_support.js';

const PARENT = 'bead:cstar:set-controller-parent-test';
const FIRST = 'bead:cstar:set-controller-first-test';
const SECOND = 'bead:cstar:set-controller-second-test';
const MISSION = 'decision:cstar:set-controller-test';
const DESIGN = 'd'.repeat(64);

type Identity = Awaited<ReturnType<typeof verifyCodexRequestIdentity>>;
type Fixture = Awaited<ReturnType<typeof prepare>>;

function mutationIdentity(identity: Identity) {
    return {
        source: 'codex_request_meta',
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        turn_record_set_sha256: identity.turn_record_set_sha256,
    };
}

function writeMetadata(fixture: ReturnType<typeof setupRoot>, beadId: string, metadata: object) {
    fixture.db.prepare('UPDATE hall_beads SET metadata_json = ? WHERE bead_id = ?')
        .run(JSON.stringify(metadata), beadId);
}

function rewriteMetadata(
    fixture: Fixture,
    beadId: string,
    update: (metadata: Record<string, any>) => void,
) {
    const raw = fixture.value.db.prepare(
        'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
    ).pluck().get(beadId) as string;
    const metadata = JSON.parse(raw) as Record<string, any>;
    update(metadata);
    writeMetadata(fixture.value, beadId, metadata);
}

function iterationInput(predecessorSha256: string) {
    return {
        schema: 'cstar.set_manifest_iteration.v1',
        parent_bead_id: PARENT,
        iteration_of: FIRST,
        order: 2,
        design_sha256: DESIGN,
        owning_lane: 'Forge',
        max_attempts: 1,
        retry_budget: 0,
        live_source_allowed: false,
        fixture_policy: 'synthetic_only',
        predecessor_request_sha256: predecessorSha256,
    };
}

function iterationMetadata(identity: Identity, predecessorSha256: string) {
    return {
        source: 'cstar-kernel-mcp',
        ...iterationInput(predecessorSha256),
        mutation_request_identity: mutationIdentity(identity),
        authority_tier: 'reference',
        archived: false,
    };
}

async function prepare(label: string) {
    const value = setupRoot(`set-controller-${label}`);
    const session = createSession({
        textParts: ['SET'],
        timestamp: new Date(Date.now() - 30_000).toISOString(),
    });
    const setContext = validRequestContext(session.threadId, session.turnId);
    const setIdentity = await verifyCodexRequestIdentity(setContext);
    insertBead(value, PARENT, MISSION);
    insertBead(value, FIRST, `${MISSION}:batch-1`);
    writeMetadata(value, PARENT, bindForgeMissionGrantEnvelopeMetadata({
        source: 'cstar-kernel-mcp',
        schema: 'cstar.set_manifest.v1',
        decision_id: MISSION,
        design_revision: 1,
        design_sha256: DESIGN,
        batch_order: [FIRST],
        operator_set: true,
        mission_grant_envelope: {
            schema: 'cstar.forge_mission_grant_envelope.v1',
            allowed_targets: [value.target],
            allowed_outputs: [value.target],
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
        mutation_request_identity: mutationIdentity(setIdentity),
    }));
    writeMetadata(value, FIRST, {
        source: 'cstar-kernel-mcp',
        parent_bead_id: PARENT,
        order: 1,
        depends_on: [],
        design_sha256: DESIGN,
        owning_lane: 'Forge',
        mutation_request_identity: mutationIdentity(setIdentity),
    });
    const firstPending = parse(await handleForgeRequest(
        requestArgs(value, FIRST, `${MISSION}:batch-1`, session.threadId),
        setContext,
    ));
    assert.equal(firstPending.status, 'AUTHORIZED', JSON.stringify(firstPending));
    const firstRequest = getForgeRequest(value.db, firstPending.receipt_id)!;
    const firstAuthorization = getForgeAuthorizationByRequest(
        value.db, firstRequest.request_id,
    )!;
    const attempt = reserveForgeAttempt(value.db, {
        request_id: firstRequest.request_id,
        authorization_id: firstAuthorization.authorization_id,
        idempotency_key: `controller-${label}`,
        execution_receipt_id: `controller-receipt-${label}`,
        adapter_ref: firstRequest.adapter_ref!,
    }).attempt;
    finalizeForgeAttempt(value.db, {
        attempt_id: attempt.attempt_id,
        status: 'UNKNOWN',
        result_status: 'synthetic-ambiguous',
    });
    const validationId = `validation:set-controller:${label}`;
    const evidenceSha256 = createHash('sha256').update(validationId).digest('hex');
    value.db.prepare(`
        INSERT INTO hall_validation_runs (
            validation_id, repo_id, bead_id, verdict, notes, authority_class,
            evidence_sha256, validator_identity, validator_identity_source,
            evidence_manifest_json, created_at
        ) VALUES (?, ?, ?, 'INCONCLUSIVE', 'synthetic controller fixture',
                  'verified_v2', ?, ?, 'test_fixture', '{}', ?)
    `).run(
        validationId, firstRequest.repo_id, FIRST, evidenceSha256,
        `validator-${label}`, Date.now(),
    );
    value.db.prepare(`
        UPDATE hall_forge_attempts
        SET validation_id = ?, validation_verdict = 'INCONCLUSIVE',
            validation_authority = 'verified_v2', validation_evidence_sha256 = ?
        WHERE attempt_id = ?
    `).run(validationId, evidenceSha256, attempt.attempt_id);
    const laterTurnId = randomUUID();
    appendUserMessage(
        session.sessionFile, laterTurnId, 'Continue the classified SET iteration.',
        new Date(Date.parse(session.timestamp) + 20_000).toISOString(),
    );
    const laterContext = validRequestContext(session.threadId, laterTurnId);
    const laterIdentity = await verifyCodexRequestIdentity(laterContext);
    const created = parse(await handleBead({
        action: 'create',
        bead_id: SECOND,
        target_kind: 'WORKFLOW',
        target_ref: `${MISSION}:batch-2`,
        target_path: value.target,
        rationale: 'Create the bounded classified SET iteration.',
        status: 'IN_PROGRESS',
        metadata: iterationInput(firstRequest.request_sha256),
    }, laterContext));
    assert.equal(created.status, 'created', JSON.stringify(created));
    const blocked = parse(await handleForgeRequest(
        requestArgs(value, SECOND, `${MISSION}:batch-2`, session.threadId),
        laterContext,
    ));
    assert.equal(
        blocked.error_code,
        'forge_set_manifest_iteration_predecessor_not_authoritative',
    );
    const pendingRequest = getForgeRequestByDecision(
        value.db, SECOND, `${MISSION}:batch-2`,
    )!;
    const pending = {
        receipt_id: pendingRequest.request_id,
        request_sha256: pendingRequest.request_sha256,
    };
    return {
        value, session, setIdentity, laterIdentity, laterContext,
        firstRequest, firstAuthorization, attempt, pending,
    };
}

function directInput(fixture: Fixture) {
    const request = getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!;
    const projection = buildForgeOperatorIntentProjection({
        action: 'implement',
        requester_lineage_mode: 'stored_set_manifest',
        kind: 'bead',
        value: request.bead_id,
        repo_id: request.repo_id,
    });
    const operatorAuthorizationRef = `cstar-forge-set-manifest:${
        createHash('sha256').update(request.request_sha256).digest('hex')}`;
    const input = {
        request_id: request.request_id,
        request_sha256: request.request_sha256,
        authorization_profile: 'root_user_forge_intent_v1' as const,
        operator_intent_json: forgeOperatorIntentProjectionJson(projection),
        operator_authorization_ref: operatorAuthorizationRef,
        operator_thread_id: fixture.firstAuthorization.operator_thread_id,
        operator_turn_id: fixture.firstAuthorization.operator_turn_id,
        operator_message_sha256: fixture.firstAuthorization.operator_message_sha256,
        operator_record_sha256: fixture.firstAuthorization.operator_record_sha256,
        operator_record_set_sha256: fixture.firstAuthorization.operator_record_set_sha256,
        operator_record_count: fixture.firstAuthorization.operator_record_count,
        authorized_at: fixture.firstAuthorization.authorized_at,
        expires_at: fixture.firstAuthorization.expires_at,
    };
    return {
        ...input,
        authorization_binding_sha256: hashRootUserForgeIntentBinding({
            request,
            projection,
            operator_thread_id: input.operator_thread_id,
            operator_turn_id: input.operator_turn_id,
            operator_message_sha256: input.operator_message_sha256,
            operator_record_sha256: input.operator_record_sha256,
            operator_record_set_sha256: input.operator_record_set_sha256,
            operator_record_count: input.operator_record_count,
        }),
    };
}

function rewriteRequest(fixture: Fixture, update: (request: CanonicalForgeRequest) => void) {
    const request = getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!;
    const canonical = JSON.parse(request.request_summary_json) as CanonicalForgeRequest;
    update(canonical);
    const requestSha256 = hashCanonicalForgeRequest(canonical);
    fixture.value.db.prepare(`
        UPDATE hall_forge_requests
        SET request_sha256 = ?, request_summary_json = ?, target_paths_sha256 = ?,
            live_source_allowed = ?, max_attempts = ?
        WHERE request_id = ?
    `).run(
        requestSha256, stableJson(canonical), hashForgeTargetPaths(canonical),
        canonical.spend_policy.live_source_allowed ? 1 : 0,
        canonical.max_attempts, request.request_id,
    );
}

function assertControllerRejected(fixture: Fixture) {
    assert.throws(
        () => authorizeForgeRequest(fixture.value.db, directInput(fixture)),
        /forge_operator_turn_already_consumed/,
    );
}

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

describe('SET iteration low-level controller guard', () => {
    it('rejects even the exact legacy iteration after ambiguous spend', async () => {
        const fixture = await prepare('exact');
        const stored = JSON.parse(fixture.value.db.prepare(
            'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
        ).pluck().get(SECOND) as string);
        assert.equal(stored.authority_tier, 'reference');
        assert.equal(stored.archived, false);
        assertControllerRejected(fixture);
    });

    for (const [label, mutate] of [
        ['parent lineage', (f: Fixture) => rewriteMetadata(
            f, SECOND, (m) => { m.parent_bead_id = `${PARENT}:other`; },
        )],
        ['design lineage', (f: Fixture) => rewriteMetadata(
            f, SECOND, (m) => { m.design_sha256 = 'e'.repeat(64); },
        )],
        ['root lineage', (f: Fixture) => rewriteMetadata(
            f, SECOND, (m) => { m.mutation_request_identity.thread_id = randomUUID(); },
        )],
        ['order gap', (f: Fixture) => rewriteMetadata(
            f, SECOND, (m) => { m.order = 3; },
        )],
        ['non-immediate predecessor', (f: Fixture) => rewriteMetadata(
            f, SECOND, (m) => { m.iteration_of = PARENT; },
        )],
        ['predecessor authorization lineage', (f: Fixture) => {
            f.value.db.prepare(`
                UPDATE hall_forge_requests SET operator_message_sha256 = ?
                WHERE request_id = ?
            `).run('f'.repeat(64), f.firstRequest.request_id);
        }],
        ['active attempt lineage', (f: Fixture) => {
            f.value.db.prepare(`
                UPDATE hall_forge_requests SET active_attempt_id = ?
                WHERE request_id = ?
            `).run('wrong-attempt', f.firstRequest.request_id);
        }],
        ['non-reference authority default', (f: Fixture) => rewriteMetadata(
            f, SECOND, (m) => { m.authority_tier = 'live_authority'; },
        )],
        ['archived true default', (f: Fixture) => rewriteMetadata(
            f, SECOND, (m) => { m.archived = true; },
        )],
    ] as Array<[string, (fixture: Fixture) => void]>) {
        it(`rejects omitted ${label} checks at the controller`, async () => {
            const fixture = await prepare(label.replaceAll(' ', '-'));
            mutate(fixture);
            assertControllerRejected(fixture);
        });
    }

    it('rejects branch ambiguity at the controller', async () => {
        const fixture = await prepare('branch');
        const competing = `${SECOND}:competing`;
        insertBead(fixture.value, competing, `${MISSION}:batch-2`);
        writeMetadata(
            fixture.value,
            competing,
            iterationMetadata(fixture.laterIdentity, fixture.firstRequest.request_sha256),
        );
        assertControllerRejected(fixture);
    });

    for (const [label, mutate] of [
        ['targets', (request: CanonicalForgeRequest) => {
            request.target_paths.push(`${request.target_paths[0]}.expanded`);
        }],
        ['scope', (request: CanonicalForgeRequest) => {
            request.scope += ' expanded';
        }],
        ['spend', (request: CanonicalForgeRequest) => {
            request.spend_policy.live_source_allowed = true;
        }],
        ['retry', (request: CanonicalForgeRequest) => {
            request.spend_policy.max_retries = 1;
            request.retry_budget = 1;
        }],
    ] as Array<[string, (request: CanonicalForgeRequest) => void]>) {
        it(`rejects ${label} widening at the controller`, async () => {
            const fixture = await prepare(`${label}-widening`);
            rewriteRequest(fixture, mutate);
            assertControllerRejected(fixture);
        });
    }
});
