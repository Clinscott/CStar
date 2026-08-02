import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RuntimeGenerationHandshakeRequest } from '../../../src/types/kernel_runtime_generation.js';
import {
    buildCodeRootIdentity,
    fingerprintRuntimeFiles,
    KernelRuntimeGenerationError,
    normalizeRuntimePath,
    RUNTIME_GENERATION_ERROR_CODES,
} from '../../../src/tools/cstar-kernel-mcp/contracts/runtime_generation.js';
import {
    guardGenerationBoundMutation,
    KernelRuntimeGenerationAuthority,
    reattachAndReplay,
    reattachRuntimeGeneration,
    replayZeroProviderWork,
} from '../../../src/tools/cstar-kernel-mcp/tools/runtime_handshake.js';

function request(overrides: Partial<RuntimeGenerationHandshakeRequest> = {}): RuntimeGenerationHandshakeRequest {
    return {
        code_root: '/home/tester/Corvus/CStar',
        source_fingerprint: 'source-a',
        package_fingerprint: 'package-a',
        launch_nonce: 'launch-a',
        issued_at: 100,
        ...overrides,
    };
}

function assertErrorCode(action: () => unknown, code: string): void {
    assert.throws(action, (error: unknown) => (
        error instanceof KernelRuntimeGenerationError && error.code === code
    ));
}

