import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    acquireRepositoryLease,
    releaseRepositoryLease,
    sha256,
} from '../../../src/core/council_autoresearch/index.js';
import { runCouncilAutoresearchCli } from '../../../src/tools/council-autoresearch.js';
import {
    bundleFixture,
    cleanup,
    provisionTrustPolicy,
    repository,
    resumeToken,
    temporary,
    writeJson,
} from './test_helpers.js';

afterEach(cleanup);

function invoke(command: string, request: unknown, controlRoot: string): {
    code: number;
    body: Record<string, any>;
} {
    const requestRoot = temporary('cstar-council-cli-request-');
    const requestFile = path.join(requestRoot, 'request.json');
    writeJson(requestFile, request);
    fs.chmodSync(requestFile, 0o600);
    return invokeRequestFile(command, requestFile, controlRoot);
}

function invokeRequestFile(command: string, requestFile: string, controlRoot: string): {
    code: number;
    body: Record<string, any>;
} {
    const previousRoot = process.env.CSTAR_CONTROL_ROOT;
    const previousWrite = process.stdout.write;
    let output = '';
    process.env.CSTAR_CONTROL_ROOT = controlRoot;
    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        return true;
    }) as typeof process.stdout.write;
    try {
        const code = runCouncilAutoresearchCli([command, '--request', requestFile]);
        return { code, body: JSON.parse(output) };
    } finally {
        process.stdout.write = previousWrite;
        if (previousRoot === undefined) delete process.env.CSTAR_CONTROL_ROOT;
        else process.env.CSTAR_CONTROL_ROOT = previousRoot;
    }
}

function assertRejected(result: ReturnType<typeof invoke>, pattern: RegExp): void {
    assert.equal(result.code, 1);
    assert.equal(result.body.schema_version, COUNCIL_AUTORESEARCH_SCHEMA);
    assert.equal(result.body.runner_version, COUNCIL_AUTORESEARCH_RUNNER);
    assert.equal(result.body.status, 'fail');
    assert.match(result.body.error.message, pattern);
}

