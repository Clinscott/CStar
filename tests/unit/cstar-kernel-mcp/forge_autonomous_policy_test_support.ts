import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { CODE_ROOT } from '../../../src/tools/cstar-kernel-mcp/contracts/runtime.js';
import {
    hashAuguryMissionValue,
    stableAuguryMissionJson,
} from '../../../src/tools/cstar-kernel-mcp/contracts/augury_mission.js';
import {
    FORGE_CHILD_REQUEST_TEMPLATE_SCHEMA,
    type ForgeChildRequestTemplateV1,
} from '../../../src/tools/cstar-kernel-mcp/contracts/forge_child_request_template.js';
import {
    AUTONOMOUS_DISPATCH_CHILD_SCHEMA,
    AUTONOMOUS_DISPATCH_POLICY_SCHEMA,
    hashAutonomousDispatchChild,
    hashAutonomousDispatchPolicy,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_autonomous_policy_contract.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { verifyCodexRequestIdentity } from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS }
    from '../../../src/types/forge.js';
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
    setupRoot,
} from './forge_natural_authorization_test_support.js';

const POLICY_PARENT = 'bead:cstar:autonomous-policy:parent';
const POLICY_DECISION = 'decision:cstar:autonomous-hermes-dispatch-policy-test';
const WORKER_ADAPTER = path.join(
    CODE_ROOT, '.agents/skills/corvus-forge/scripts/forge_worker_adapter.py',
);
const originalWorkerAdapter = process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT;
const originalHermes = process.env.HERMES_BIN;
const originalTestMode = process.env.CSTAR_FORGE_TEST_MODE;
const originalNodeTestContext = process.env.NODE_TEST_CONTEXT;

type Root = ReturnType<typeof setupRoot>;
type Context = ReturnType<typeof validRequestContext>;
type Identity = Awaited<ReturnType<typeof verifyCodexRequestIdentity>>;

export interface AutonomousPolicyFixture {
    value: Root;
    session: ReturnType<typeof createSession>;
    context: Context;
    identity: Identity;
    issuedAt: number;
    expiresAt: number;
    prohibitedActions: string[];
    children: Array<{ beadId: string; decisionId: string; template: ForgeChildRequestTemplateV1 }>;
}

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

function writeSyntheticHermes(root: string): string {
    const executable = path.join(root, 'synthetic-hermes.mjs');
    fs.writeFileSync(executable, `#!${process.execPath}\nprocess.exit(0);\n`, { mode: 0o700 });
    fs.chmodSync(executable, 0o700);
    return executable;
}

function mutationIdentity(identity: Identity) {
    return {
        source: 'codex_request_meta',
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        turn_record_set_sha256: identity.turn_record_set_sha256,
    };
}

function writeMetadata(value: Root, beadId: string, metadata: object): void {
    value.db.prepare('UPDATE hall_beads SET metadata_json = ? WHERE bead_id = ?')
        .run(JSON.stringify(metadata), beadId);
}

export function autonomousPolicyChildTemplate(): ForgeChildRequestTemplateV1 {
    return {
        schema: FORGE_CHILD_REQUEST_TEMPLATE_SCHEMA,
        objective: 'Build the bounded autonomous Hermes policy seam.',
        prompt: 'Return only the bounded synthetic implementation and focused proof.',
        system_under_test: 'CStar autonomous Hermes dispatch policy',
        authority_lane: 'yellow',
        required_metrics: [{
            name: 'autonomous_dispatch', threshold: '= pass', acceptance_rule: null, unit: null,
        }],
        artifact_expectations: ['autonomous policy source', 'focused policy tests'],
        requested_actions: ['project_files', 'validation_artifacts'],
        required_output_paths: [
            'src/autonomous-policy.ts',
            'tests/features/autonomous-policy.feature',
            'tests/unit/autonomous-policy.test.ts',
        ],
        lore_paths: ['tests/features/autonomous-policy.feature'],
        isolation_paths: ['tests/unit/autonomous-policy.test.ts'],
        callback_expected_packet: 'AUTONOMOUS_POLICY_TEST',
        package_locks: [],
    };
}

