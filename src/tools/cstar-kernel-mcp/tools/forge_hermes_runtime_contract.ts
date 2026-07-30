import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    readVerifiedRuntimeFile,
    type ForgeAdapterRuntimeProof,
} from './forge_adapter_runtime.js';

export interface ForgeHermesRuntimeExpectation {
    schema: 'cstar.forge_hermes_runtime_expectation.v2';
    locator_path: string;
    executable_sha256: string;
    runtime_content_sha256: string;
    runtime_manifest_sha256: string | null;
    runtime_schema: 'cstar.forge_private_runtime_manifest.v2' | 'synthetic_test_executable_v1';
    runtime_owner: 'cstar' | 'synthetic_test';
    credential_profile_owner: 'hermes' | 'synthetic_test';
    python_sha256: string | null;
    source_file_count: number;
    source_bytes: number;
    bootstrap_mode: 'cstar_owned_python_system_stdlib_snapshot_v2' | 'synthetic_test_executable_v1';
    dependency_mode: 'stdlib_only_no_site_packages_v2' | 'synthetic_test_executable_v1';
    system_python_path: string | null;
    runtime_root: string;
}

interface RuntimeLineageModule {
    resolveHermesRuntime(locator: string, allowSynthetic?: boolean): Record<string, unknown>;
}

function syntheticRuntimeAllowed(): boolean {
    return Boolean(process.env.NODE_TEST_CONTEXT) && process.env.CSTAR_FORGE_TEST_MODE === '1';
}

export function canonicalForgeHermesLocator(lineagePath?: string): string {
    if (syntheticRuntimeAllowed() && process.env.HERMES_BIN?.trim()) {
        const override = process.env.HERMES_BIN.trim();
        if (!path.isAbsolute(override)) throw new Error('forge_hermes_test_locator_must_be_absolute');
        return override;
    }
    if (!lineagePath || !path.isAbsolute(lineagePath)) {
        throw new Error('forge_hermes_lineage_path_required');
    }
    return path.resolve(
        path.dirname(lineagePath), '..', 'runtime', 'bin', 'hermes',
    );
}

function requireDigest(value: unknown, field: string): string {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
        throw new Error(`forge_hermes_runtime_expectation_invalid:${field}`);
    }
    return value;
}

function projectExpectation(runtime: Record<string, unknown>): ForgeHermesRuntimeExpectation {
    const synthetic = syntheticRuntimeAllowed();
    const bootstrap = synthetic ? 'synthetic_test_executable_v1' : 'cstar_owned_python_system_stdlib_snapshot_v2';
    const dependency = synthetic ? 'synthetic_test_executable_v1' : 'stdlib_only_no_site_packages_v2';
    if (runtime.bootstrap_mode !== bootstrap || runtime.dependency_mode !== dependency) {
        throw new Error('forge_hermes_runtime_expectation_mode_invalid');
    }
    if (typeof runtime.locator !== 'string' || !path.isAbsolute(runtime.locator)
        || typeof runtime.runtime_root !== 'string' || !path.isAbsolute(runtime.runtime_root)
        || !Number.isInteger(runtime.source_file_count) || Number(runtime.source_file_count) < 1
        || !Number.isInteger(runtime.source_bytes) || Number(runtime.source_bytes) < 1) {
        throw new Error('forge_hermes_runtime_expectation_shape_invalid');
    }
    const pythonSha = runtime.python_sha256;
    const pythonPath = runtime.system_python_path;
    const runtimeManifestSha = runtime.runtime_manifest_sha256;
    const expectedRuntimeSchema = synthetic
        ? 'synthetic_test_executable_v1'
        : 'cstar.forge_private_runtime_manifest.v2';
    const expectedRuntimeOwner = synthetic ? 'synthetic_test' : 'cstar';
    const expectedCredentialOwner = synthetic ? 'synthetic_test' : 'hermes';
    if (runtime.runtime_schema !== expectedRuntimeSchema
        || runtime.runtime_owner !== expectedRuntimeOwner
        || runtime.credential_profile_owner !== expectedCredentialOwner
        || (synthetic ? runtimeManifestSha !== null : typeof runtimeManifestSha !== 'string')) {
        throw new Error('forge_hermes_runtime_expectation_ownership_invalid');
    }
    if (synthetic ? pythonSha !== null || pythonPath !== null
        : typeof pythonPath !== 'string' || !path.isAbsolute(pythonPath)
            || typeof pythonSha !== 'string') {
        throw new Error('forge_hermes_runtime_expectation_python_invalid');
    }
    return {
        schema: 'cstar.forge_hermes_runtime_expectation.v2',
        locator_path: runtime.locator,
        executable_sha256: requireDigest(runtime.executable_sha256, 'executable'),
        runtime_content_sha256: requireDigest(runtime.runtime_content_sha256, 'content'),
        runtime_manifest_sha256: runtimeManifestSha === null
            ? null : requireDigest(runtimeManifestSha, 'manifest'),
        runtime_schema: expectedRuntimeSchema,
        runtime_owner: expectedRuntimeOwner,
        credential_profile_owner: expectedCredentialOwner,
        python_sha256: pythonSha === null ? null : requireDigest(pythonSha, 'python'),
        source_file_count: Number(runtime.source_file_count),
        source_bytes: Number(runtime.source_bytes),
        bootstrap_mode: bootstrap,
        dependency_mode: dependency,
        system_python_path: pythonPath as string | null,
        runtime_root: runtime.runtime_root,
    };
}