describe('Council autoresearch CLI runtime schema', () => {
    it('requires an exact private descriptor-backed request channel', () => {
        const control = temporary('cstar-council-cli-control-');
        const token = resumeToken('private-request');
        const request = { run_id: 'private-request', resume_token: token };
        const root = temporary('cstar-council-cli-request-');
        const file = path.join(root, 'request.json');
        writeJson(file, request);
        const publicFile = invokeRequestFile('status', file, control);
        assertRejected(publicFile, /private request channel/i);
        assert.equal(JSON.stringify(publicFile.body).includes(token), false);

        const publicRoot = temporary('cstar-council-cli-public-request-');
        fs.chmodSync(publicRoot, 0o755);
        const privateFileInPublicRoot = path.join(publicRoot, 'request.json');
        fs.writeFileSync(privateFileInPublicRoot, JSON.stringify(request), { mode: 0o600 });
        assertRejected(
            invokeRequestFile('status', privateFileInPublicRoot, control),
            /private request channel/i,
        );

        fs.chmodSync(file, 0o600);
        const alias = path.join(root, 'alias.json');
        fs.linkSync(file, alias);
        assertRejected(invokeRequestFile('status', file, control), /private request channel/i);
        fs.unlinkSync(alias);
        const symlink = path.join(root, 'symlink.json');
        fs.symlinkSync(file, symlink);
        assertRejected(invokeRequestFile('status', symlink, control), /private request channel/i);

        const oversized = path.join(root, 'oversized.json');
        fs.writeFileSync(oversized, Buffer.alloc((4 * 1024 * 1024) + 1), { mode: 0o600 });
        assertRejected(invokeRequestFile('status', oversized, control), /private request channel/i);

        const fifo = path.join(root, 'request.fifo');
        const made = spawnSync('/usr/bin/mkfifo', [fifo], { encoding: 'utf8' });
        assert.equal(made.status, 0, made.stderr);
        fs.chmodSync(fifo, 0o600);
        const originalOpen = fs.openSync;
        let fifoOpen = false;
        fs.openSync = ((target, flags, mode) => {
            if (target === fifo) {
                fifoOpen = true;
                assert.equal(Number(flags) & fs.constants.O_NONBLOCK, fs.constants.O_NONBLOCK);
                assert.equal(Number(flags) & fs.constants.O_NOFOLLOW, fs.constants.O_NOFOLLOW);
            }
            return originalOpen(target, flags, mode);
        }) as typeof fs.openSync;
        try {
            assertRejected(invokeRequestFile('status', fifo, control), /private request channel/i);
        } finally {
            fs.openSync = originalOpen;
        }
        assert.equal(fifoOpen, true);

        const replacement = path.join(root, 'replacement.json');
        const originalOpenForRace = fs.openSync;
        const originalRead = fs.readSync;
        let requestDescriptor: number | undefined;
        let replaced = false;
        fs.openSync = ((target, flags, mode) => {
            const descriptor = originalOpenForRace(target, flags, mode);
            if (target === file) requestDescriptor = descriptor;
            return descriptor;
        }) as typeof fs.openSync;
        fs.readSync = ((descriptor, buffer, offset, length, position) => {
            const count = originalRead(descriptor, buffer, offset, length, position);
            if (!replaced && descriptor === requestDescriptor) {
                replaced = true;
                fs.renameSync(file, replacement);
                fs.writeFileSync(file, '{"run_id":"replacement"}\n', { mode: 0o600 });
            }
            return count;
        }) as typeof fs.readSync;
        try {
            assertRejected(invokeRequestFile('status', file, control), /private request channel/i);
        } finally {
            fs.readSync = originalRead;
            fs.openSync = originalOpenForRace;
        }
        assert.equal(replaced, true);
    });

    it('rejects extra, missing, and wrong-type top-level input before creating a receipt', () => {
        const control = temporary('cstar-council-cli-control-');
        const cases = [
            {
                request: {
                    repo_root: '/does-not-matter', run_id: 'council-cli-run-1',
                    resume_token: resumeToken('council-cli-run-1'),
                    governed_paths: ['src'], unexpected: true,
                },
                pattern: /unknown field: unexpected/i,
            },
            {
                request: {
                    repo_root: '/does-not-matter', resume_token: resumeToken('council-cli-run-1'),
                    governed_paths: ['src'],
                },
                pattern: /missing required field: run_id/i,
            },
            {
                request: {
                    repo_root: '/does-not-matter', run_id: 'council-cli-run-1',
                    resume_token: resumeToken('council-cli-run-1'),
                    governed_paths: ['src', 42],
                },
                pattern: /governed_paths must be a string array/i,
            },
            {
                request: {
                    repo_root: '/does-not-matter', run_id: 'council-cli-run-1',
                    governed_paths: ['src'],
                },
                pattern: /missing required field: resume_token/i,
            },
            {
                request: {
                    repo_root: '/does-not-matter', run_id: 'council-cli-run-1',
                    resume_token: 42, governed_paths: ['src'],
                },
                pattern: /resume_token must be a non-empty string/i,
            },
        ];
        for (const testCase of cases) {
            assertRejected(invoke('lease-acquire', testCase.request, control), testCase.pattern);
            assert.equal(fs.existsSync(path.join(control, 'council-autoresearch')), false);
        }
    });

    it('keeps the caller resume capability out of successful and replayed output', () => {
        const source = repository();
        const control = temporary('cstar-council-cli-control-');
        const fixture = bundleFixture();
        provisionTrustPolicy(control, fixture);
        const token = resumeToken('council-cli-acquire-success');
        const request = {
            repo_root: source,
            run_id: 'council-cli-acquire-success',
            resume_token: token,
            governed_paths: ['src'],
        };
        assertRejected(
            invoke('lease-acquire', { ...request, resume_token: 'not-lowercase-hex' }, control),
            /32 random bytes encoded as lowercase hex/i,
        );
        assert.equal(fs.existsSync(path.join(
            control, 'council-autoresearch', request.run_id, '00-source-lease.json',
        )), false);
        const first = invoke('lease-acquire', request, control);
        assert.equal(first.code, 0);
        assert.equal(first.body.schema_version, COUNCIL_AUTORESEARCH_SCHEMA);
        assert.equal(first.body.runner_version, COUNCIL_AUTORESEARCH_RUNNER);
        assert.equal(first.body.command, 'lease-acquire');
        assert.equal(first.body.status, 'pass');
        assert.deepEqual(Object.keys(first.body.data).sort(), ['created', 'lock_file', 'record']);
        assert.equal(first.body.data.created, true);
        assert.equal(first.body.data.record.resume_token_sha256, sha256(token));
        assert.equal('resume_token' in first.body.data, false);
        assert.equal(JSON.stringify(first.body).includes(token), false);

        const replay = invoke('lease-acquire', request, control);
        assert.equal(replay.code, 0);
        assert.equal(replay.body.status, 'pass');
        assert.deepEqual(Object.keys(replay.body.data).sort(), ['created', 'lock_file', 'record']);
        assert.equal(replay.body.data.created, false);
        assert.deepEqual(replay.body.data.record, first.body.data.record);
        assert.equal(replay.body.data.lock_file, first.body.data.lock_file);
        assert.equal(JSON.stringify(replay.body).includes(token), false);
        releaseRepositoryLease({
            repoRoot: source,
            controlRoot: control,
            runId: request.run_id,
            resumeToken: token,
        });
    });

    it('rejects nested packet and rating schema drift without advancing the receipt chain', () => {
        const source = repository();
        const control = temporary('cstar-council-cli-control-');
        const fixture = bundleFixture();
        const token = resumeToken('council-cli-run-1');
        const lease = acquireRepositoryLease({
            repoRoot: source,
            controlRoot: control,
            runId: 'council-cli-run-1',
            resumeToken: token,
            governedPaths: ['src'],
        });
        const input = fixture.packetInput;
        const packet = {
            source_head: lease.record.source_head,
            source_manifest_sha256: lease.record.source_manifest.manifest_sha256,
            governed_paths: input.governedPaths,
            contract_manifest: input.contractManifest,
            council_order: input.councilOrder,
            protocol_manifest: input.protocolManifest,
            protocol_path_by_expert: input.protocolPathByExpert,
            protocol_sha256_by_expert: input.protocolSha256ByExpert,
            variants: input.variants,
            rubric_manifest: input.rubricManifest,
            evidence_manifest: input.evidenceManifest,
            runner_publication: input.runnerPublication,
            seed: input.seed,
            blind_mapping_commitment_sha256: input.blindMappingCommitmentSha256,
            rating_policy: input.ratingPolicy,
            publication_subject: input.publicationSubject,
        };
        const base = {
            repo_root: source,
            run_id: lease.record.run_id,
            resume_token: token,
            bundle_root: fixture.bundle,
            runner_publication_repo_root: input.runnerPublicationRepoRoot,
            packet,
        };
        try {
            const extra = structuredClone(base) as any;
            extra.packet.contract_manifest.extra = true;
            assertRejected(invoke('freeze-packet', extra, control), /contract_manifest.*unexpected or missing/i);

            const missing = structuredClone(base) as any;
            delete missing.packet.runner_publication.checkpoint;
            assertRejected(invoke('freeze-packet', missing, control), /runner_publication.*unexpected or missing/i);

            const wrongMap = structuredClone(base) as any;
            wrongMap.packet.protocol_sha256_by_expert.torvalds = 42;
            assertRejected(invoke('freeze-packet', wrongMap, control), /protocol_sha256_by_expert\.torvalds must be a string/i);

            const wrongRating = {
                repo_root: source,
                run_id: lease.record.run_id,
                resume_token: token,
                bundle_root: fixture.bundle,
                runner_publication_repo_root: input.runnerPublicationRepoRoot,
                ratings: {
                    packet_sha256: 'a'.repeat(64),
                    records: [{
                        rating: {
                            expert: 'torvalds', preference: 'B', rationale: 'A sufficiently long rationale.',
                            axis_scores: { truth: { A: '3', B: 4 } },
                            protected_axis_regressions: { truth: false },
                        },
                        execution_receipt: {},
                    }],
                },
            };
            assertRejected(invoke('freeze-ratings', wrongRating, control), /rating\.axis_scores\.truth\.A must be a finite number/i);
            const receiptRoot = path.join(control, 'council-autoresearch', lease.record.run_id);
            assert.equal(fs.existsSync(path.join(receiptRoot, '10-packet.json')), false);
            assert.equal(fs.existsSync(path.join(receiptRoot, '20-ratings.json')), false);
        } finally {
            releaseRepositoryLease({
                repoRoot: source,
                controlRoot: control,
                runId: lease.record.run_id,
                resumeToken: token,
            });
        }
    });
});