function insertPolicyParent(
    value: Root,
    identity: Identity,
    prohibitedActions: string[],
    providerAttemptCeiling: number,
): { issuedAt: number; expiresAt: number } {
    insertBead(value, POLICY_PARENT, POLICY_DECISION);
    value.db.prepare('UPDATE hall_beads SET target_path = ? WHERE bead_id = ?')
        .run(value.root, POLICY_PARENT);
    const issuedAt = Number(value.db.prepare(
        'SELECT created_at FROM hall_beads WHERE bead_id = ?',
    ).pluck().get(POLICY_PARENT));
    const expiresAt = issuedAt + 60 * 60 * 1_000;
    const metadata: Record<string, unknown> = {
        source: 'cstar-kernel-mcp',
        schema: AUTONOMOUS_DISPATCH_POLICY_SCHEMA,
        version: 1,
        policy_id: POLICY_DECISION,
        policy_sha256: '',
        code_root: value.root,
        allowed_lanes: ['forge', 'researcher'],
        provider_profiles: ['hermes:minimax', 'hermes:x-grok'],
        prohibited_actions: prohibitedActions,
        provider_attempt_ceiling: providerAttemptCeiling,
        max_child_attempts: 1,
        max_child_retries: 0,
        live_source_allowed: false,
        issued_at: issuedAt,
        expires_at: expiresAt,
        mutation_request_identity: mutationIdentity(identity),
        authority_tier: 'reference',
        archived: false,
    };
    metadata.policy_sha256 = hashAutonomousDispatchPolicy(metadata);
    writeMetadata(value, POLICY_PARENT, metadata);
    return { issuedAt, expiresAt };
}

function insertPolicyChild(
    value: Root,
    identity: Identity,
    index: number,
    template: ForgeChildRequestTemplateV1,
): { beadId: string; decisionId: string; template: ForgeChildRequestTemplateV1 } {
    const beadId = `bead:cstar:autonomous-policy:child-${index + 1}`;
    const decisionId = `${POLICY_DECISION}:child-${index + 1}`;
    const parentRaw = value.db.prepare(
        'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
    ).pluck().get(POLICY_PARENT) as string;
    const parent = JSON.parse(parentRaw) as Record<string, unknown>;
    insertBead(value, beadId, decisionId);
    const metadata: Record<string, unknown> = {
        source: 'cstar-kernel-mcp',
        schema: AUTONOMOUS_DISPATCH_CHILD_SCHEMA,
        version: 1,
        child_sha256: '',
        parent_bead_id: POLICY_PARENT,
        policy_sha256: parent.policy_sha256,
        decision_id: decisionId,
        lane: 'forge',
        scope: 'CStar autonomous Hermes policy test only.',
        target_paths: ['src', 'tests'],
        adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        write_capability: 'project_files',
        provider_profile: 'hermes:minimax',
        source_callback_thread_id: identity.thread_id,
        state_update_thread_id: null,
        dispatch_surface_ref: null,
        forge_child_request_template: template,
        forge_child_request_template_sha256: '',
        forge_child_request_template_bytes: 0,
        mutation_request_identity: mutationIdentity(identity),
        authority_tier: 'reference',
        archived: false,
    };
    const canonical = stableAuguryMissionJson(template);
    metadata.forge_child_request_template_sha256 = hashAuguryMissionValue(template);
    metadata.forge_child_request_template_bytes = Buffer.byteLength(canonical, 'utf8');
    metadata.child_sha256 = hashAutonomousDispatchChild(metadata);
    writeMetadata(value, beadId, metadata);
    return { beadId, decisionId, template };
}

export function beginAutonomousPolicyTest(): void {
    beginNaturalAuthorizationTest();
    process.env.NODE_TEST_CONTEXT = process.env.NODE_TEST_CONTEXT ?? 'child-v8';
    process.env.CSTAR_FORGE_TEST_MODE = '1';
}

export function cleanupAutonomousPolicyTest(): void {
    cleanupNaturalAuthorizationTest();
    restoreEnv('CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT', originalWorkerAdapter);
    restoreEnv('HERMES_BIN', originalHermes);
    restoreEnv('CSTAR_FORGE_TEST_MODE', originalTestMode);
    restoreEnv('NODE_TEST_CONTEXT', originalNodeTestContext);
}