export async function sealForgeHermesRuntimeExpectation(
    runtimeProof: ForgeAdapterRuntimeProof,
): Promise<ForgeHermesRuntimeExpectation> {
    const lineage = runtimeProof.dependencies.find((item) => item.role === 'hermes_runtime_lineage');
    if (!lineage) throw new Error('forge_hermes_runtime_lineage_dependency_missing');
    const source = readVerifiedRuntimeFile(lineage);
    const root = fs.mkdtempSync(path.join('/tmp', 'cstar-forge-lineage-contract-'));
    fs.chmodSync(root, 0o700);
    try {
        const modulePath = path.join(root, 'hermes_runtime_lineage.mjs');
        const fd = fs.openSync(modulePath, fs.constants.O_WRONLY | fs.constants.O_CREAT
            | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o400);
        try { fs.writeFileSync(fd, source); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        const module = await import(`${pathToFileURL(modulePath).href}?sha256=${lineage.sha256}`) as RuntimeLineageModule;
        const runtime = module.resolveHermesRuntime(
            canonicalForgeHermesLocator(lineage.path), syntheticRuntimeAllowed(),
        );
        return projectExpectation(runtime);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

export function forgeHermesRuntimeExpectationEquals(
    left: ForgeHermesRuntimeExpectation | null | undefined,
    right: ForgeHermesRuntimeExpectation | null | undefined,
): boolean {
    if (!left || !right) return left === right;
    const stable = (value: ForgeHermesRuntimeExpectation): string => JSON.stringify(
        Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
    );
    return stable(left) === stable(right);
}

export function assertForgeHermesPreflightMatchesExpectation(
    preflight: Record<string, unknown>,
    expected: ForgeHermesRuntimeExpectation,
): void {
    const comparisons: Array<[string, unknown]> = [
        ['locator_path', preflight.locator_path],
        ['executable_sha256', preflight.executable_sha256],
        ['runtime_content_sha256', preflight.runtime_content_sha256],
        ['runtime_manifest_sha256', preflight.runtime_manifest_sha256],
        ['runtime_schema', preflight.runtime_schema],
        ['runtime_owner', preflight.runtime_owner],
        ['credential_profile_owner', preflight.credential_profile_owner],
        ['python_sha256', preflight.python_sha256],
        ['source_file_count', preflight.source_file_count],
        ['source_bytes', preflight.source_bytes],
        ['bootstrap_mode', preflight.bootstrap_mode],
        ['dependency_mode', preflight.dependency_mode],
        ['system_python_path', preflight.system_python_path],
        ['runtime_root', preflight.runtime_root],
    ];
    for (const [field, actual] of comparisons) {
        if (actual !== expected[field as keyof ForgeHermesRuntimeExpectation]) {
            throw new Error(`forge_hermes_request_runtime_drift:${field}`);
        }
    }
}
