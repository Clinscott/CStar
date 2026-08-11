import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    assertCouncilAutoresearchRequestEnvelope,
    runCouncilAutoresearchCli,
} from '../../../src/tools/council-autoresearch.js';

const roots: string[] = [];

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function temporary(label: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), label));
    roots.push(root);
    return root;
}

function git(root: string, args: string[]): string {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function repository(): string {
    const root = temporary('cstar-council-cli-source-');
    git(root, ['init', '-b', 'main']);
    git(root, ['config', 'user.email', 'council@example.test']);
    git(root, ['config', 'user.name', 'Council CLI Test']);
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'site.txt'), 'stable source\n');
    git(root, ['add', 'src/site.txt']);
    git(root, ['commit', '-m', 'fixture']);
    return root;
}

function writeRequest(root: string, name: string, request: unknown): string {
    const file = path.join(root, name);
    fs.writeFileSync(file, `${JSON.stringify(request, null, 2)}\n`);
    return file;
}

function invoke(command: string, requestFile: string): { code: number; output: string; payload: any } {
    const originalWrite = process.stdout.write;
    let output = '';
    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        return true;
    }) as typeof process.stdout.write;
    try {
        const code = runCouncilAutoresearchCli([command, '--request', requestFile]);
        return { code, output, payload: JSON.parse(output) };
    } finally {
        process.stdout.write = originalWrite;
    }
}

const base = {
    repo_root: '/tmp/council-source',
    run_id: 'council-cli-run-1',
    resume_token: 'ab'.repeat(32),
};

const validRequests = {
    'lease-acquire': { ...base, governed_paths: ['src'] },
    'recover-operation': { ...base },
    'lease-release': { ...base, disposition: 'abandoned' },
    'freeze-packet': {
        ...base,
        generation: 1,
        bundle_root: '/tmp/council-bundle',
        runner_publication_repo_root: '/tmp/council-runner-publication',
        packet: {},
    },
    'freeze-ratings': { ...base, generation: 1, bundle_root: '/tmp/council-bundle', ratings: {} },
    'reveal-mapping': { ...base, generation: 1, bundle_root: '/tmp/council-bundle', reveal: {} },
    evaluate: { ...base, generation: 1, bundle_root: '/tmp/council-bundle' },
    'verify-publication': {
        ...base,
        generation: 1,
        bundle_root: '/tmp/council-bundle',
        publication_repo_root: '/tmp/council-publication',
        publication: {},
    },
    status: { run_id: base.run_id },
} as const;

