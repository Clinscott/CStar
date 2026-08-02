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

    it('classifies Windows backslash paths before relative fingerprint resolution', () => {
        const backslash = fingerprintRuntimeFiles([
            { path: 'C:\\Repo\\src\\main.ts', content: 'same-source' },
            { path: 'C:\\Repo\\package-lock.json', content: 'same-package' },
        ], 'C:\\Repo');
        const slash = fingerprintRuntimeFiles([
            { path: 'c:/Repo/src/main.ts', content: 'same-source' },
            { path: 'c:/Repo/package-lock.json', content: 'same-package' },
        ], 'c:/Repo');
        const relativeBackslash = fingerprintRuntimeFiles([
            { path: 'src\\main.ts', content: 'same-source' },
        ], 'C:\\Repo');
        const relativeSlash = fingerprintRuntimeFiles([
            { path: 'src/main.ts', content: 'same-source' },
        ], 'C:/Repo');

        assert.equal(backslash, slash);
        assert.equal(relativeBackslash, relativeSlash);
        assert.equal(normalizeRuntimePath('C:\\Repo'), normalizeRuntimePath('c:/Repo'));
        assert.notEqual(normalizeRuntimePath('C:\\Repo'), normalizeRuntimePath('C:\\repo'));
        assert.throws(() => normalizeRuntimePath('C:Repo'), /runtime_windows_drive_relative_forbidden/);
    });

    it('canonicalizes equivalent WSL UNC and mounted-drive spellings', () => {
        const backslashUnc = fingerprintRuntimeFiles([
            { path: '\\\\wsl$\\Ubuntu\\home\\tester\\repo\\src\\main.ts', content: 'same' },
        ], '\\\\wsl$\\Ubuntu\\home\\tester\\repo');
        const slashUnc = fingerprintRuntimeFiles([
            { path: '//wsl.localhost/Ubuntu/home/tester/repo/src/main.ts', content: 'same' },
        ], '//wsl.localhost/Ubuntu/home/tester/repo');
        const mounted = fingerprintRuntimeFiles([
            { path: '/mnt/c/Repo/src/main.ts', content: 'same' },
        ], '/mnt/c/Repo');
        const driveFromWslRoot = fingerprintRuntimeFiles([
            { path: 'C:\\Repo\\src\\main.ts', content: 'same' },
        ], '/mnt/c/Repo');

        assert.equal(backslashUnc, slashUnc);
        assert.equal(mounted, driveFromWslRoot);
    });

    it('preserves UNC, WSL, and POSIX identity boundaries', () => {
        assert.equal(
            normalizeRuntimePath('\\\\SERVER\\Share\\repo\\src'),
            normalizeRuntimePath('//server/Share/repo/src'),
        );
        assert.equal(
            normalizeRuntimePath('//server/Share/repo/src'),
            'unc://server/Share/repo/src',
        );
        assert.notEqual(
            normalizeRuntimePath('//server/Share/repo/src'),
            normalizeRuntimePath('/server/Share/repo/src'),
        );
        assert.notEqual(
            normalizeRuntimePath('/opt/repo/src\\main.ts', 'linux'),
            normalizeRuntimePath('/opt/repo/src/main.ts', 'linux'),
        );
        assert.equal(
            normalizeRuntimePath('//wslx$/Ubuntu/repo'),
            'unc://wslx$/Ubuntu/repo',
        );
        assert.throws(() => normalizeRuntimePath('//server'), /runtime_unc_path_invalid/);
        assert.throws(() => normalizeRuntimePath('\\\\server\\'), /runtime_unc_path_invalid/);
        assert.throws(() => normalizeRuntimePath('\\root-relative'), /runtime_windows_root_relative_forbidden/);
        assert.throws(() => normalizeRuntimePath('\\\\?\\C:\\Repo'), /runtime_windows_device_path_forbidden/);
    });

    it('rejects root prefix, suffix, and share-boundary collisions', () => {
        const candidates = [
            ['C:\\RepoOld\\src\\main.ts', 'C:\\Repo'],
            ['C:\\Other\\Repo\\src\\main.ts', 'C:\\Repo'],
            ['\\\\server\\Share\\repo-old\\src\\main.ts', '\\\\server\\Share\\repo'],
            ['\\\\server\\ShareExtra\\repo\\src\\main.ts', '\\\\server\\Share\\repo'],
            ['/opt/repository/src/main.ts', '/opt/repo'],
        ] as const;
        for (const [filePath, codeRoot] of candidates) {
            assert.throws(
                () => fingerprintRuntimeFiles([{ path: filePath, content: 'outside' }], codeRoot),
                /runtime_fingerprint_path_outside_code_root/,
            );
        }
    });

    it('keeps stale Windows handles on the no-write path', () => {
        const authority = new KernelRuntimeGenerationAuthority();
        const first = authority.issue(request({ code_root: 'C:\\Repo', launch_nonce: 'windows-a' }));
        const staleHandle = authority.handle(first);
        const current = authority.issue(request({ code_root: 'c:/Repo', launch_nonce: 'windows-b' }));
        let writes = 0;

        assertErrorCode(
            () => guardGenerationBoundMutation(current, staleHandle, () => { writes += 1; }),
            RUNTIME_GENERATION_ERROR_CODES.stale,
        );
        assert.equal(writes, 0);
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
