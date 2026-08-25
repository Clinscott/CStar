import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    buildForgeRuntimeProof,
    HOST_RUNTIME_GENERATOR_RELATIVE,
    HOST_RUNTIME_MANIFEST_RELATIVE,
    HOST_RUNTIME_SCHEMA_RELATIVE,
    LEGACY_RUNTIME_MANIFEST_RELATIVE,
} from '../../../src/tools/cstar-kernel-mcp/contracts/runtime_lineage_forge.js';
import {
    codexHostWorkerJobContractSchema,
    codexHostWorkerReceiptSchema,
} from '../../../src/tools/cstar-kernel-mcp/contracts/worker_jobs.js';

const roots: string[] = [];
const generator = [
    'export const codexHostRuntimeLineage = true;',
    'export const receiptSchema = "cstar.forge_host_runtime_receipt.v2";',
    'process.exitCode = 0;',
].join('\n');

function writeJson(candidate: string, value: unknown): void {
    fs.mkdirSync(path.dirname(candidate), { recursive: true });
    fs.writeFileSync(candidate, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(candidate: string, content: string): void {
    fs.mkdirSync(path.dirname(candidate), { recursive: true });
    fs.writeFileSync(candidate, content);
}

function root(): string {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-codex-host-lineage-'));
    roots.push(value);
    return value;
}

function hostManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        schema: 'cstar.forge_host_runtime_manifest.v2',
        runtime_owner: 'cstar-state-only',
        runner_owner: 'codex-host',
        workflow_surfaces: ['forge', 'researcher'],
        requested_model: 'gpt-5.6-luna',
        requested_reasoning: 'max',
        selector_status: 'enforced',
        actual_identity: null,
        transport: 'codex-host',
        host_launch_required: true,
        provider_attempted: false,
        network_policy: 'codex_host_no_cstar_network',
        cognition_launch: false,
        cstar_launch: false,
        manifest_schema_path: 'host-manifest.schema.json',
        generator_path: 'scripts/codex_host_runtime_lineage.mjs',
        proof_files: [
            'runtime/host-manifest.json',
            'runtime/host-manifest.schema.json',
            'scripts/codex_host_runtime_lineage.mjs',
        ],
        receipt_schema: 'cstar.forge_host_runtime_receipt.v2',
        hash_algorithm: 'sha256',
        ...overrides,
    };
}

function writeHostRoot(value: string, manifest = hostManifest()): void {
    writeJson(path.join(value, HOST_RUNTIME_MANIFEST_RELATIVE), manifest);
    writeJson(path.join(value, HOST_RUNTIME_SCHEMA_RELATIVE), {
        $id: 'cstar.forge_host_runtime_manifest.v2',
        additionalProperties: false,
    });
    writeFile(path.join(value, HOST_RUNTIME_GENERATOR_RELATIVE), generator);
}

function legacyManifest(): Record<string, unknown> {
    return {
        schema: 'cstar.forge_private_runtime_manifest.v2',
        runtime_owner: 'cstar',
        credential_profile_owner: 'hermes',
        credential_profile: 'cstar-hub',
        provider: 'minimax-oauth',
        model: 'MiniMax-M3',
        launcher: 'bin/hermes',
        source_files: ['hermes_cli/forge_entrypoint.py'],
        bootstrap_mode: 'cstar_owned_python_system_stdlib_snapshot_v2',
        dependency_mode: 'stdlib_only_no_site_packages_v2',
        network_entrypoint: 'hermes_cli.forge_entrypoint',
        allow_arbitrary_source_root: false,
        oauth_read_only: true,
        oauth_refresh_allowed: false,
        oauth_store_write_allowed: false,
    };
}

function validWorkerJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        schema: 'cstar.codex_host_worker_job.v2',
        worker_kind: 'forge',
        workflow_surface: 'forge',
        bead_id: 'bead:cstar:runtime-lineage',
        decision_id: 'decision:cstar-runtime-lineage',
        canonical_request_id: 'request:runtime-lineage',
        canonical_request_sha256: 'a'.repeat(64),
        authorization_id: 'authorization:runtime-lineage',
        authorization_expires_at: 2_000,
        runner_owner: 'codex-host',
        requested_model: 'gpt-5.6-luna',
        requested_reasoning: 'max',
        selector_status: 'enforced',
        actual_identity: null,
        transport: 'codex-host',
        cognition_launch: false,
        cstar_launch: false,
        provider_requests_started: 0,
        network_accessed: false,
        idempotency_key: 'runtime-lineage-1',
        execution_deadline_at: 1_900,
        attempt_id: 'attempt:runtime-lineage',
        objective: 'Record a bounded host-owned runtime contract.',
        expected_artifacts: [{ name: 'receipt', artifact_kind: 'test_result', required: true }],
        dispatch_receipt_sha256: 'b'.repeat(64),
        ...overrides,
    };
}

function validReceipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        schema: 'cstar.codex_host_worker_receipt.v2',
        job_id: 'job:runtime-lineage',
        attempt_id: 'attempt:runtime-lineage',
        worker_kind: 'forge',
        runner_owner: 'codex-host',
        requested_model: 'gpt-5.6-luna',
        requested_reasoning: 'max',
        selector_status: 'enforced',
        actual_identity: null,
        transport: 'codex-host',
        provider_requests_started: 0,
        network_accessed: false,
        cognition_launch: false,
        evidence_sha256: 'c'.repeat(64),
        ...overrides,
    };
}

afterEach(() => {
    for (const value of roots.splice(0)) fs.rmSync(value, { recursive: true, force: true });
});

