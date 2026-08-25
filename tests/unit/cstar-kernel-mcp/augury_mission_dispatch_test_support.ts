import type { AuguryMissionBoundaryInput, AuguryMissionReceipt } from
    '../../../src/tools/cstar-kernel-mcp/contracts/augury_mission.js';
import { CODE_ROOT } from '../../../src/tools/cstar-kernel-mcp/contracts/runtime.js';
import { handleAugury } from '../../../src/tools/cstar-kernel-mcp/tools/augury.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { verifyCodexRequestIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { bindForgeMissionGrantEnvelopeMetadata } from
    '../../../src/tools/pennyone/intel/forge_mission_grant_envelope.js';
import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS } from
    '../../../src/types/forge.js';
import type { McpTextResponse } from
    '../../../src/tools/cstar-kernel-mcp/contracts/responses.js';
import {
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import {
    parse,
    requestArgs,
    setupRoot,
} from './forge_natural_authorization_test_support.js';

export interface DispatchFixture {
    value: ReturnType<typeof setupRoot>;
    session: ReturnType<typeof createSession>;
    context: ReturnType<typeof validRequestContext>;
    boundary: AuguryMissionBoundaryInput;
    parent_bead_id: string;
    child_bead_ids: string[];
    decision_id: string;
    parent_metadata_bytes: string;
}

function safeLabel(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

function missionTargets(label: string, count: number): string[] {
    return Array.from({ length: count }, (_, index) =>
        `tests/unit/cstar-kernel-mcp/phase3-${label}-${String(index + 1).padStart(2, '0')}.ts`);
}

function insertParent(
    fixture: Omit<DispatchFixture, 'parent_metadata_bytes'>,
    metadataBytes: string,
): void {
    const now = Date.now();
    fixture.value.db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_ref, target_path, rationale,
            status, source_kind, metadata_json, created_at, updated_at
        ) VALUES (?, (SELECT repo_id FROM hall_repositories LIMIT 1), 'WORKFLOW',
                  ?, NULL, 'Phase 3 SET parent.', 'IN_PROGRESS',
                  'set_manifest', ?, ?, ?)
    `).run(
        fixture.parent_bead_id,
        fixture.decision_id,
        metadataBytes,
        now,
        now,
    );
}

export async function createDispatchFixture(
    label: string,
    childCount = 2,
): Promise<DispatchFixture> {
    const normalized = safeLabel(label);
    const value = setupRoot(`augury-dispatch-${normalized}`);
    const session = createSession({
        textParts: ['SET'],
        timestamp: new Date(Date.now() - 30_000).toISOString(),
    });
    const context = validRequestContext(session.threadId, session.turnId);
    const identity = await verifyCodexRequestIdentity(context);
    const parentBeadId = `bead:cstar:phase3-${normalized}:parent`;
    const decisionId = `decision:cstar:phase3-${normalized}`;
    const childBeadIds = Array.from({ length: childCount }, (_, index) =>
        `bead:cstar:phase3-${normalized}:${String(index + 1).padStart(2, '0')}`);
    const targets = missionTargets(normalized, childCount);
    const boundary: AuguryMissionBoundaryInput = {
        schema: 'cstar.augury_mission_boundary.v1',
        repository: {
            schema: 'cstar.repository_root_identity.v1',
            repository_id: `repo:cstar:phase3-${normalized}`,
            root_path: CODE_ROOT,
        },
        mission_decision_id: decisionId,
        proposed_parent_bead_id: parentBeadId,
        design: { revision: 3, sha256: '7'.repeat(64) },
        scope: { schema: 'cstar.mission_scope.v1', domain: 'brain', subject: 'CStar' },
        contained_target_paths: targets,
        bead_plan: childBeadIds.map((beadId, index) => ({
            bead_id: beadId,
            dependencies: [index === 0 ? parentBeadId : childBeadIds[index - 1]!],
            lane: index === childCount - 1 ? 'corvus_eye' : 'forge',
            target_paths: [targets[index]!],
            acceptance_obligations: [`Phase 3 item ${index + 1} is exact.`],
            checker_obligations: [`node --test phase3-${index + 1}`],
        })),
    };
    const metadataBytes = JSON.stringify(bindForgeMissionGrantEnvelopeMetadata({
        source: 'cstar-kernel-mcp',
        schema: 'cstar.set_manifest.v1',
        operator_set: true,
        decision_id: decisionId,
        design_revision: boundary.design.revision,
        design_sha256: boundary.design.sha256,
        batch_order: childBeadIds,
        mission_grant_envelope: {
            schema: 'cstar.forge_mission_grant_envelope.v1',
            allowed_targets: [value.target],
            allowed_outputs: [value.target],
            allowed_actions: ['response_only', 'validation_artifacts'],
            prohibited_actions: [
                ...FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS,
                'project_files',
                'authorized_source_collection',
            ],
            adapter_ref: 'cstar-forge-hermes-minimax-adapter',
            write_capability: 'response_only',
            total_provider_attempt_ceiling: childCount,
            retry_derived_iteration_ceiling: 0,
            paid_attempt_ceiling: childCount,
        },
        mutation_request_identity: {
            source: 'codex_request_meta',
            thread_id: identity.thread_id,
            turn_id: identity.turn_id,
            turn_record_set_sha256: identity.turn_record_set_sha256,
        },
    }));
    const partial = {
        value, session, context, boundary,
        parent_bead_id: parentBeadId,
        child_bead_ids: childBeadIds,
        decision_id: decisionId,
    };
    insertParent(partial, metadataBytes);
    return { ...partial, parent_metadata_bytes: metadataBytes };
}

export function cloneBoundary(
    fixture: DispatchFixture,
): AuguryMissionBoundaryInput {
    return JSON.parse(JSON.stringify(fixture.boundary)) as AuguryMissionBoundaryInput;
}

export function bindReplay(
    boundary: AuguryMissionBoundaryInput,
    receipt: AuguryMissionReceipt,
): void {
    boundary.replay = {
        canonical_payload_sha256: receipt.canonical_payload_sha256,
        receipt_id: receipt.receipt_id,
        ordered_plan_count: receipt.ordered_plan_count,
        ordered_plan_sha256: receipt.ordered_plan_sha256,
    };
}

export async function callBoundaryAugury(
    fixture: DispatchFixture,
    boundary: AuguryMissionBoundaryInput = cloneBoundary(fixture),
): Promise<{ response: McpTextResponse; payload: Record<string, any> }> {
    const response = await handleAugury({
        prompt: 'Build the exact phase three mission.',
        mission_boundary: boundary,
    }, fixture.context);
    return { response, payload: parse(response) };
}

export async function requestFirstChild(
    fixture: DispatchFixture,
): Promise<Record<string, any>> {
    const args = requestArgs(
        fixture.value,
        fixture.child_bead_ids[0]!,
        `${fixture.decision_id}:batch-1`,
        fixture.session.threadId,
    );
    return parse(await handleForgeRequest(args, fixture.context));
}

export function tableCount(fixture: DispatchFixture, table: string): number {
    return Number(fixture.value.db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get());
}

export function parentMetadataBytes(fixture: DispatchFixture): string {
    return String(fixture.value.db.prepare(
        'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
    ).pluck().get(fixture.parent_bead_id));
}