describe('kernel runtime generation handshake', () => {
    it('rejects a stale mutation handle before the writer runs', () => {
        const authority = new KernelRuntimeGenerationAuthority({ clock: () => 200 });
        const first = authority.issue(request());
        const staleHandle = authority.handle(first);
        authority.issue(request({ launch_nonce: 'launch-b', issued_at: 201 }));

        let writes = 0;
        assertErrorCode(
            () => authority.mutate(staleHandle, () => { writes += 1; }),
            RUNTIME_GENERATION_ERROR_CODES.stale,
        );
        assert.equal(writes, 0);
    });

    it('allows a fresh matching handle to guard a mutation', () => {
        const authority = new KernelRuntimeGenerationAuthority({ clock: () => 200 });
        authority.issue(request());

        let writes = 0;
        const result = authority.mutate(authority.handle(), () => {
            writes += 1;
            return 'written';
        });
        assert.equal(result, 'written');
        assert.equal(writes, 1);
    });

    it('keeps generations strictly monotonic across explicit launches', () => {
        const authority = new KernelRuntimeGenerationAuthority({ clock: () => 200 });
        const first = authority.issue(request());
        const second = authority.issue(request({ launch_nonce: 'launch-b', issued_at: 201 }));

        assert.equal(first.generation, 1);
        assert.equal(second.generation, 2);
        assertErrorCode(
            () => authority.issue(request({ generation: 2, launch_nonce: 'launch-c' })),
            RUNTIME_GENERATION_ERROR_CODES.non_monotonic,
        );
    });

    it('rejects source and package evidence that does not match the current receipt', () => {
        const authority = new KernelRuntimeGenerationAuthority();
        const current = authority.issue(request());

        assertErrorCode(
            () => reattachRuntimeGeneration({
                current_receipt: current,
                source_fingerprint: 'source-old',
            }),
            RUNTIME_GENERATION_ERROR_CODES.source_mismatch,
        );
        assertErrorCode(
            () => reattachRuntimeGeneration({
                current_receipt: current,
                package_fingerprint: 'package-old',
            }),
            RUNTIME_GENERATION_ERROR_CODES.package_mismatch,
        );
    });

    it('reattaches explicitly and replays only idempotent zero-provider work', () => {
        const authority = new KernelRuntimeGenerationAuthority();
        const first = authority.issue(request());
        const current = authority.issue(request({
            launch_nonce: 'launch-b',
            source_fingerprint: 'source-b',
            package_fingerprint: 'package-b',
        }));
        let replayCount = 0;
        const result = reattachAndReplay(
            {
                current_receipt: current,
                stale_handle: authority.handle(first),
                code_root: current.code_root,
                source_fingerprint: current.source_fingerprint,
                package_fingerprint: current.package_fingerprint,
                launch_nonce: current.launch_nonce,
            },
            {
                idempotent: true,
                provider_attempts: 0,
                execute: () => {
                    replayCount += 1;
                    return 'replayed';
                },
            },
        );

        assert.equal(result.handle.expected_generation, current.generation);
        assert.equal(result.replayed, true);
        assert.equal(result.value, 'replayed');
        assert.equal(replayCount, 1);
        assertErrorCode(
            () => replayZeroProviderWork({ idempotent: true, provider_attempts: 1, execute: () => undefined }),
            RUNTIME_GENERATION_ERROR_CODES.replay_forbidden,
        );
        assertErrorCode(
            () => replayZeroProviderWork({ idempotent: false, provider_attempts: 0, execute: () => undefined }),
            RUNTIME_GENERATION_ERROR_CODES.replay_forbidden,
        );
    });

    it('normalizes Linux, WSL, and macOS roots deterministically', () => {
        assert.equal(
            normalizeRuntimePath('/home/tester/../Corvus/CStar', 'linux'),
            '/home/Corvus/CStar',
        );
        assert.equal(
            normalizeRuntimePath('\\\\wsl$\\Ubuntu\\home\\tester\\Corvus\\CStar', 'wsl'),
            'wsl://ubuntu/home/tester/Corvus/CStar',
        );
        assert.equal(
            normalizeRuntimePath('//wsl.localhost/Ubuntu/home/tester/Corvus/CStar', 'wsl'),
            'wsl://ubuntu/home/tester/Corvus/CStar',
        );
        assert.equal(
            normalizeRuntimePath('wsl://Ubuntu/home/tester/Corvus/CStar', 'wsl'),
            'wsl://ubuntu/home/tester/Corvus/CStar',
        );
        assert.equal(
            normalizeRuntimePath('/mnt/c/Users/tester/Corvus/CStar', 'wsl'),
            'wsl://c/Users/tester/Corvus/CStar',
        );
        assert.equal(
            normalizeRuntimePath('/Users/tester/Corvus/../CStar', 'macos'),
            '/Users/tester/CStar',
        );
        assert.equal(
            buildCodeRootIdentity('/Users/tester/Corvus/../CStar'),
            buildCodeRootIdentity('/Users/tester/CStar'),
        );
    });

    it('fingerprints files by normalized path and content rather than input order', () => {
        const first = fingerprintRuntimeFiles([
            { path: '/home/tester/CStar/package-lock.json', content: 'package' },
            { path: '/home/tester/CStar/src/main.ts', content: 'source' },
        ], '/home/tester/CStar');
        const second = fingerprintRuntimeFiles([
            { path: '/home/tester/CStar/src/main.ts', content: 'source' },
            { path: '/home/tester/CStar/package-lock.json', content: 'package' },
        ], '/home/tester/CStar');
        assert.equal(first, second);
        assert.notEqual(
            first,
            fingerprintRuntimeFiles([
                { path: '/home/tester/CStar/package-lock.json', content: 'changed' },
                { path: '/home/tester/CStar/src/main.ts', content: 'source' },
            ], '/home/tester/CStar'),
        );
        assert.throws(
            () => fingerprintRuntimeFiles([{ path: '../outside.ts', content: 'unsafe' }], '/home/tester/CStar'),
            /runtime_fingerprint_path_outside_code_root/,
        );
    });

    it('does not write when a standalone guard sees a stale generation', () => {
        const authority = new KernelRuntimeGenerationAuthority();
        const current = authority.issue(request());
        let writes = 0;
        assertErrorCode(
            () => guardGenerationBoundMutation(current, 2, () => { writes += 1; }),
            RUNTIME_GENERATION_ERROR_CODES.stale,
        );
        assert.equal(writes, 0);
    });
});