describe('Codex-host runtime lineage contract', () => {
    it('records host ownership, Luna Max request identity, separate actual identity, and no launcher', () => {
        const value = root();
        writeHostRoot(value);
        const proof = buildForgeRuntimeProof(value);
        assert.equal(proof.contract, 'verified_manifest_content');
        assert.equal(proof.actionable, false);
        assert.ok(proof.mismatch_reasons.includes('forge_tombstoned_permanent'));
        assert.equal(proof.manifest_version, 'host_v2');
        assert.equal(proof.runner_owner, 'codex-host');
        assert.equal(proof.requested_model, 'gpt-5.6-luna');
        assert.equal(proof.requested_reasoning, 'max');
        assert.equal(proof.selector_status, 'enforced');
        assert.equal(proof.actual_identity, null);
        assert.equal(proof.transport, 'codex-host');
        assert.equal(proof.launcher_sha256, null);
        assert.equal(proof.executable_launcher_present, false);
        assert.equal(proof.source_files.length, 0);
        assert.equal(proof.receipt?.provider_requests_started, 0);
        assert.equal(proof.receipt?.network_accessed, false);
        assert.ok(proof.receipt_sha256);
    });

    it('rejects missing or false selector evidence without inferring readiness', () => {
        for (const selector_status of [undefined, 'unreported', false]) {
            const value = root();
            const manifest = hostManifest();
            if (selector_status === undefined) delete manifest.selector_status;
            else manifest.selector_status = selector_status;
            writeHostRoot(value, manifest);
            const proof = buildForgeRuntimeProof(value);
            assert.equal(proof.contract, 'partial');
            assert.equal(proof.actionable, false);
            assert.ok(proof.mismatch_reasons.includes(
                'forge_runtime_host_manifest_contract_invalid',
            ));
        }
    });

    it('requires explicit state-only launch provenance without inferring zero launch', () => {
        for (const field of ['host_launch_required', 'provider_attempted', 'cstar_launch']) {
            const value = root();
            const manifest = hostManifest();
            delete manifest[field];
            writeHostRoot(value, manifest);
            const proof = buildForgeRuntimeProof(value);
            assert.equal(proof.contract, 'partial');
            assert.equal(proof.actionable, false);
            assert.ok(proof.mismatch_reasons.includes(
                'forge_runtime_host_manifest_contract_invalid',
            ));
        }
    });

    it('rejects provider, credential, and MiniMax fields from the current manifest', () => {
        const value = root();
        writeHostRoot(value, { ...hostManifest(), provider: 'minimax-oauth' });
        const proof = buildForgeRuntimeProof(value);
        assert.equal(proof.contract, 'partial');
        assert.equal(proof.manifest_version, 'host_v2');
        assert.equal(proof.actionable, false);
    });

    it('decodes legacy Hermes/MiniMax bytes as readable but non-actionable history', () => {
        const value = root();
        writeJson(path.join(value, LEGACY_RUNTIME_MANIFEST_RELATIVE), legacyManifest());
        writeFile(path.join(value, '.agents/skills/corvus-forge/runtime/bin/hermes'),
            '#!/bin/sh\n# CSTAR_FORGE_RUNTIME_LAUNCHER_V2\n');
        writeFile(path.join(value, '.agents/skills/corvus-forge/runtime/hermes_cli/forge_entrypoint.py'),
            'legacy\n');
        const proof = buildForgeRuntimeProof(value);
        assert.equal(proof.contract, 'verified_manifest_content');
        assert.equal(proof.manifest_version, 'legacy_v1');
        assert.equal(proof.actionable, false);
        assert.equal(proof.runner_owner, 'legacy-hermes');
        assert.equal(proof.requested_model, 'MiniMax-M3');
        assert.equal(proof.transport, 'legacy-hermes');
        assert.equal(proof.executable_launcher_present, true);
    });

    it('emits a deterministic zero-provider host receipt from the generator', () => {
        const first = execFileSync(process.execPath, [
            path.join(process.cwd(), HOST_RUNTIME_GENERATOR_RELATIVE),
        ], { encoding: 'utf8' });
        const second = execFileSync(process.execPath, [
            path.join(process.cwd(), HOST_RUNTIME_GENERATOR_RELATIVE),
        ], { encoding: 'utf8' });
        assert.equal(first, second);
        const receipt = JSON.parse(first) as Record<string, unknown>;
        assert.equal(receipt.schema, 'cstar.forge_host_runtime_receipt.v2');
        assert.equal(receipt.runner_owner, 'codex-host');
        assert.equal(receipt.requested_model, 'gpt-5.6-luna');
        assert.equal(receipt.requested_reasoning, 'max');
        assert.equal(receipt.selector_status, 'enforced');
        assert.equal(receipt.transport, 'codex-host');
        assert.equal(receipt.host_launch_required, true);
        assert.equal(receipt.provider_attempted, false);
        assert.equal(receipt.provider_requests_started, 0);
        assert.equal(receipt.network_accessed, false);
        assert.equal(receipt.cognition_launch, false);
        assert.equal(receipt.cstar_launch, false);
        assert.match(String(receipt.receipt_sha256), /^[a-f0-9]{64}$/);
    });

    it('accepts the state-only worker envelope and keeps actual identity separate', () => {
        assert.equal(codexHostWorkerJobContractSchema.safeParse(validWorkerJob()).success, true);
        assert.equal(codexHostWorkerJobContractSchema.safeParse(validWorkerJob({
            actual_identity: 'gpt-5.6-luna',
        })).success, true);
        assert.equal(codexHostWorkerReceiptSchema.safeParse(validReceipt()).success, true);
    });

    it('rejects kernel provider ownership, missing selector proof, and invalid transport use', () => {
        assert.equal(codexHostWorkerJobContractSchema.safeParse(validWorkerJob({
            runner_owner: 'hermes',
        })).success, false);
        assert.equal(codexHostWorkerJobContractSchema.safeParse(validWorkerJob({
            selector_status: 'unreported',
        })).success, false);
        assert.equal(codexHostWorkerJobContractSchema.safeParse(validWorkerJob({
            provider: 'minimax-oauth',
        })).success, false);
        assert.equal(codexHostWorkerJobContractSchema.safeParse(validWorkerJob({
            transport: 'hermes:x-grok',
        })).success, false);
        assert.equal(codexHostWorkerJobContractSchema.safeParse(validWorkerJob({
            worker_kind: 'researcher',
            workflow_surface: 'researcher',
            transport: 'hermes:x-grok',
        })).success, false);
        assert.equal(codexHostWorkerReceiptSchema.safeParse(validReceipt({
            worker_kind: 'forge',
            transport: 'hermes:x-grok',
        })).success, false);
    });
});
