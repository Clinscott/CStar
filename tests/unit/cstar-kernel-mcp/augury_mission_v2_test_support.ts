import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { selectCouncilExpert } from '../../../src/core/council_experts.js';
import {
    hashAuguryMissionValue,
    stableAuguryMissionJson,
    type AuguryMissionBoundaryInputV2,
    type AuguryMissionReceiptV2,
} from '../../../src/tools/cstar-kernel-mcp/contracts/augury_mission.js';
import type { ForgeChildRequestTemplateV1 } from
    '../../../src/tools/cstar-kernel-mcp/contracts/forge_child_request_template.js';
import {
    finalizeAuguryMissionBoundary,
    prepareAuguryMissionBoundary,
} from '../../../src/tools/cstar-kernel-mcp/tools/augury_mission_binding.js';
import {
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

export const V2_THREAD_ID = '31111111-1111-4111-8111-111111111111';
export const V2_TURN_ID = '32222222-2222-4222-8222-222222222222';
export const V2_TIMESTAMP = '2026-07-30T18:00:00.000Z';

const roots: string[] = [];

export function cleanupV2Roots(): void {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
}

export function createV2Root(prefix = 'cstar-augury-v2-'): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    populateV2Root(root);
    return root;
}

export function createFixedV2Root(root: string): string {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    roots.push(root);
    populateV2Root(root);
    return root;
}

function populateV2Root(root: string): void {
    for (const target of [
        'work/source.ts',
        'review/result.txt',
        'tests/features/mission.feature',
        'tests/unit/mission.test.ts',
        'tests/unit/mission.py',
    ]) {
        fs.mkdirSync(path.dirname(path.join(root, target)), { recursive: true });
        fs.writeFileSync(path.join(root, target), 'fixture\n');
    }
}

export function responseOnlyTemplate(
    overrides: Partial<ForgeChildRequestTemplateV1> = {},
): ForgeChildRequestTemplateV1 {
    return {
        schema: 'cstar.forge_child_request_template.v1',
        objective: 'Implement one exact Forge child.',
        prompt: null,
        system_under_test: 'CStar Augury v2',
        authority_lane: 'green',
        required_metrics: [{
            name: 'focused_tests',
            threshold: 'all pass',
            acceptance_rule: null,
            unit: null,
        }],
        artifact_expectations: ['Canonical response and validation evidence.'],
        requested_actions: ['response_only', 'validation_artifacts'],
        required_output_paths: [],
        lore_paths: ['tests/features/mission.feature'],
        isolation_paths: ['tests/unit/mission.test.ts'],
        callback_expected_packet: 'Return exact files, checks, and hashes.',
        package_locks: [],
        ...overrides,
    };
}

export function templateBinding(template: ForgeChildRequestTemplateV1) {
    const canonical = stableAuguryMissionJson(template);
    return {
        forge_child_request_template: template,
        forge_child_request_template_sha256: hashAuguryMissionValue(template),
        forge_child_request_template_bytes: Buffer.byteLength(canonical, 'utf-8'),
    };
}

export function v2Boundary(
    root: string,
    template = responseOnlyTemplate(),
): AuguryMissionBoundaryInputV2 {
    return {
        schema: 'cstar.augury_mission_boundary.v2',
        version: 2,
        repository: {
            schema: 'cstar.repository_root_identity.v1',
            repository_id: 'repo:cstar:augury-v2',
            root_path: root,
        },
        mission_decision_id: 'decision:cstar:augury-v2',
        proposed_parent_bead_id: 'bead:cstar:augury-v2:parent',
        design: { revision: 4, sha256: 'b'.repeat(64) },
        scope: { schema: 'cstar.mission_scope.v1', domain: 'brain', subject: 'CStar' },
        contained_target_paths: ['work/source.ts', 'review/result.txt'],
        bead_plan: [
            {
                bead_id: 'bead:cstar:augury-v2:forge',
                dependencies: ['bead:cstar:augury-v2:parent'],
                lane: 'forge',
                target_paths: ['work/source.ts'],
                acceptance_obligations: ['Forge request template is immutable.'],
                checker_obligations: ['node --test augury-v2-forge'],
                ...templateBinding(template),
            },
            {
                bead_id: 'bead:cstar:augury-v2:validator',
                dependencies: ['bead:cstar:augury-v2:forge'],
                lane: 'corvus_eye',
                target_paths: ['review/result.txt'],
                acceptance_obligations: ['Validation remains independent.'],
                checker_obligations: ['node --test augury-v2-validator'],
                forge_child_request_template: null,
                forge_child_request_template_sha256: null,
                forge_child_request_template_bytes: null,
            },
        ],
    };
}

function route(targets: readonly string[]) {
    const intent = 'build exact Augury v2 mission boundary';
    const selected = selectCouncilExpert({
        intent_category: 'BUILD',
        intent,
        selection_tier: 'SKILL',
        selection_name: 'cstar-kernel',
        mimirs_well: targets.slice(0, 3),
    });
    return {
        intent_category: 'BUILD',
        intent,
        selection: 'SKILL: cstar-kernel',
        expert: selected.id,
        expert_label: selected.label,
        expert_lens: selected.lens,
        expert_signature_question: selected.signature_question,
        expert_guardrails: selected.anti_behavior.slice(0, 3),
        council_candidates: selected.selection_candidates,
        mimir_targets: targets.slice(0, 3),
    };
}

export function setSession(options: Parameters<typeof createSession>[0] = {}) {
    return createSession({
        threadId: V2_THREAD_ID,
        turnId: V2_TURN_ID,
        timestamp: V2_TIMESTAMP,
        textParts: ['SET'],
        ...options,
    });
}

export async function createV2Receipt(
    boundary: AuguryMissionBoundaryInputV2,
    root: string,
    session = setSession(),
): Promise<AuguryMissionReceiptV2> {
    const prepared = await prepareAuguryMissionBoundary({
        boundary,
        expected_root: root,
        request_context: validRequestContext(session.threadId, session.turnId),
        now: Date.parse(session.timestamp) + 1_000,
    });
    const receipt = finalizeAuguryMissionBoundary({
        prepared,
        route: route(prepared.target_paths),
    });
    if (receipt.schema !== 'cstar.augury_mission_receipt.v2') {
        throw new Error('test_expected_augury_mission_receipt_v2');
    }
    return receipt;
}

export function cloneV2<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

export function bindV2Replay(
    boundary: AuguryMissionBoundaryInputV2,
    receipt: AuguryMissionReceiptV2,
): void {
    boundary.replay = {
        canonical_payload_sha256: receipt.canonical_payload_sha256,
        receipt_id: receipt.receipt_id,
        ordered_plan_count: receipt.ordered_plan_count,
        ordered_plan_sha256: receipt.ordered_plan_sha256,
        forge_request_template_count: receipt.forge_request_template_count,
        ordered_forge_request_templates_sha256:
            receipt.ordered_forge_request_templates_sha256,
    };
}
