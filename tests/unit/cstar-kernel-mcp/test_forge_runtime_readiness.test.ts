import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    buildKernelRuntimeLineageForRoots,
    evaluateKernelForgeReadiness,
    platformAllows,
} from '../../../src/tools/cstar-kernel-mcp/contracts/runtime_lineage.js';
import {
    assertLiveForgeRuntimeReady,
    createStableForgeRuntimeReadinessAssertion,
} from '../../../src/tools/cstar-kernel-mcp/contracts/runtime.js';

const roots: string[] = [];
const forgeSources = [
    'hermes_cli/__init__.py',
    'hermes_cli/forge_mode.py',
    'hermes_cli/forge_minimax_oauth.py',
    'hermes_cli/forge_provider_journal.py',
    'hermes_cli/forge_entrypoint.py',
];

function writeJson(candidate: string, value: unknown): void {
    fs.mkdirSync(path.dirname(candidate), { recursive: true });
    fs.writeFileSync(candidate, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(candidate: string, content: string | Buffer = 'synthetic\n'): void {
    fs.mkdirSync(path.dirname(candidate), { recursive: true });
    fs.writeFileSync(candidate, content);
}

function fixture(): { codeRoot: string; controlRoot: string; runtimeRoot: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-runtime-lineage-'));
    roots.push(root);
    const codeRoot = path.join(root, 'code');
    const controlRoot = path.join(root, 'control');
    const runtimeRoot = path.join(codeRoot, '.agents', 'skills', 'corvus-forge', 'runtime');
    fs.mkdirSync(controlRoot, { recursive: true });
    writeFile(path.join(codeRoot, 'bin', 'cstar-kernel-mcp.js'));
    writeFile(path.join(codeRoot, 'src', 'tools', 'cstar-kernel-mcp.ts'));
    const packageJson = {
        name: 'synthetic-cstar',
        version: '1.0.1',
        bin: {
            cstar: './bin/cstar.js',
            'cstar-kernel-mcp': './bin/cstar-kernel-mcp.js',
        },
        dependencies: { alpha: '1.0.0' },
        devDependencies: { tsx: '4.23.0' },
    };
    const packageEntries = {
        '': {
            ...packageJson,
            bin: {
                cstar: 'bin/cstar.js',
                'cstar-kernel-mcp': 'bin/cstar-kernel-mcp.js',
            },
        },
        'node_modules/alpha': { version: '1.0.0' },
        'node_modules/tsx': { version: '4.23.0' },
    };
    writeJson(path.join(codeRoot, 'package.json'), packageJson);
    writeJson(path.join(codeRoot, 'package-lock.json'), {
        name: packageJson.name,
        version: packageJson.version,
        lockfileVersion: 3,
        packages: packageEntries,
    });
    writeJson(path.join(codeRoot, 'node_modules', '.package-lock.json'), {
        name: packageJson.name,
        version: packageJson.version,
        lockfileVersion: 3,
        packages: Object.fromEntries(Object.entries(packageEntries).filter(([key]) => key)),
    });
    writeJson(path.join(codeRoot, 'node_modules', 'alpha', 'package.json'), {
        name: 'alpha', version: '1.0.0',
    });
    writeJson(path.join(codeRoot, 'node_modules', 'tsx', 'package.json'), {
        name: 'tsx', version: '4.23.0',
    });
    writeFile(path.join(runtimeRoot, 'bin', 'hermes'), [
        '#!/bin/sh', '# CSTAR_FORGE_RUNTIME_LAUNCHER_V2', 'exit 0', '',
    ].join('\n'));
    for (const relative of forgeSources) writeFile(path.join(runtimeRoot, relative));
    writeJson(path.join(runtimeRoot, 'manifest.json'), {
        schema: 'cstar.forge_private_runtime_manifest.v2',
        runtime_owner: 'cstar',
        credential_profile_owner: 'hermes',
        credential_profile: 'cstar-hub',
        provider: 'minimax-oauth',
        model: 'MiniMax-M3',
        launcher: 'bin/hermes',
        source_files: forgeSources,
        bootstrap_mode: 'cstar_owned_python_system_stdlib_snapshot_v2',
        dependency_mode: 'stdlib_only_no_site_packages_v2',
        network_entrypoint: 'hermes_cli.forge_entrypoint',
        allow_arbitrary_source_root: false,
        oauth_read_only: true,
        oauth_refresh_allowed: false,
        oauth_store_write_allowed: false,
    });
    return { codeRoot, controlRoot, runtimeRoot };
}

function hostFixture(): { codeRoot: string; controlRoot: string; runtimeRoot: string } {
    const value = fixture();
    writeJson(path.join(value.runtimeRoot, 'host-manifest.json'), {
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
    });
    writeJson(path.join(value.runtimeRoot, 'host-manifest.schema.json'), {
        $id: 'cstar.forge_host_runtime_manifest.v2',
        additionalProperties: false,
    });
    writeFile(
        path.join(value.codeRoot, '.agents/skills/corvus-forge/scripts/codex_host_runtime_lineage.mjs'),
        'cstar.forge_host_runtime_receipt.v2\n',
    );
    return value;
}

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Forge live-runtime readiness', () => {
    it('reads the legacy Hermes manifest but never treats it as current readiness', () => {
        const value = fixture();
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(lineage.dependency_lineage, 'verified_lock_match');
        assert.equal(
            lineage.dependency_proof.native_artifact_proof.contract,
            'verified_required_native_artifacts',
        );
        assert.equal(lineage.forge_runtime_proof.contract, 'verified_manifest_content');
        assert.equal(lineage.forge_runtime_proof.manifest_version, 'legacy_v1');
        assert.equal(lineage.forge_runtime_proof.actionable, false);
        assert.equal(lineage.forge_runtime_manifest_present, false);
        assert.ok(evaluateKernelForgeReadiness(lineage).failures.includes(
            'forge_runtime_legacy_v1_non_actionable',
        ));
    });

    it('accepts only a distinct-root, synchronized, current Codex-host runtime', () => {
        const value = hostFixture();
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(lineage.forge_runtime_proof.contract, 'verified_manifest_content');
        assert.equal(lineage.forge_runtime_proof.manifest_version, 'host_v2');
        assert.equal(lineage.forge_runtime_proof.actionable, true);
        assert.equal(lineage.forge_runtime_proof.launcher_sha256, null);
        assert.equal(lineage.forge_runtime_proof.executable_launcher_present, false);
        assert.ok(lineage.forge_runtime_proof.receipt_sha256);
        assert.deepEqual(evaluateKernelForgeReadiness(lineage), { ready: true, failures: [] });
    });

    it('rejects a same-root live binding', () => {
        const value = fixture();
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.codeRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(evaluateKernelForgeReadiness(lineage).ready, false);
        assert.ok(evaluateKernelForgeReadiness(lineage).failures.includes(
            'forge_runtime_distinct_code_control_roots_required',
        ));
    });

    it('rejects another dependency drift even when TSX still matches', () => {
        const value = fixture();
        writeJson(path.join(value.codeRoot, 'node_modules', 'alpha', 'package.json'), {
            name: 'alpha', version: '2.0.0',
        });
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(lineage.dependency_lineage, 'partial');
        assert.ok(lineage.dependency_proof.mismatch_reasons.includes(
            'installed_package_version_mismatch',
        ));
        assert.ok(evaluateKernelForgeReadiness(lineage).failures.includes(
            'forge_runtime_dependency_lineage_partial',
        ));
    });

    it('classifies optional Linux packages by lockfile libc constraints', {
        skip: process.platform !== 'linux',
    }, (context) => {
        const value = fixture();
        const lockPath = path.join(value.codeRoot, 'package-lock.json');
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as any;
        const report = process.report?.getReport() as {
            header: Record<string, unknown>;
            sharedObjects?: string[];
        };
        const header = report.header;
        const glibc = typeof header.glibcVersionRuntime === 'string'
            && header.glibcVersionRuntime.trim() !== '';
        const musl = (report.sharedObjects ?? []).some((candidate) => (
            candidate.includes('libc.musl-') || candidate.includes('ld-musl-')
        ));
        const currentLibc = glibc ? 'glibc' : musl ? 'musl' : null;
        if (!currentLibc) {
            context.skip('Linux libc could not be proven from the Node process report');
            return;
        }
        const incompatibleLibc = currentLibc === 'glibc' ? 'musl' : 'glibc';
        lock.packages['node_modules/optional-incompatible-libc'] = {
            version: '1.0.0',
            optional: true,
            os: ['linux'],
            cpu: [process.arch],
            libc: [incompatibleLibc],
        };
        writeJson(lockPath, lock);

        const accepted = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(accepted.dependency_lineage, 'verified_lock_match');
        assert.equal(accepted.dependency_proof.omitted_incompatible_optional_packages, 1);

        lock.packages['node_modules/optional-incompatible-libc'].libc = [currentLibc];
        writeJson(lockPath, lock);
        const rejected = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(rejected.dependency_lineage, 'partial');
        assert.ok(rejected.dependency_proof.mismatch_reasons.includes('installed_package_missing'));
    });

    it('matches npm any rules and treats unknown libc as potentially compatible', () => {
        const runtime = { platform: 'linux' as NodeJS.Platform, arch: process.arch, libc: 'glibc' as const };
        assert.equal(platformAllows({ libc: ['any'] }, runtime), true);
        assert.equal(platformAllows({ libc: ['any', '!glibc'] }, runtime), false);
        assert.equal(platformAllows({ libc: ['musl'] }, { ...runtime, libc: null }), true);
    });

    it('rejects full hidden-lock metadata drift', () => {
        const value = fixture();
        const lockPath = path.join(value.codeRoot, 'node_modules', '.package-lock.json');
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as any;
        lock.packages['node_modules/alpha'].dependencies = { beta: '1.0.0' };
        writeJson(lockPath, lock);
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(lineage.dependency_lineage, 'partial');
        assert.ok(lineage.dependency_proof.mismatch_reasons.includes(
            'installed_package_lock_mismatch',
        ));
    });

    it('rejects installed packages reached through an intermediate symlink', () => {
        const value = fixture();
        const sourceLockPath = path.join(value.codeRoot, 'package-lock.json');
        const installedLockPath = path.join(value.codeRoot, 'node_modules', '.package-lock.json');
        const sourceLock = JSON.parse(fs.readFileSync(sourceLockPath, 'utf8')) as any;
        const installedLock = JSON.parse(fs.readFileSync(installedLockPath, 'utf8')) as any;
        const entry = { version: '1.0.0' };
        sourceLock.packages['node_modules/@scope/alpha'] = entry;
        installedLock.packages['node_modules/@scope/alpha'] = entry;
        writeJson(sourceLockPath, sourceLock);
        writeJson(installedLockPath, installedLock);
        const outsideScope = path.join(path.dirname(value.codeRoot), 'outside-scope');
        writeJson(path.join(outsideScope, 'alpha', 'package.json'), {
            name: '@scope/alpha', version: '1.0.0',
        });
        fs.symlinkSync(outsideScope, path.join(value.codeRoot, 'node_modules', '@scope'));
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(lineage.dependency_lineage, 'partial');
        assert.ok(lineage.dependency_proof.mismatch_reasons.includes(
            'installed_package_path_unsafe',
        ));
    });

    it('rejects a manifest whose root metadata does not match the source lock', () => {
        const value = fixture();
        writeJson(path.join(value.codeRoot, 'package.json'), {
            name: 'synthetic-cstar',
            version: '1.0.2',
            dependencies: { alpha: '1.0.0' },
            devDependencies: { tsx: '4.23.0' },
        });
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(lineage.dependency_proof.package_metadata, 'partial');
        assert.ok(lineage.dependency_proof.mismatch_reasons.includes(
            'package_metadata_lock_root_mismatch',
        ));
        assert.equal(evaluateKernelForgeReadiness(lineage).ready, false);
    });

    it('normalizes only npm leading-dot bin paths in root metadata', () => {
        const value = fixture();
        const lockPath = path.join(value.codeRoot, 'package-lock.json');
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as any;
        lock.packages[''].bin.cstar = '../bin/cstar.js';
        writeJson(lockPath, lock);
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.ok(lineage.dependency_proof.mismatch_reasons.includes(
            'package_metadata_lock_root_mismatch',
        ));
    });

    it('rejects a stale install-script marker in the source lock', () => {
        const value = fixture();
        const lockPath = path.join(value.codeRoot, 'package-lock.json');
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as any;
        lock.packages[''].hasInstallScript = true;
        writeJson(lockPath, lock);
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(lineage.dependency_proof.package_metadata, 'partial');
        assert.ok(lineage.dependency_proof.mismatch_reasons.includes(
            'package_metadata_lock_root_mismatch',
        ));
    });

    it('rejects a missing installed lock and a missing private-runtime source', () => {
        const value = fixture();
        fs.rmSync(path.join(value.codeRoot, 'node_modules', '.package-lock.json'));
        fs.rmSync(path.join(value.runtimeRoot, forgeSources[4]));
        writeFile(path.join(value.runtimeRoot, 'bin', 'hermes'), '#!/bin/sh\nexit 0\n');
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        const readiness = evaluateKernelForgeReadiness(lineage);
        assert.equal(readiness.ready, false);
        assert.ok(readiness.failures.includes('forge_runtime_dependency_lineage_partial'));
        assert.ok(readiness.failures.includes('forge_runtime_private_runtime_partial'));
        assert.ok(lineage.forge_runtime_proof.mismatch_reasons.includes(
            `forge_runtime_file_missing_or_unsafe:${forgeSources[4]}`,
        ));
        assert.ok(lineage.forge_runtime_proof.mismatch_reasons.includes(
            'forge_runtime_launcher_marker_missing',
        ));
    });

    it('rejects unknown manifest keys and non-string source entries', () => {
        const value = fixture();
        const manifestPath = path.join(value.runtimeRoot, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as any;
        manifest.source_files = [...forgeSources, 7];
        manifest.unexpected_field = true;
        writeJson(manifestPath, manifest);
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(lineage.forge_runtime_proof.contract, 'partial');
        assert.ok(lineage.forge_runtime_proof.mismatch_reasons.includes(
            'forge_runtime_manifest_contract_invalid',
        ));
    });

    it('rejects a ready-but-changed binding before spend', () => {
        let calls = 0;
        const assertStable = createStableForgeRuntimeReadinessAssertion(() => ({
            binding_sha256: calls++ === 0 ? 'binding-a' : 'binding-b',
        }));
        assert.equal(assertStable().binding_sha256, 'binding-a');
        assert.throws(() => assertStable(), /forge_runtime_binding_drift/);
    });

    it('allows only the explicit library-test bypass and marks it as test-only', () => {
        const priorTestContext = process.env.NODE_TEST_CONTEXT;
        const priorRuntimeBypass = process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
        try {
            process.env.NODE_TEST_CONTEXT = 'cstar-synthetic';
            process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
            assert.equal(assertLiveForgeRuntimeReady().test_only_bypass, true);
            process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '0';
            assert.throws(() => assertLiveForgeRuntimeReady(), /forge_runtime_not_ready/);
        } finally {
            if (priorTestContext === undefined) delete process.env.NODE_TEST_CONTEXT;
            else process.env.NODE_TEST_CONTEXT = priorTestContext;
            if (priorRuntimeBypass === undefined) delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
            else process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = priorRuntimeBypass;
        }
    });

    it('wires the shared assertion before every live request, authorization, and spend boundary', () => {
        const sourceRoot = path.resolve('.');
        const request = fs.readFileSync(
            path.join(sourceRoot, 'src/tools/cstar-kernel-mcp/tools/forge_request.ts'), 'utf8',
        );
        const authorize = fs.readFileSync(
            path.join(sourceRoot, 'src/tools/cstar-kernel-mcp/tools/forge_authorize.ts'), 'utf8',
        );
        const execute = fs.readFileSync(
            path.join(sourceRoot, 'src/tools/cstar-kernel-mcp/tools/forge_execute.ts'), 'utf8',
        );
        const assertBefore = (source: string, first: string, second: string): void => {
            const firstIndex = source.indexOf(first);
            const secondIndex = source.indexOf(second);
            assert.notEqual(firstIndex, -1);
            assert.notEqual(secondIndex, -1);
            assert.ok(firstIndex < secondIndex);
        };
        assertBefore(request, 'if (liveRequested) assertLiveForgeRuntimeReady();',
            'const db = getForgeWritableDb(controlRoot);');
        assertBefore(authorize, 'assertLiveForgeRuntimeReady();',
            'const writable = getForgeWritableDb(root);');
        const assertions = [...execute.matchAll(/assertStableRuntimeReady\(\);/g)].map((match) => match.index!);
        assert.equal(assertions.length, 3);
        assertBefore(execute, 'assertStableRuntimeReady();',
            'const reservation = reserveVerifiedForgeExecution');
        assertBefore(execute.slice(assertions[1]), 'assertStableRuntimeReady();',
            'const reservation = reserveVerifiedForgeExecution');
        assertBefore(execute.slice(assertions[2]), 'assertStableRuntimeReady();',
            'markForgeAttemptStarted(');
        assertBefore(execute.slice(assertions[2]), 'assertStableRuntimeReady();',
            'invokeForgeHermesMinimaxAdapter(');
    });
});
