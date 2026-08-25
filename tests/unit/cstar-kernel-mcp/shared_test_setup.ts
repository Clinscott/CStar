import { afterEach, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { database } from '../../../src/tools/pennyone/intel/database.js';
import type { HallMountedSpokeRecord } from '../../../src/types/hall.js';
import {
    seedSterlingValidationRecord,
    validationStore,
    cleanupSterlingValidationArtifacts,
    lookupSterlingForgeRow,
} from './shared_sterling_test_setup.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
export { invokeForgeAdapterForTest } from './shared_forge_adapter_test_setup.js';
export { validationStore } from './shared_sterling_test_setup.js';
export const spokeStore = new Map<string, HallMountedSpokeRecord>();
mock.method(database, 'getHallMountedSpoke', (slugOrId: string) => spokeStore.get(slugOrId) ?? null);
mock.method(database, 'listHallMountedSpokes', () => [...spokeStore.values()]);
export const beadStore = new Map<string, any>();
export function seedValidationBead(beadId: string, targetPath = 'src/validation-target.ts'): void {
    beadStore.set(beadId, {
        id: beadId,
        repo_id: 'test-repo',
        scan_id: '',
        target_kind: 'FILE',
        target_ref: targetPath,
        target_path: targetPath,
        rationale: 'Validation test bead.',
        contract_refs: [],
        baseline_scores: {},
        status: 'IN_PROGRESS',
        created_at: Date.now(),
        updated_at: Date.now(),
    });
}

export function seedSterlingValidation(
    beadId: string,
    validationId = `validation:${beadId}`,
): {
    validationId: string;
    mandateEvidence: {
        lore_paths: string[];
        isolation_paths: string[];
        audit: { validation_id: string };
    };
} {
    const bead = beadStore.get(beadId);
    if (!bead) throw new Error(`synthetic_bead_missing:${beadId}`);
    return seedSterlingValidationRecord(bead, beadId, validationId, registry.getRoot());
}

mock.method(database, 'getHallRepository', () => ({ repo_id: 'test-repo' }));
mock.method(database, 'saveValidationRun', () => {});
mock.method(database, 'getValidationRunById', (validationId: string) => validationStore.get(validationId) ?? null);
mock.method(database, 'upsertHallBead', (record: any) => {
    const existing = beadStore.get(record.bead_id);
    beadStore.set(record.bead_id, {
        id: record.bead_id,
        repo_id: record.repo_id,
        scan_id: record.scan_id ?? existing?.scan_id ?? '',
        target_kind: record.target_kind ?? existing?.target_kind ?? 'OTHER',
        target_ref: record.target_ref ?? existing?.target_ref,
        target_path: record.target_path ?? existing?.target_path,
        rationale: record.rationale ?? existing?.rationale ?? '',
        contract_refs: record.contract_refs ?? existing?.contract_refs ?? [],
        baseline_scores: record.baseline_scores ?? existing?.baseline_scores ?? {},
        acceptance_criteria: record.acceptance_criteria ?? existing?.acceptance_criteria,
        checker_shell: record.checker_shell ?? existing?.checker_shell,
        status: record.status,
        assigned_agent: record.assigned_agent ?? existing?.assigned_agent,
        source_kind: record.source_kind ?? existing?.source_kind,
        triage_reason: record.triage_reason ?? existing?.triage_reason,
        resolution_note: record.resolution_note ?? existing?.resolution_note,
        resolved_validation_id: record.resolved_validation_id ?? existing?.resolved_validation_id,
        superseded_by: record.superseded_by ?? existing?.superseded_by,
        architect_opinion: record.architect_opinion ?? existing?.architect_opinion,
        critique_payload: record.critique_payload ?? existing?.critique_payload,
        metadata: record.metadata ?? existing?.metadata,
        created_at: record.created_at ?? existing?.created_at ?? Date.now(),
        updated_at: record.updated_at ?? Date.now(),
    });
});
mock.method(database, 'getHallBead', (beadId: string) => beadStore.get(beadId) ?? null);
mock.method(database, 'getHallBeads', (_root: string, statuses?: string[]) => {
    const beads = [...beadStore.values()];
    if (!statuses || statuses.length === 0) {
        return beads;
    }
    const statusSet = new Set(statuses);
    return beads.filter((bead) => statusSet.has(bead.status));
});
mock.method(database, 'searchIntents', () => [
    { type: 'CODE', path: 'src/main.ts', intent: 'Main entry point', rank: 1.0 },
    { type: 'DOC', path: 'docs/README.md', intent: 'Project documentation', rank: 2.0 },
    { type: 'ENGRAM', path: 'engram-123', intent: 'Past interaction memory', rank: 3.0 }
]);
function lookupMockBeadRow(key: string) {
    const bead = beadStore.get(key);
    return bead ? { repo_id: bead.repo_id, target_path: bead.target_path, root_path: registry.getRoot() } : null;
}
const mockDb = {
    prepare: (sql: string) => ({
        all: () => [],
        get: (key: string) => sql.includes('FROM hall_beads b')
            ? lookupMockBeadRow(key) : lookupSterlingForgeRow(sql, key),
        run: () => ({ changes: 0 })
    }),
    transaction: (operation: (...args: any[]) => any) => Object.assign(operation, { immediate: operation }),
    exec: () => undefined,
    pragma: () => undefined,
};
mock.method(database, 'getReadDb', () => mockDb as any);
mock.method(database, 'getWritableDb', () => mockDb as any);
import {
    handleHandoff,
    buildHandoffMcpPayload,
    handleHallSearch,
    handleAugury,
    handleDoctor,
    handleVerifyPlan,
    handleBead as rawHandleBead,
    handleRecordResult as rawHandleRecordResult,
    handleSpokeBeadImport as rawHandleSpokeBeadImport,
    resolveSpokeAnchor,
    deriveMcpUsefulnessEvent,
    summarizeUsefulnessEvents,
    handleStatus,
    handleEvolve,
    handleSpoke,
    handleIntentRoute,
    handleWarden as rawHandleWarden,
    handleTelemetry,
    handleResearcherRequest,
    handleForgeRequest as rawHandleForgeRequest,
    handleForgeExecute as rawHandleForgeExecute,
    handleMongoMailbox,
    handlePennyOneContext,
    detectAuguryTargetDivergence,
    decideAugurySessionRouting,
    callerRequestedActiveSessionContinuity,
    resolveAuguryCurrentIntentCategory,
} from '../../../src/tools/cstar-kernel-mcp.js';

let mutationRequestContext: ReturnType<typeof validRequestContext> | undefined;
const originalForgeRuntimeTestBypass = process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
const requireMutationRequestContext = () => mutationRequestContext
    ?? (() => { throw new Error('synthetic_mutation_request_context_missing'); })();
const handleBead: typeof rawHandleBead = (args, context = requireMutationRequestContext()) =>
    rawHandleBead(args, context);
const handleRecordResult: typeof rawHandleRecordResult = (
    args,
    context = requireMutationRequestContext(),
) => rawHandleRecordResult(args, context);
const handleSpokeBeadImport: typeof rawHandleSpokeBeadImport = (
    args,
    context = requireMutationRequestContext(),
) => rawHandleSpokeBeadImport(args, context);
const handleForgeRequest: typeof rawHandleForgeRequest = (args, context = requireMutationRequestContext()) =>
    rawHandleForgeRequest(args, context);
const handleForgeExecute: typeof rawHandleForgeExecute = (args, context = requireMutationRequestContext()) =>
    rawHandleForgeExecute(args, context);
const handleWarden: typeof rawHandleWarden = (
    args,
    context = args.action === 'scan' ? requireMutationRequestContext() : undefined,
) => rawHandleWarden(args, context);

const SYNTHETIC_MOUNT_TOKEN = 'synthetic-kernel-test-mount-token';
const DEFAULT_SYNTHETIC_SPOKE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-test-spoke-root-'));

export function bindSyntheticSpokeRoot(rootPath: string): void {
    const identityDir = path.join(rootPath, '.cstar');
    fs.mkdirSync(identityDir, { recursive: true });
    fs.writeFileSync(
        path.join(identityDir, 'IDENTITY.json'),
        JSON.stringify({ mount_token: SYNTHETIC_MOUNT_TOKEN }),
        { mode: 0o600 },
    );
}

bindSyntheticSpokeRoot(DEFAULT_SYNTHETIC_SPOKE_ROOT);

export function makeSpoke(overrides: Partial<HallMountedSpokeRecord> = {}): HallMountedSpokeRecord {
    const now = Date.now();
    return {
        spoke_id: 'spoke:test-spoke',
        repo_id: 'repo:test-spoke',
        slug: 'test-spoke',
        kind: 'local',
        root_path: DEFAULT_SYNTHETIC_SPOKE_ROOT,
        mount_status: 'active',
        trust_level: 'trusted',
        write_policy: 'read_write',
        projection_status: 'projected',
        metadata: { authority: { mount_token: SYNTHETIC_MOUNT_TOKEN } },
        created_at: now,
        updated_at: now,
        ...overrides,
    } as HallMountedSpokeRecord;
}

export { assert, fs, os, path, mock, database };
export {
    handleHandoff,
    buildHandoffMcpPayload,
    handleHallSearch,
    handleAugury,
    handleDoctor,
    handleVerifyPlan,
    handleBead,
    handleRecordResult,
    handleSpokeBeadImport,
    resolveSpokeAnchor,
    deriveMcpUsefulnessEvent,
    summarizeUsefulnessEvents,
    handleStatus,
    handleEvolve,
    handleSpoke,
    handleIntentRoute,
    handleWarden,
    handleTelemetry,
    handleResearcherRequest,
    handleForgeRequest,
    handleForgeExecute,
    handleMongoMailbox,
    handlePennyOneContext,
    detectAuguryTargetDivergence,
    decideAugurySessionRouting,
    callerRequestedActiveSessionContinuity,
    resolveAuguryCurrentIntentCategory,
};

beforeEach(() => {
    if (process.platform === 'linux') {
        process.env.TMPDIR = '/tmp';
        process.env.TMP = '/tmp';
        process.env.TEMP = '/tmp';
    }
    beadStore.clear();
    validationStore.clear();
    spokeStore.clear();
    delete process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
    delete process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT;
    delete process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT;
    delete process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE;
    delete process.env.CSTAR_FORGE_HERMES_DELEGATE_SCRIPT;
    process.env.CSTAR_FORGE_TEST_MODE = '1';
    process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
    const session = createSession({
        textParts: ['Synthetic root-user request for bounded CStar mutation tests.'],
    });
    mutationRequestContext = validRequestContext(session.threadId, session.turnId);
});

afterEach(() => {
    mutationRequestContext = undefined;
    if (originalForgeRuntimeTestBypass === undefined) delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
    else process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = originalForgeRuntimeTestBypass;
    cleanupOperatorAuthorizationFixtures();
    cleanupSterlingValidationArtifacts();
});

export function validDispatchRequest(overrides: Record<string, any> = {}) {
    return {
        bead_id: 'bead-test-dispatch',
        state_update_thread_id: '019e92ea-f551-7d50-928e-f67f6253ee36',
        source_callback_thread_id: '019e9063-56e8-7831-a7ee-9241badce6c5',
        objective: 'Produce a bounded no-spend dispatch receipt',
        prompt: 'Review the target and report findings',
        target_paths: ['src/tools/cstar-kernel-mcp.ts'],
        system_under_test: 'cstar-kernel MCP',
        scope: 'CStar control plane',
        authority_lane: 'yellow',
        required_metrics: [
            { name: 'artifact_integrity', threshold: 'zero missing required fields' },
        ],
        artifact_expectations: ['compact callback packet', 'validation receipt'],
        prohibited_actions: ['git_merge', 'git_push', 'expanded_spend', 'direct_state_write'],
        requested_actions: ['request_receipt'],
        spend_policy: { mode: 'no_spend', max_retries: 0, live_source_allowed: false },
        live_source_policy: 'no live source collection',
        fixture_policy: 'synthetic_only',
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: {
            expected_packet: 'TEST_DISPATCH_PACKET',
            callback_required: true,
        },
        package_locks: [
            { path: 'work/packages/test.tar.gz', sha256: 'abc123' },
        ],
        ...overrides,
    };
}

export function validForgeExecuteRequest(overrides: Record<string, any> = {}) {
    return validDispatchRequest({
        decision_id: 'decision-forge-execute-test',
        spend_policy: {
            mode: 'live_authorized',
            max_retries: 0,
            live_source_allowed: false,
        },
        requested_actions: ['response_only'],
        forge_request_receipt_id: 'dispatch-forge-decision-forge-execute-test-receipt',
        forge_request_decision_id: 'decision-forge-execute-test',
        forge_request_bead_id: 'bead-test-dispatch',
        execution_mode: 'live_authorized',
        operator_authorization_ref: 'operator-run-it-test',
        execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        idempotency_key: 'forge-execute-test-stable-key',
        package_locks: [],
        callback_contract: {
            expected_packet: 'TEST_FORGE_WORKER_PACKET',
            callback_required: true,
        },
        ...overrides,
    });
}

export function writeFakeForgeAdapter(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-adapter-'));
    const scriptPath = path.join(tmpDir, 'adapter.py');
    fs.writeFileSync(scriptPath, [
        '#!/usr/bin/env python3',
        'import argparse, json, os',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("--intent-file", required=True)',
        'args = parser.parse_args()',
        'with open(args.intent_file) as f:',
        '    intent = json.load(f)',
        'write_to = intent["payload"].get("write_to")',
        'response = {"status": "pass", "summary": "fake forge adapter output", "files_changed": [], "artifacts": {"response_transport": "parent_published"}, "validation": {"mock": "pass"}, "metrics": {"mock": 1}, "boundaries": {"codex_worker_fallback_allowed": False}, "callback_packet": intent["expected_callback_packet"]}',
        'if write_to:',
        '    os.makedirs(os.path.dirname(write_to), exist_ok=True)',
        '    with open(write_to, "w") as out:',
        '        out.write(json.dumps(response))',
        'print(json.dumps({',
        '    "status": "ok",',
        '    "intent_id": "fake-forge-intent",',
        '    "duration_ms": 7,',
        '    "response_chars": 123,',
        '    "est_prompt_tokens": 45,',
        '    "est_response_tokens": 12,',
        '    "model": intent["payload"]["model"],',
        '    "hermes_profile": intent["payload"]["hermes_profile"],',
        '    "wrote_to": write_to,',
        '    "ledger_entry": "fake-ledger#L1",',
        '    "live_spend": False,',
        '    "live_source_collection": False',
        '}))',
        '',
    ].join('\n'));
    fs.chmodSync(scriptPath, 0o700);
    return scriptPath;
}

export function writeMissingClaimForgeAdapter(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-missing-claim-adapter-'));
    const scriptPath = path.join(tmpDir, 'adapter.py');
    fs.writeFileSync(scriptPath, [
        '#!/usr/bin/env python3',
        'import argparse, json, os',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("--intent-file", required=True)',
        'args = parser.parse_args()',
        'with open(args.intent_file) as f:',
        '    intent = json.load(f)',
        'response = {"status": "success", "summary": "fake success with missing evidence", "files_changed": ["missing-generated-file.txt"], "artifacts": {"tarball": "/tmp/cstar-definitely-missing-forge-artifact.tar.gz"}, "validation": {"mock": "pass"}, "metrics": {"fixture_coverage": 13}, "boundaries": {"codex_worker_fallback_allowed": False}}',
        'response["callback_packet"] = intent["expected_callback_packet"]',
        'write_to = intent["payload"].get("write_to")',
        'if write_to:',
        '    os.makedirs(os.path.dirname(write_to), exist_ok=True)',
        '    with open(write_to, "w") as out:',
        '        out.write(json.dumps(response))',
        'print(json.dumps({',
        '    "status": "ok",',
        '    "intent_id": "fake-missing-claim-intent",',
        '    "duration_ms": 7,',
        '    "response_chars": 123,',
        '    "est_prompt_tokens": 45,',
        '    "est_response_tokens": 12,',
        '    "model": intent["payload"]["model"],',
        '    "hermes_profile": intent["payload"]["hermes_profile"],',
        '    "wrote_to": write_to,',
        '    "ledger_entry": "fake-ledger#L1",',
        '    "live_spend": False,',
        '    "live_source_collection": False',
        '}))',
        '',
    ].join('\n'));
    fs.chmodSync(scriptPath, 0o700);
    return scriptPath;
}

export function writeAdvisoryOnlyForgeAdapter(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-advisory-adapter-'));
    const scriptPath = path.join(tmpDir, 'adapter.py');
    fs.writeFileSync(scriptPath, [
        '#!/usr/bin/env python3',
        'import argparse, json, os',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("--intent-file", required=True)',
        'args = parser.parse_args()',
        'with open(args.intent_file) as f:',
        '    intent = json.load(f)',
        'response = {"name": "CORVUSEYE_TRUTH_VERIFICATION_RED_TEAM_SUITE_LIVE_FORGE_BUILD_RESULT", "verdict": "PASS-READY-FOR-PMT-REVIEW", "next_gate": "PMT review"}',
        'write_to = intent["payload"].get("write_to")',
        'if write_to:',
        '    os.makedirs(os.path.dirname(write_to), exist_ok=True)',
        '    with open(write_to, "w") as out:',
        '        out.write(json.dumps(response))',
        'print(json.dumps({',
        '    "status": "ok",',
        '    "intent_id": "fake-advisory-intent",',
        '    "duration_ms": 7,',
        '    "response_chars": 123,',
        '    "est_prompt_tokens": 45,',
        '    "est_response_tokens": 12,',
        '    "model": intent["payload"]["model"],',
        '    "hermes_profile": intent["payload"]["hermes_profile"],',
        '    "wrote_to": write_to,',
        '    "ledger_entry": "fake-ledger#L1",',
        '    "live_spend": False,',
        '    "live_source_collection": False',
        '}))',
        '',
    ].join('\n'));
    fs.chmodSync(scriptPath, 0o700);
    return scriptPath;
}

export function writeInspectingForgeWorkerDelegate(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-worker-delegate-'));
    const scriptPath = path.join(tmpDir, 'delegate.mjs');
    fs.writeFileSync(scriptPath, [
        '#!/usr/bin/env node',
        'import { createHash } from "node:crypto";',
        'import fs from "node:fs";',
        'import path from "node:path";',
        'const argIndex = process.argv.indexOf("--intent-file");',
        'const intent = JSON.parse(fs.readFileSync(process.argv[argIndex + 1], "utf-8"));',
        'const intentText = intent.intent;',
        'const required = [',
        '    "Return the worker input manifest, not the final Forge execution packet.",',
        '    "Return JSON only with fields: status, summary, files, artifacts, validation, metrics, boundaries, callback_packet.",',
        '    "files must be an array",',
        '    "Do not return files_changed.",',
        '    "Do not write files directly.",',
        '];',
        'const missing = required.filter((item) => !intentText.includes(item));',
        'const forbidden = ["Return JSON only with: status, summary, files_changed", "The top-level object MUST be the Forge execution packet", "Every required output path must be present exactly once:"];',
        'const contract = intentText.match(/required_output_paths_json count=(\\d+) sha256=([a-f0-9]{64}) value=(\\[[^\\n]*\\])/);',
        'const encoded = contract?.[3] ?? "[]";',
        'const paths = JSON.parse(encoded);',
        'const digest = createHash("sha256").update(encoded, "utf-8").digest("hex");',
        'const contractInvalid = !contract || contract[1] !== "1" || contract[2] !== digest',
        '  || JSON.stringify(paths) !== JSON.stringify(["generated-by-delegate.json"])',
        '  || (intentText.match(/generated-by-delegate\\.json/g) ?? []).length !== 1',
        '  || intentText.includes(intent.project_root);',
        'if (missing.length || contractInvalid || forbidden.some((item) => intentText.includes(item))) {',
        '  process.stdout.write(JSON.stringify({ status: "error", missing, contract_invalid: contractInvalid }));',
        '  process.exit(3);',
        '}',
        'const writeTo = intent.payload.write_to;',
        'const response = {',
        '  status: "success",',
        '  summary: "Delegate returned a worker file manifest.",',
        '  files: [{ path: "generated-by-delegate.json", content: "{\\"ok\\":true}\\n" }],',
        '  artifacts: {},',
        '  validation: { manifest_contract: "pass" },',
        '  metrics: { files: 1 },',
        '  boundaries: { codex_worker_fallback_allowed: false },',
        '  callback_packet: "TEST_FORGE_WORKER_PACKET",',
        '};',
        'fs.mkdirSync(path.dirname(writeTo), { recursive: true });',
        'fs.writeFileSync(writeTo, JSON.stringify(response));',
        'process.stdout.write(JSON.stringify({',
        '  status: "ok", intent_id: "fake-forge-worker-intent", duration_ms: 7,',
        '  response_chars: 123, est_prompt_tokens: 45, est_response_tokens: 12,',
        '  model: intent.payload.model, hermes_profile: intent.payload.hermes_profile,',
        '  wrote_to: writeTo, ledger_entry: "fake-ledger#L1",',
        '  forge_topology: "synthetic_legacy_single_response_v1", role_plan_sha256: "a".repeat(64),',
        '  role_receipts: [{role:"specifier",phase:"1/6",input_handoff_sha256:"0".repeat(64),specification_handoff_sha256:"0".repeat(64),output_handoff_sha256:"1".repeat(64),input_tokens:0,output_tokens:0}],',
        '  provider_request_receipts: [{role:"specifier",phase:"1/6",final_state:"synthetic_response_complete",binding_sha256:"b".repeat(64),journal_sha256:"c".repeat(64),journal_valid:true,synthetic:true}],',
        '  provider_requests_started: 1, provider_requests_completed: 1, provider_requests_ambiguous: 0,',
        '  input_tokens: 0, output_tokens: 0, live_spend: true, live_spend_unknown: false,',
        '  known_spend_observed: true, live_source_collection: false,',
        '}));',
        '',
    ].join('\n'));
    fs.chmodSync(scriptPath, 0o700);
    return scriptPath;
}