export async function createAutonomousPolicyFixture(
    label: string,
    providerAttemptCeiling = 2,
    childCount = 1,
    initialSameTurnText?: string,
): Promise<AutonomousPolicyFixture> {
    const value = setupRoot(`autonomous-policy-${label}`);
    fs.mkdirSync(path.join(value.root, 'src'), { mode: 0o700 });
    fs.mkdirSync(path.join(value.root, 'tests/features'), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(value.root, 'tests/unit'), { recursive: true, mode: 0o700 });
    process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT = WORKER_ADAPTER;
    process.env.HERMES_BIN = writeSyntheticHermes(value.root);
    const session = createSession({
        timestamp: new Date(Date.now() - 5_000).toISOString(),
        textParts: ['Create the immutable autonomous Hermes dispatch policy.'],
    });
    if (initialSameTurnText) {
        appendUserMessage(
            session.sessionFile,
            session.turnId,
            initialSameTurnText,
            new Date(Date.parse(session.timestamp) + 1_000).toISOString(),
        );
    }
    const context = validRequestContext(session.threadId, session.turnId);
    const identity = await verifyCodexRequestIdentity(context);
    const prohibitedActions = [...FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS].sort();
    const { issuedAt, expiresAt } = insertPolicyParent(
        value, identity, prohibitedActions, providerAttemptCeiling,
    );
    const children = Array.from({ length: childCount }, (_, index) =>
        insertPolicyChild(value, identity, index, autonomousPolicyChildTemplate()));
    return {
        value, session, context, identity, issuedAt, expiresAt, prohibitedActions, children,
    };
}

export async function requestAutonomousPolicyChild(
    fixture: AutonomousPolicyFixture,
    index = 0,
    context: Context = fixture.context,
    mutate?: (args: Record<string, any>) => void,
): Promise<Record<string, any>> {
    const child = fixture.children[index]!;
    const template = child.template;
    const args: Record<string, any> = {
        bead_id: child.beadId,
        decision_id: child.decisionId,
        state_update_thread_id: null,
        source_callback_thread_id: fixture.session.threadId,
        objective: template.objective,
        prompt: template.prompt,
        target_paths: [path.join(fixture.value.root, 'src'), path.join(fixture.value.root, 'tests')],
        required_output_paths: template.required_output_paths.map((entry) =>
            path.join(fixture.value.root, entry)),
        system_under_test: template.system_under_test,
        scope: 'CStar autonomous Hermes policy test only.',
        authority_lane: template.authority_lane,
        required_metrics: template.required_metrics,
        artifact_expectations: template.artifact_expectations,
        prohibited_actions: fixture.prohibitedActions,
        requested_actions: template.requested_actions,
        spend_policy: { mode: 'live_authorized', max_retries: 0, live_source_allowed: false },
        live_source_policy: 'No live source collection.',
        fixture_policy: 'synthetic_only',
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: {
            expected_packet: template.callback_expected_packet,
            callback_required: true,
            callback_thread_id: fixture.session.threadId,
        },
        package_locks: [],
        dispatch_surface_ref: null,
        execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
    };
    mutate?.(args);
    return parse(await handleForgeRequest(args, context));
}

export function appendAutonomousPolicyTurn(
    fixture: AutonomousPolicyFixture,
    text: string,
    offsetMs = 10_000,
): Context {
    const turnId = randomUUID();
    appendUserMessage(
        fixture.session.sessionFile,
        turnId,
        text,
        new Date(fixture.issuedAt + offsetMs).toISOString(),
    );
    return validRequestContext(fixture.session.threadId, turnId);
}

export function appendAutonomousPolicySameTurnRecord(
    fixture: AutonomousPolicyFixture,
    text: string,
    offsetMs = 10_000,
): Context {
    appendUserMessage(
        fixture.session.sessionFile,
        fixture.session.turnId,
        text,
        new Date(fixture.issuedAt + offsetMs).toISOString(),
    );
    return validRequestContext(fixture.session.threadId, fixture.session.turnId);
}

export function rewriteAutonomousPolicyMetadata(
    fixture: AutonomousPolicyFixture,
    beadId: string,
    update: (metadata: Record<string, any>) => void,
): void {
    const raw = fixture.value.db.prepare(
        'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
    ).pluck().get(beadId) as string;
    const metadata = JSON.parse(raw) as Record<string, any>;
    update(metadata);
    writeMetadata(fixture.value, beadId, metadata);
}

export function markAutonomousPolicyBeadUpdated(
    fixture: AutonomousPolicyFixture,
    beadId: string,
): void {
    fixture.value.db.prepare(
        'UPDATE hall_beads SET updated_at = created_at + 1 WHERE bead_id = ?',
    ).run(beadId);
}

export { POLICY_PARENT };
