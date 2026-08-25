import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    collectSourceEvidence,
    computeReceiptChecksum,
    createVerificationPlan,
    discoverNodeTestFiles,
    parseTestCounts,
    resolveReceiptDirectory,
    runVerification,
    VERIFICATION_RECEIPT_VERSION,
    type VerificationStep,
} from '../../scripts/verify.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const temporaryRoots: string[] = [];

function temporaryDirectory(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    temporaryRoots.push(root);
    return root;
}

function git(root: string, args: string[]): string {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function createRepository(): string {
    const root = temporaryDirectory('cstar-verification-');
    git(root, ['init', '--quiet']);
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture","type":"module"}\n');
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
    fs.writeFileSync(path.join(root, 'src', 'tracked.txt'), 'tracked-v1\n');
    fs.symlinkSync('src/tracked.txt', path.join(root, 'tracked-link'));
    git(root, ['add', 'package.json', 'package-lock.json', 'src/tracked.txt', 'tracked-link']);
    git(root, [
        '-c',
        'user.name=CStar Test',
        '-c',
        'user.email=cstar-test@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'fixture',
    ]);
    return root;
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('non-authoritative repository verification evidence', () => {
    it('discovers the complete active Node test tree without the quarantine tree', () => {
        const discovered = discoverNodeTestFiles(repositoryRoot);
        const plan = createVerificationPlan(repositoryRoot);
        const nodeStep = plan.find((step) => step.id === 'node-tests');

        assert.ok(discovered.includes('tests/unit/corvus-forge/test_forge_delegate_evidence.test.mjs'));
        assert.ok(discovered.includes('tests/integration/ipc/test_ipc_boundary.test.ts'));
        assert.ok(discovered.every((entry) => !entry.startsWith('tests/quarantine/')));
        assert.deepEqual(nodeStep?.args.slice(4), discovered);
        assert.deepEqual(
            plan.map((step) => step.id),
            ['repository-diff', 'typecheck', 'node-tests', 'python-tests', 'distribution-contracts'],
        );
    });

    it('binds HEAD, package-lock, and every tracked and untracked byte change', () => {
        const root = createRepository();
        const clean = collectSourceEvidence(root);
        assert.equal(clean.dirty, false);
        assert.equal(clean.head, git(root, ['rev-parse', 'HEAD']));
        assert.equal(
            clean.package_lock_sha256,
            sha256(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')),
        );
        assert.deepEqual(
            clean.manifest.map((entry) => [entry.path, entry.tracked, entry.kind]),
            [
                ['package-lock.json', true, 'file'],
                ['package.json', true, 'file'],
                ['src/tracked.txt', true, 'file'],
                ['tracked-link', true, 'symlink'],
            ],
        );

        fs.writeFileSync(path.join(root, 'src', 'tracked.txt'), 'tracked-v2\n');
        const modifiedTracked = collectSourceEvidence(root);
        assert.notEqual(modifiedTracked.binding_sha256, clean.binding_sha256);

        fs.writeFileSync(path.join(root, 'src', 'tracked.txt'), 'tracked-v1\n');
        fs.writeFileSync(path.join(root, 'untracked.txt'), 'untracked-v1\n');
        const untracked = collectSourceEvidence(root);
        assert.equal(untracked.untracked_count, 1);
        assert.equal(
            untracked.manifest.find((entry) => entry.path === 'untracked.txt')?.tracked,
            false,
        );
        assert.notEqual(untracked.binding_sha256, clean.binding_sha256);

        fs.writeFileSync(path.join(root, 'untracked.txt'), 'untracked-v2\n');
        assert.notEqual(collectSourceEvidence(root).binding_sha256, untracked.binding_sha256);

        fs.rmSync(path.join(root, 'src', 'tracked.txt'));
        const deleted = collectSourceEvidence(root);
        assert.deepEqual(
            deleted.manifest.find((entry) => entry.path === 'src/tracked.txt'),
            {
                path: 'src/tracked.txt',
                tracked: true,
                kind: 'missing',
                bytes: null,
                sha256: null,
            },
        );
        assert.notEqual(deleted.binding_sha256, untracked.binding_sha256);
    });

    it('rejects lexical and symlink receipt escapes', () => {
        const root = createRepository();
        const outside = temporaryDirectory('cstar-verification-outside-');
        fs.symlinkSync(outside, path.join(root, 'escape'));

        assert.equal(
            resolveReceiptDirectory(root),
            path.join(root, '.cstar', 'verification', 'receipts'),
        );
        assert.throws(
            () => resolveReceiptDirectory(root, '../outside'),
            /must stay inside the repository/u,
        );
        assert.throws(
            () => resolveReceiptDirectory(root, 'escape/receipts'),
            /resolves outside the repository/u,
        );
    });

    it('records non-authoritative command evidence, counts, hashes, and an atomic checksum', () => {
        const root = createRepository();
        const plan: VerificationStep[] = [
            {
                id: 'node-tests',
                command: 'node-test',
                args: [],
                testRunner: 'node-tap',
            },
            {
                id: 'python-tests',
                command: 'python-test',
                args: [],
                testRunner: 'pytest',
            },
        ];
        const outputs = [
            {
                stdout: Buffer.from('# tests 3\n# pass 2\n# fail 0\n# skipped 1\n# todo 0\n# cancelled 0\n'),
                stderr: Buffer.from('node diagnostic\n'),
            },
            {
                stdout: Buffer.from('2 passed, 1 xfailed in 0.10s\n'),
                stderr: Buffer.alloc(0),
            },
        ];
        let invocation = 0;
        const spawn = (() => {
            const output = outputs[invocation++];
            return {
                pid: 1,
                output: [null, output.stdout, output.stderr],
                stdout: output.stdout,
                stderr: output.stderr,
                status: 0,
                signal: null,
            };
        }) as NonNullable<Parameters<typeof runVerification>[1]>['spawn'];

        const { receipt, receiptPath, latestPath } = runVerification(root, {
            plan,
            spawn,
            echoOutput: false,
        });
        assert.equal(receipt.schema, VERIFICATION_RECEIPT_VERSION);
        assert.equal(receipt.evidence_only, true);
        assert.equal(receipt.authority, 'none');
        assert.equal(receipt.lifecycle_effect, 'none');
        assert.equal(receipt.cstar_acceptance, false);
        assert.equal(receipt.hall_mutation, false);
        assert.equal(receipt.outcome, 'commands_passed');
        assert.deepEqual(receipt.command_list, [
            { id: 'node-tests', argv: ['node-test'] },
            { id: 'python-tests', argv: ['python-test'] },
        ]);
        assert.deepEqual(receipt.steps.map((step) => step.exit_code), [0, 0]);
        assert.deepEqual(receipt.test_counts, {
            total: 6,
            passed: 4,
            failed: 0,
            skipped: 1,
            todo: 1,
            cancelled: 0,
        });
        assert.equal(receipt.steps[0].stdout_sha256, sha256(outputs[0].stdout.toString()));
        assert.equal(receipt.steps[0].stderr_sha256, sha256(outputs[0].stderr.toString()));
        assert.equal(receipt.receipt_sha256, computeReceiptChecksum(receipt));
        assert.ok(fs.existsSync(receiptPath));
        assert.equal(fs.readFileSync(latestPath, 'utf8'), fs.readFileSync(receiptPath, 'utf8'));
        assert.deepEqual(
            fs.readdirSync(path.dirname(receiptPath)).filter((entry) => entry.includes('.tmp-')),
            [],
        );
        const persisted = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
        assert.equal(persisted.receipt_sha256, receipt.receipt_sha256);
    });

    it('parses failed test evidence without turning it into lifecycle authority', () => {
        assert.deepEqual(
            parseTestCounts(
                'pytest',
                Buffer.from('1 failed, 2 passed, 3 skipped, 1 error in 0.2s\n'),
                Buffer.alloc(0),
            ),
            {
                total: 7,
                passed: 2,
                failed: 2,
                skipped: 3,
                todo: 0,
                cancelled: 0,
            },
        );
    });
});