describe('Council autoresearch CLI request contract', () => {
    it('accepts only each command exact top-level envelope', () => {
        for (const [command, request] of Object.entries(validRequests)) {
            assert.doesNotThrow(() => assertCouncilAutoresearchRequestEnvelope(command as any, request));
            assert.throws(
                () => assertCouncilAutoresearchRequestEnvelope(command as any, { ...request, unexpected: true }),
                /unexpected or missing top-level fields/i,
            );
        }
        assert.throws(
            () => assertCouncilAutoresearchRequestEnvelope('lease-acquire', {
                repo_root: base.repo_root,
                run_id: base.run_id,
                governed_paths: ['src'],
            }),
            /unexpected or missing top-level fields/i,
        );
        assert.throws(
            () => assertCouncilAutoresearchRequestEnvelope('status', { run_id: base.run_id, generation: 1 }),
            /unexpected or missing top-level fields/i,
        );
    });

    it('requires numeric generation 1 on every generation command', () => {
        for (const command of [
            'freeze-packet', 'freeze-ratings', 'reveal-mapping', 'evaluate', 'verify-publication',
        ] as const) {
            const valid = validRequests[command];
            assert.throws(
                () => assertCouncilAutoresearchRequestEnvelope(command, { ...valid, generation: 2 }),
                /generation must be the number 1/i,
            );
            assert.throws(
                () => assertCouncilAutoresearchRequestEnvelope(command, { ...valid, generation: '1' }),
                /generation must be the number 1/i,
            );
            const missing = { ...valid } as Record<string, unknown>;
            delete missing.generation;
            assert.throws(
                () => assertCouncilAutoresearchRequestEnvelope(command, missing),
                /unexpected or missing top-level fields/i,
            );
        }
    });

    it('requires an explicit release disposition and a bundle for completed runs', () => {
        assert.doesNotThrow(() => assertCouncilAutoresearchRequestEnvelope('lease-release', {
            ...base,
            disposition: 'completed',
            bundle_root: '/tmp/council-bundle',
        }));
        assert.doesNotThrow(() => assertCouncilAutoresearchRequestEnvelope('lease-release', {
            ...base,
            disposition: 'abandoned',
            bundle_root: '/tmp/council-bundle',
        }));
        assert.throws(
            () => assertCouncilAutoresearchRequestEnvelope('lease-release', base),
            /unexpected or missing top-level fields/i,
        );
        assert.throws(
            () => assertCouncilAutoresearchRequestEnvelope('lease-release', {
                ...base,
                disposition: 'completed',
            }),
            /completed lease-release request requires bundle_root/i,
        );
        assert.throws(
            () => assertCouncilAutoresearchRequestEnvelope('lease-release', {
                ...base,
                disposition: 'cancelled',
            }),
            /disposition must be completed or abandoned/i,
        );
    });

    it('requires a caller-owned lease token and never emits it', () => {
        const repo = repository();
        const control = temporary('cstar-council-cli-control-');
        const requests = temporary('cstar-council-cli-requests-');
        const resumeToken = 'cd'.repeat(32);
        const previousControlRoot = process.env.CSTAR_CONTROL_ROOT;
        process.env.CSTAR_CONTROL_ROOT = control;
        try {
            const acquireFile = writeRequest(requests, 'acquire.json', {
                repo_root: repo,
                run_id: 'council-cli-run-1',
                resume_token: resumeToken,
                governed_paths: ['src'],
            });
            const acquired = invoke('lease-acquire', acquireFile);
            assert.equal(acquired.code, 0, acquired.output);
            assert.equal(acquired.payload.status, 'pass');
            assert.deepEqual(Object.keys(acquired.payload.data).sort(), ['created', 'lock_file', 'record']);
            assert.equal(acquired.payload.data.created, true);
            assert.equal(acquired.output.includes(resumeToken), false);
            assert.notEqual(acquired.payload.data.record.resume_token_sha256, resumeToken);

            const recoverFile = writeRequest(requests, 'recover.json', {
                repo_root: repo,
                run_id: 'council-cli-run-1',
                resume_token: resumeToken,
            });
            const recovered = invoke('recover-operation', recoverFile);
            assert.equal(recovered.code, 0, recovered.output);
            assert.deepEqual(recovered.payload.data, { recovered: false });

            const completedFile = writeRequest(requests, 'completed.json', {
                repo_root: repo,
                run_id: 'council-cli-run-1',
                resume_token: resumeToken,
                disposition: 'completed',
                bundle_root: requests,
            });
            const completed = invoke('lease-release', completedFile);
            assert.equal(completed.code, 1, completed.output);
            assert.match(completed.payload.error.message, /completed release requires.*PAUSED run/i);

            const releaseFile = writeRequest(requests, 'release.json', {
                repo_root: repo,
                run_id: 'council-cli-run-1',
                resume_token: resumeToken,
                disposition: 'abandoned',
            });
            const released = invoke('lease-release', releaseFile);
            assert.equal(released.code, 0, released.output);
            assert.equal(released.output.includes(resumeToken), false);
        } finally {
            if (previousControlRoot === undefined) delete process.env.CSTAR_CONTROL_ROOT;
            else process.env.CSTAR_CONTROL_ROOT = previousControlRoot;
        }
    });
});
