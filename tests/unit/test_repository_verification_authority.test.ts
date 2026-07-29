import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    createVerificationPlan,
    resolveReceiptDirectory,
    VERIFICATION_RECEIPT_VERSION,
} from '../../scripts/verify.js';
import {
    isWorkerJobsV2Enabled,
    startWorkerJobOutputSchema,
} from '../../src/tools/cstar-kernel-mcp/contracts/worker_jobs.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

test('CStar owns verification and GitHub has no tracked workflow runner', () => {
    const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(packageJson.scripts.verify, 'node scripts/run-tsx.mjs scripts/verify.ts');
    assert.equal(VERIFICATION_RECEIPT_VERSION, 'cstar.verification.v1');
    assert.deepEqual(
        createVerificationPlan().map((step) => step.id),
        ['repository-diff', 'typecheck', 'node-tests', 'python-tests', 'distribution-contracts'],
    );

    const workflowRoot = path.join(root, '.github', 'workflows');
    const workflows = existsSync(workflowRoot)
        ? readdirSync(workflowRoot).filter((name) => /\.ya?ml$/u.test(name))
        : [];
    assert.deepEqual(workflows, []);
});

test('verification receipts cannot escape the repository', () => {
    assert.equal(
        resolveReceiptDirectory(root),
        path.join(root, '.cstar', 'verification', 'receipts'),
    );
    assert.throws(
        () => resolveReceiptDirectory(root, '../outside'),
        /must stay inside the CStar repository/u,
    );
});

test('Researcher and Forge worker links remain default-off and non-executable', () => {
    assert.equal(isWorkerJobsV2Enabled({}), false);
    assert.equal(isWorkerJobsV2Enabled({ CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2: 'true' }), false);
    assert.equal(isWorkerJobsV2Enabled({ CSTAR_KERNEL_ENABLE_WORKER_JOBS_V2: '1' }), true);

    const parsed = startWorkerJobOutputSchema.parse({
        status: 'queued',
        deduplicated: false,
        execution_available: false,
        job: {
            job_id: 'job-12345678',
            worker_kind: 'researcher',
            objective: 'Prepare a bounded evidence packet',
            workspace_ref: 'cstar',
            expected_artifacts: [{
                name: 'evidence packet',
                artifact_kind: 'report',
                required: true,
            }],
            state: 'QUEUED',
            progress: { percent: 0, phase: 'queued' },
            cancel_requested: false,
            attempt_count: 0,
            version: 1,
            artifacts: [],
            created_at: 1,
            updated_at: 1,
        },
    });
    assert.equal(parsed.execution_available, false);
});
