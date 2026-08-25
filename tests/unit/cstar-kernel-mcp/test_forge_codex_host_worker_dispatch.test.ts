import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    codexHostWorkerJobContractSchema,
} from '../../../src/tools/cstar-kernel-mcp/contracts/worker_jobs.js';
import {
    parseForgeCodexHostWorkerHandoff,
    persistForgeCodexHostWorkerHandoff,
} from '../../../src/tools/pennyone/intel/forge_host_worker_dispatch.js';
import { captureForgeHostPathIdentities } from '../../../src/tools/pennyone/intel/forge_host_path_identity.js';
import type { CodexHostWorkerJobContract } from '../../../src/types/worker_job.js';

const roots: string[] = [];
function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stable(item)]));
    }
    return value;
}
function digest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function makeJob(overrides: Record<string, unknown> = {}): CodexHostWorkerJobContract {
    const targetPaths = (overrides.target_paths as string[] | undefined)
        ?? ['/tmp/cstar-host-project/src/worker.ts'];
    const outputPaths = (overrides.output_paths as string[] | undefined) ?? [];
    const base = {
        schema: 'cstar.codex_host_worker_job.v2', worker_kind: 'forge', workflow_surface: 'forge',
        bead_id: 'bead:test:host-dispatch', decision_id: 'decision:test:host-dispatch',
        canonical_request_id: 'dispatch-forge-host-dispatch', canonical_request_sha256: 'a'.repeat(64),
        authorization_id: 'authorization:test:host-dispatch', authorization_expires_at: 2_000,
        runner_owner: 'codex-host', requested_model: 'gpt-5.6-luna', requested_reasoning: 'max',
        selector_status: 'enforced', actual_identity: null, transport: 'codex-host',
        cognition_launch: false, cstar_launch: false, provider_requests_started: 0,
        spend_uncertain: false, known_spend_observed: false, network_accessed: false,
        idempotency_key: 'host-dispatch-1', execution_deadline_at: 1_900,
        attempt_id: 'attempt:test:host-dispatch', objective: 'Persist one host-owned handoff.',
        expected_artifacts: [{ name: 'handoff', artifact_kind: 'other', required: true }],
        job_id: 'job:test:host-dispatch', host_launch_required: true,
        project_root: '/tmp/cstar-host-project', target_paths: targetPaths, output_paths: outputPaths,
        target_paths_sha256: digest(targetPaths),
        path_identity_bindings: captureForgeHostPathIdentities(targetPaths, outputPaths),
        validation_ticket_binding: {
            schema: 'cstar.validation_ticket_binding.v1', repository_id: 'repo:test:host-dispatch',
            bead_id: 'bead:test:host-dispatch', execution_receipt_id: 'forge-execute-host-dispatch',
            attempt_id: 'attempt:test:host-dispatch', scope_sha256: digest(targetPaths), one_use: true,
        },
        validation_ticket_request: {
            schema: 'cstar.validation_ticket_request.v1', repository_id: 'repo:test:host-dispatch',
            bead_id: 'bead:test:host-dispatch', execution_receipt_id: 'forge-execute-host-dispatch',
            attempt_id: 'attempt:test:host-dispatch', scope_sha256: digest(targetPaths), one_use: true,
            expires_at: 1_900,
        },
        ...overrides,
    };
    return {
        ...base,
        dispatch_receipt_sha256: digest(base),
    } as CodexHostWorkerJobContract;
}
function makeHandoff(job: CodexHostWorkerJobContract, handoffPath = '/tmp/cstar-host-handoff.json') {
    const unsigned = { schema: 'cstar.forge_codex_host_worker_handoff.v1', job };
    return {
        ...unsigned, status: 'queued', handoff_sha256: digest(unsigned), handoff_path: handoffPath,
        host_launch_required: true, cstar_launch: false, provider_attempted: false,
    };
}

afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Forge Codex-host worker handoff contract', () => {
    it('keeps requested identity separate from host-reported actual identity', () => {
        const requested = makeJob();
        const actual = makeJob({ actual_identity: 'gpt-5.6-luna' });
        assert.equal(codexHostWorkerJobContractSchema.safeParse(requested).success, true);
        assert.equal(codexHostWorkerJobContractSchema.safeParse(actual).success, true);
        assert.equal(requested.requested_model, 'gpt-5.6-luna');
        assert.equal(requested.requested_reasoning, 'max');
        assert.equal(requested.actual_identity, null);
        assert.equal(actual.actual_identity, 'gpt-5.6-luna');
        assert.equal(requested.provider_requests_started, 0);
        assert.equal(requested.spend_uncertain, false);
        assert.equal(requested.known_spend_observed, false);
    });

    it('rejects legacy Hermes/MiniMax fallback fields and transport', () => {
        assert.equal(codexHostWorkerJobContractSchema.safeParse({
            ...makeJob(), provider: 'minimax-oauth',
        }).success, false);
        assert.equal(codexHostWorkerJobContractSchema.safeParse(
            makeJob({ transport: 'hermes:x-grok' }),
        ).success, false);
        assert.equal(codexHostWorkerJobContractSchema.safeParse(
            makeJob({ requested_model: 'MiniMax-M3' }),
        ).success, false);
    });

    it('rejects root escape, duplicate canonical paths, spend claims, and ticket drift', () => {
        assert.equal(codexHostWorkerJobContractSchema.safeParse(
            makeJob({ project_root: '/tmp/other-project' }),
        ).success, false);
        assert.equal(codexHostWorkerJobContractSchema.safeParse(makeJob({
            target_paths: ['/tmp/cstar-host-project/src/worker.ts', '/tmp/cstar-host-project/src/worker.ts'],
        })).success, false);
        assert.equal(codexHostWorkerJobContractSchema.safeParse(
            makeJob({ known_spend_observed: true }),
        ).success, false);
        assert.equal(codexHostWorkerJobContractSchema.safeParse(makeJob({
            validation_ticket_binding: {
                ...makeJob().validation_ticket_binding!, attempt_id: 'attempt:test:other',
            },
        })).success, false);
    });

    it('persists one handoff, replays it idempotently, and rejects malformed or conflicting duplicates', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-host-worker-dispatch-'));
        roots.push(root);
        fs.chmodSync(root, 0o700);
        const job = makeJob();
        const first = persistForgeCodexHostWorkerHandoff(root, job);
        const replay = persistForgeCodexHostWorkerHandoff(root, job);
        assert.equal(first.replayed, false);
        assert.equal(replay.replayed, true);
        assert.equal(replay.handoff.handoff_sha256, first.handoff.handoff_sha256);
        assert.equal(replay.handoff.job.attempt_id, job.attempt_id);
        assert.equal(
            persistForgeCodexHostWorkerHandoff(root, makeJob({ actual_identity: 'gpt-5.6-luna' })).replayed,
            true,
        );
        assert.throws(() => persistForgeCodexHostWorkerHandoff(root, makeJob({ objective: 'different scope' })), /duplicate_conflict/);
        assert.throws(() => persistForgeCodexHostWorkerHandoff(root, makeJob({ project_root: '/tmp/other-project' })), /duplicate_conflict/);
        assert.throws(() => persistForgeCodexHostWorkerHandoff(root, makeJob({
            validation_ticket_request: { ...job.validation_ticket_request!, expires_at: 1_800 },
        })), /duplicate_conflict/);
        assert.throws(() => parseForgeCodexHostWorkerHandoff({}), /handoff_malformed/);
        assert.throws(() => parseForgeCodexHostWorkerHandoff({
            ...makeHandoff(job), provider_attempted: true,
        }), /handoff_malformed/);
        assert.throws(() => parseForgeCodexHostWorkerHandoff({
            ...makeHandoff(job), handoff_sha256: 'f'.repeat(64),
        }), /handoff_hash_mismatch/);
    });

    it('rejects a hardlink introduced after publication and removes the untrusted handoff', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-host-worker-hardlink-'));
        roots.push(root);
        const project = path.join(root, 'project');
        const target = path.join(project, 'worker.ts');
        const outside = path.join(root, 'outside.ts');
        fs.mkdirSync(project, { recursive: true });
        fs.writeFileSync(target, 'target\n');
        const job = makeJob({
            project_root: project,
            target_paths: [target],
            target_paths_sha256: digest([target]),
            path_identity_bindings: captureForgeHostPathIdentities([target], []),
        });
        const receipt = `forge-execute-${createHash('sha256')
            .update(`${job.canonical_request_id}\n${job.idempotency_key}`)
            .digest('hex').slice(0, 32)}`;
        assert.throws(
            () => persistForgeCodexHostWorkerHandoff(root, job, () => fs.linkSync(target, outside)),
            /forge_codex_host_path_identity_drift/,
        );
        assert.equal(fs.existsSync(path.join(root, 'work', 'forge-executions', receipt, 'codex-host-worker-handoff.json')), false);
    });
});
