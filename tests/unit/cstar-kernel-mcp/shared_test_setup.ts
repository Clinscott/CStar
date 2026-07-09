import { mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { database } from '../../../src/tools/pennyone/intel/database.js';
import type { HallMountedSpokeRecord } from '../../../src/types/hall.js';

export const spokeStore = new Map<string, HallMountedSpokeRecord>();
mock.method(database, 'getHallMountedSpoke', (slugOrId: string) => spokeStore.get(slugOrId) ?? null);
mock.method(database, 'listHallMountedSpokes', () => [...spokeStore.values()]);

export const beadStore = new Map<string, any>();

// Mock database methods before importing tools that use them
mock.method(database, 'getHallRepository', () => ({ repo_id: 'test-repo' }));
mock.method(database, 'saveValidationRun', () => {});
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
mock.method(database, 'getDb', () => ({
    prepare: () => ({
        all: () => [],
        get: () => null,
        run: () => ({ changes: 0 })
    })
}));

import {
    handleHandoff,
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
} from '../../../src/tools/cstar-kernel-mcp.js';

export function makeSpoke(overrides: Partial<HallMountedSpokeRecord> = {}): HallMountedSpokeRecord {
    const now = Date.now();
    return {
        spoke_id: 'spoke:test-spoke',
        repo_id: 'repo:test-spoke',
        slug: 'test-spoke',
        kind: 'local',
        root_path: '/tmp/test-spoke-root',
        mount_status: 'active',
        trust_level: 'trusted',
        write_policy: 'read_write',
        projection_status: 'projected',
        created_at: now,
        updated_at: now,
        ...overrides,
    } as HallMountedSpokeRecord;
}

export { assert, fs, os, path, mock, database };
export {
    handleHandoff,
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
    beadStore.clear();
    spokeStore.clear();
    delete process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
    delete process.env.CSTAR_FORGE_HERMES_MINIMAX_WORKER_ADAPTER_SCRIPT;
    delete process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT;
    delete process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE;
    delete process.env.CSTAR_FORGE_WORKER_DELEGATE_SCRIPT;
});

export function validDispatchRequest(overrides: Record<string, any> = {}) {
    return {
        bead_id: 'bead-test-dispatch',
        owner_pmt_thread_id: '019e92ea-f551-7d50-928e-f67f6253ee36',
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
        prohibited_actions: ['merge', 'push to main/master', 'live model spend', 'direct Hall/SQLite write'],
        requested_actions: ['dry-run request receipt'],
        spend_policy: { mode: 'no_spend', max_retries: 0, live_source_allowed: false },
        live_source_policy: 'no live source collection',
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
            max_retries: 1,
            live_source_allowed: false,
            operator_authorization_ref: 'operator-run-it-test',
        },
        requested_actions: ['execute through approved Forge adapter'],
        forge_request_receipt_id: 'dispatch-forge-decision-forge-execute-test-receipt',
        forge_request_decision_id: 'decision-forge-execute-test',
        forge_request_bead_id: 'bead-test-dispatch',
        execution_mode: 'live_authorized',
        operator_authorization_ref: 'operator-run-it-test',
        execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
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
        'response = {"status": "pass", "summary": "fake forge adapter output", "files_changed": [], "artifacts": {"response": write_to}, "validation": {"mock": "pass"}, "metrics": {"mock": 1}, "boundaries": {"codex_worker_fallback_allowed": False}}',
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
    return scriptPath;
}

export function writeInspectingForgeWorkerDelegate(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-worker-delegate-'));
    const scriptPath = path.join(tmpDir, 'delegate.py');
    fs.writeFileSync(scriptPath, [
        '#!/usr/bin/env python3',
        'import argparse, json, os, sys',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("--intent-file", required=True)',
        'args = parser.parse_args()',
        'with open(args.intent_file) as f:',
        '    intent = json.load(f)',
        'intent_text = intent["intent"]',
        'required = [',
        '    "Return the worker input manifest, not the final Forge execution packet.",',
        '    "Return JSON only with fields: status, summary, files, artifacts, validation, metrics, boundaries, callback_packet.",',
        '    "files must be an array",',
        '    "Do not return files_changed.",',
        '    "Do not write files directly.",',
        ']',
        'missing = [item for item in required if item not in intent_text]',
        'forbidden = ["Return JSON only with: status, summary, files_changed", "The top-level object MUST be the Forge execution packet"]',
        'if missing or any(item in intent_text for item in forbidden):',
        '    print(json.dumps({"status": "error", "missing": missing, "intent": intent_text[-1000:]}))',
        '    sys.exit(3)',
        'write_to = intent["payload"]["write_to"]',
        'response = {',
        '    "status": "success",',
        '    "summary": "Delegate returned a worker file manifest.",',
        '    "files": [{"path": "generated-by-delegate.json", "content": "{\\"ok\\":true}\\n"}],',
        '    "artifacts": {},',
        '    "validation": {"manifest_contract": "pass"},',
        '    "metrics": {"files": 1},',
        '    "boundaries": {"codex_worker_fallback_allowed": False},',
        '    "callback_packet": "TEST_FORGE_WORKER_PACKET"',
        '}',
        'os.makedirs(os.path.dirname(write_to), exist_ok=True)',
        'with open(write_to, "w") as out:',
        '    out.write(json.dumps(response))',
        'print(json.dumps({',
        '    "status": "ok",',
        '    "intent_id": "fake-forge-worker-intent",',
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
    return scriptPath;
}
