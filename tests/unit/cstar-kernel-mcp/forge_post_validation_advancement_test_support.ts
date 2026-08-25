import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type {
    AuguryMissionBoundaryInputV2,
    AuguryMissionLane,
    AuguryMissionReceiptV2,
} from '../../../src/tools/cstar-kernel-mcp/contracts/augury_mission.js';
import type { ForgeChildRequestTemplateV1 } from
    '../../../src/tools/cstar-kernel-mcp/contracts/forge_child_request_template.js';
import { handleForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { handleRecordResult } from
    '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import {
    getForgeAuthorizationByRequest,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    finalizeForgeValidation,
    recordForgeDelivery,
    resolveForgeValidationSubject,
} from '../../../src/tools/pennyone/intel/forge_validation_controller.js';
import { materializeAuguryMissionReceipt } from
    '../../../src/tools/pennyone/intel/augury_mission_receipt_controller.js';
import { bindForgeMissionGrantEnvelopeMetadata } from
    '../../../src/tools/pennyone/intel/forge_mission_grant_envelope.js';
import { hashValidationEvidenceManifest } from
    '../../../src/types/validation_evidence.js';
import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS } from
    '../../../src/types/forge.js';
import {
    appendUserMessage,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import {
    beginNaturalAuthorizationTest,
    parse,
    setupRoot,
} from './forge_natural_authorization_test_support.js';
import {
    createV2Receipt,
    templateBinding,
} from './augury_mission_v2_test_support.js';

type Root = ReturnType<typeof setupRoot>;
type Context = ReturnType<typeof validRequestContext>;

export interface AdvancementFixture {
    value: Root;
    context: Context;
    session: ReturnType<typeof createSession>;
    receipt: AuguryMissionReceiptV2;
    parent_bead_id: string;
    child_bead_ids: string[];
    current_index: number;
    request: Record<string, any>;
    attempt_id: string;
    execution_receipt_id: string;
    delivery_path: string;
    check_path: string;
    lore_path: string;
    isolation_path: string;
}

export interface AdvancementFixtureOptions {
    lanes?: AuguryMissionLane[];
    dependencies?: string[][];
    provider_ceiling?: number;
    initial_forge_index?: number;
}

function digest(file: string): string {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function safe(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function write(root: string, relative: string, content: string): string {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, { mode: 0o600 });
    return absolute;
}

function template(lore: string, isolation: string): ForgeChildRequestTemplateV1 {
    return {
        schema: 'cstar.forge_child_request_template.v1',
        objective: 'Build one deterministic phase 4B child.',
        prompt: 'Return the bounded synthetic phase 4B packet.',
        system_under_test: 'CStar phase 4B',
        authority_lane: 'yellow',
        required_metrics: [{
            name: 'phase_4b',
            threshold: '= pass',
            acceptance_rule: null,
            unit: null,
        }],
        artifact_expectations: ['phase 4B validation packet'],
        requested_actions: ['response_only', 'validation_artifacts'],
        required_output_paths: [],
        lore_paths: [lore],
        isolation_paths: [isolation],
        callback_expected_packet: 'PHASE_4B_PACKET',
        package_locks: [],
    };
}

function requestArgs(fixture: AdvancementFixture, index: number) {
    const item = fixture.receipt.bead_plan[index]!;
    const bound = item.forge_child_request_template!;
    return {
        bead_id: item.bead_id,
        decision_id: `${fixture.receipt.mission_decision_id}:batch-${item.order + 1}`,
        source_callback_thread_id: fixture.session.threadId,
        objective: bound.objective,
        prompt: bound.prompt ?? undefined,
        target_paths: item.target_paths,
        required_output_paths: bound.required_output_paths,
        system_under_test: bound.system_under_test ?? undefined,
        scope: fixture.receipt.scope.scope_id,
        authority_lane: bound.authority_lane,
        required_metrics: bound.required_metrics.map((metric) => ({
            name: metric.name,
            threshold: metric.threshold,
            acceptance_rule: metric.acceptance_rule ?? undefined,
            unit: metric.unit ?? undefined,
        })),
        artifact_expectations: bound.artifact_expectations,
        prohibited_actions: [
            ...FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS,
            'project_files',
            'authorized_source_collection',
        ],
        requested_actions: bound.requested_actions,
        spend_policy: {
            mode: 'live_authorized' as const,
            max_retries: 0,
            live_source_allowed: false,
        },
        live_source_policy: 'synthetic_only; live source collection forbidden',
        fixture_policy: 'synthetic_only' as const,
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: {
            expected_packet: bound.callback_expected_packet,
            callback_required: true,
            callback_thread_id: fixture.session.threadId,
        },
        package_locks: bound.package_locks,
        execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
    };
}

export async function createAdvancementFixture(
    label: string,
    options: AdvancementFixtureOptions = {},
): Promise<AdvancementFixture> {
    beginNaturalAuthorizationTest();
    process.env.CSTAR_FORGE_TEST_MODE = '1';
    const normalized = safe(label);
    const value = setupRoot(`phase4b-${normalized}`);
    write(value.root, 'docs/operations/corvus-forge-skill-spec.md', '# Forge\n');
    write(value.root, 'docs/operations/corvus-forge-pipeline-playbook.md', '# Forge\n');
    const loreRelative = `tests/features/phase4b-${normalized}.feature`;
    const isolationRelative = `tests/unit/phase4b-${normalized}.test.ts`;
    const lorePath = write(value.root, loreRelative, [
        'Feature: Phase 4B fixture',
        '  Scenario: Accepted delivery advances',
        '    Given immutable evidence',
        '    Then the frontier advances once',
        '',
    ].join('\n'));
    const isolationPath = write(
        value.root, isolationRelative, 'export const phase4b = true;\n',
    );
    const lanes = options.lanes ?? ['forge', 'forge'];
    const parentBeadId = `bead:cstar:phase4b-${normalized}:parent`;
    const decisionId = `decision:cstar:phase4b-${normalized}`;
    const childIds = lanes.map((_, index) =>
        `bead:cstar:phase4b-${normalized}:${String(index + 1).padStart(2, '0')}`);
    const targets = lanes.map((_, index) => {
        const relative = `work/phase4b-${normalized}-${index + 1}.txt`;
        write(value.root, relative, `target ${index + 1}\n`);
        return relative;
    });
    const childTemplate = template(loreRelative, isolationRelative);
    const boundary: AuguryMissionBoundaryInputV2 = {
        schema: 'cstar.augury_mission_boundary.v2',
        version: 2,
        repository: {
            schema: 'cstar.repository_root_identity.v1',
            repository_id: `repo:cstar:phase4b-${normalized}`,
            root_path: value.root,
        },
        mission_decision_id: decisionId,
        proposed_parent_bead_id: parentBeadId,
        design: { revision: 4, sha256: createHash('sha256').update(label).digest('hex') },
        scope: { schema: 'cstar.mission_scope.v1', domain: 'brain', subject: 'CStar' },
        contained_target_paths: targets,
        bead_plan: lanes.map((lane, index) => ({
            bead_id: childIds[index]!,
            dependencies: options.dependencies?.[index]
                ?? [index === 0 ? parentBeadId : childIds[index - 1]!],
            lane,
            target_paths: [targets[index]!],
            acceptance_obligations: [`Phase 4B child ${index + 1} is accepted.`],
            checker_obligations: [`node --test phase4b-${index + 1}`],
            ...(lane === 'forge' ? templateBinding(childTemplate) : {
                forge_child_request_template: null,
                forge_child_request_template_sha256: null,
                forge_child_request_template_bytes: null,
            }),
        })),
    };
    const session = createSession({
        textParts: ['SET'],
        timestamp: new Date(Date.now() - 30_000).toISOString(),
    });
    const context = validRequestContext(session.threadId, session.turnId);
    const receipt = await createV2Receipt(boundary, value.root, session);
    const parentMetadata = bindForgeMissionGrantEnvelopeMetadata({
        source: 'cstar-kernel-mcp',
        schema: 'cstar.set_manifest.v1',
        operator_set: true,
        decision_id: decisionId,
        design_revision: receipt.design.revision,
        design_sha256: receipt.design.sha256,
        batch_order: childIds,
        mission_grant_envelope: {
            schema: 'cstar.forge_mission_grant_envelope.v1',
            allowed_targets: [value.root],
            allowed_outputs: [value.root],
            allowed_actions: ['response_only', 'validation_artifacts'],
            prohibited_actions: [
                ...FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS,
                'project_files',
                'authorized_source_collection',
            ],
            adapter_ref: 'cstar-forge-hermes-minimax-adapter',
            write_capability: 'response_only',
            total_provider_attempt_ceiling: options.provider_ceiling ?? lanes.length,
            retry_derived_iteration_ceiling: 0,
            paid_attempt_ceiling: options.provider_ceiling ?? lanes.length,
        },
        mutation_request_identity: {
            source: 'codex_request_meta',
            thread_id: receipt.set_identity.root_thread_id,
            turn_id: receipt.set_identity.set_turn_id,
            turn_record_set_sha256: receipt.set_identity.set_record_set_sha256,
        },
    });
    const now = Date.now();
    value.db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_ref, rationale, status,
            source_kind, metadata_json, created_at, updated_at
        ) VALUES (?, (SELECT repo_id FROM hall_repositories LIMIT 1),
                  'WORKFLOW', ?, 'Phase 4B parent', 'IN_PROGRESS',
                  'set_manifest', ?, ?, ?)
    `).run(parentBeadId, decisionId, JSON.stringify(parentMetadata), now, now);
    materializeAuguryMissionReceipt({
        db: value.db,
        expected_code_root: value.root,
        expected_control_root: value.root,
        receipt,
        now: now + 1,
    });
    const partial = {
        value, context, session, receipt, parent_bead_id: parentBeadId,
        child_bead_ids: childIds,
        current_index: options.initial_forge_index ?? 0,
    } as AdvancementFixture;
    const request = parse(await handleForgeRequest(
        requestArgs(partial, partial.current_index), context,
    ));
    if (request.status !== 'AUTHORIZED') {
        throw new Error(`phase4b_first_request_not_authorized:${JSON.stringify(request)}`);
    }
    const authorization = getForgeAuthorizationByRequest(value.db, request.receipt_id)!;
    const executionReceiptId = `forge-execute-phase4b-${normalized}`;
    const attempt = reserveForgeAttempt(value.db, {
        request_id: request.receipt_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: `phase4b-${normalized}`,
        execution_receipt_id: executionReceiptId,
        adapter_ref: request.authorized_execution_adapter.selected.ref,
    }).attempt;
    value.db.prepare(`
        UPDATE hall_forge_attempts
        SET status = 'STARTED', spawn_started_at = ?, updated_at = ?
        WHERE attempt_id = ?
    `).run(now + 2, now + 2, attempt.attempt_id);
    const deliveryPath = write(
        value.root, `work/evidence/phase4b-${normalized}.json`, '{"status":"ok"}\n',
    );
    const checkPath = write(
        value.root, `work/evidence/phase4b-${normalized}.txt`, 'phase 4B passed\n',
    );
    recordForgeDelivery(value.db, {
        attempt_id: attempt.attempt_id,
        external_execution_id: `synthetic-${normalized}`,
        result_status: 'ok',
        result_artifact_sha256: digest(deliveryPath),
        adapter_version: 'phase4b-test',
        now: now + 3,
    });
    return {
        ...partial,
        request,
        attempt_id: attempt.attempt_id,
        execution_receipt_id: executionReceiptId,
        delivery_path: deliveryPath,
        check_path: checkPath,
        lore_path: lorePath,
        isolation_path: isolationPath,
    };
}

export function validationEvidence(fixture: AdvancementFixture) {
    return {
        artifacts: [
            fixture.lore_path, fixture.isolation_path, fixture.delivery_path,
        ].map((file) => ({ path: file, sha256: digest(file) })),
        checks: [{
            name: 'phase 4B focused validation',
            status: 'pass' as const,
            evidence_path: fixture.check_path,
            sha256: digest(fixture.check_path),
        }],
    };
}

export async function recordFixtureResult(
    fixture: AdvancementFixture,
    validationId: string,
    verdict: 'SUCCESS' | 'FAILURE' = 'SUCCESS',
    context: Context = fixture.context,
) {
    return parse(await handleRecordResult({
        bead_id: fixture.child_bead_ids[fixture.current_index]!,
        verdict,
        validation_id: validationId,
        forge_execution_receipt_id: fixture.execution_receipt_id,
        validation_evidence: validationEvidence(fixture),
    }, context));
}

export function finalizeFixtureWithoutAdvancement(
    fixture: AdvancementFixture,
    validationId: string,
): void {
    const subject = resolveForgeValidationSubject(fixture.value.db, {
        execution_receipt_id: fixture.execution_receipt_id,
        repository_id: fixture.value.db.prepare(
            'SELECT repo_id FROM hall_forge_requests WHERE request_id = ?',
        ).pluck().get(fixture.request.receipt_id) as string,
        bead_id: fixture.child_bead_ids[fixture.current_index]!,
    }).subject;
    const manifest = {
        schema: 'cstar.validation-evidence.v2' as const,
        validator_identity: `codex-thread:validator-${validationId}:turn:turn-${validationId}`,
        validator_identity_source: 'test_fixture' as const,
        request_thread_id: `validator-${validationId}`,
        request_turn_id: `turn-${validationId}`,
        subject: {
            repository_id: subject.repository_id,
            bead_id: subject.bead_id,
            work_receipt_kind: subject.work_receipt_kind,
            work_receipt_id: subject.work_receipt_id,
            forge_request_id: subject.forge_request_id,
            forge_request_sha256: subject.forge_request_sha256,
            decision_id: subject.decision_id,
            target_paths_sha256: subject.target_paths_sha256,
            attempt_id: subject.attempt_id,
            result_artifact_sha256: subject.result_artifact_sha256,
            adapter_ref: subject.adapter_ref,
            adapter_version: subject.adapter_version,
            external_execution_id: subject.external_execution_id,
        },
        independence: {
            policy: 'distinct_codex_root_thread_from_forge_requester_and_executor_v1' as const,
            validator_thread_id: `validator-${validationId}`,
            requester_thread_id: subject.requester_thread_id,
            requester_turn_id: subject.requester_turn_id,
            requester_record_set_sha256: subject.requester_record_set_sha256,
            executor_binding: 'forge_exact_authorizing_turn_v1' as const,
            authorization_id: subject.authorization_id,
            executor_thread_id: subject.executor_thread_id,
            executor_turn_id: subject.executor_turn_id,
            executor_record_sha256: subject.executor_record_sha256,
            executor_record_set_sha256: subject.executor_record_set_sha256,
            executor_record_count: subject.executor_record_count,
        },
        artifacts: validationEvidence(fixture).artifacts,
        checks: validationEvidence(fixture).checks,
    };
    fixture.value.db.prepare(`
        INSERT INTO hall_validation_runs (
            validation_id, repo_id, bead_id, verdict, notes, authority_class,
            evidence_sha256, validator_identity, validator_identity_source,
            evidence_manifest_json, created_at
        ) VALUES (?, ?, ?, 'SUCCESS', '', 'verified_v2', ?, ?, ?, ?, ?)
    `).run(
        validationId,
        subject.repository_id,
        subject.bead_id,
        hashValidationEvidenceManifest(manifest),
        manifest.validator_identity,
        manifest.validator_identity_source,
        JSON.stringify(manifest),
        Date.now(),
    );
    finalizeForgeValidation(fixture.value.db, {
        execution_receipt_id: fixture.execution_receipt_id,
        validation_id: validationId,
    });
}

export function tableCount(fixture: AdvancementFixture, table: string): number {
    return Number(fixture.value.db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get());
}

export function laterRootContext(fixture: AdvancementFixture): Context {
    const turnId = randomUUID();
    appendUserMessage(
        fixture.session.sessionFile,
        turnId,
        'Continue the unchanged SET mission structure.',
        new Date(Date.parse(fixture.session.timestamp) + 20_000).toISOString(),
    );
    return validRequestContext(fixture.session.threadId, turnId);
}

export { requestArgs as derivedRequestArgs };
