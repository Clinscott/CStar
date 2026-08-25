import fs from 'node:fs';
import path from 'node:path';

import type { ForgeExecutionArgs } from './forge_execute.js';
import {
    atomicWritePrivateFile,
} from './forge_adapter_artifacts.js';
import {
    proveForgeContainment,
    spawnContainedForgeProcess,
} from './forge_adapter_containment.js';
import {
    readVerifiedRuntimeFile,
    type ForgeAdapterRuntimeProof,
} from './forge_adapter_runtime.js';
import {
    assertForgeHermesPreflightMatchesExpectation,
    type ForgeHermesRuntimeExpectation,
} from './forge_hermes_runtime_contract.js';

const OAUTH_PROFILE = 'cstar-hub';
const OAUTH_PROVIDER = 'minimax-oauth';
const MINIMUM_OAUTH_TTL_SECONDS = 2_100;

export interface ForgeHermesPreflightProof {
    schema: 'cstar.forge_hermes_preflight.v1';
    status: 'ok';
    executable_sha256: string;
    locator_path: string;
    runtime_content_sha256: string;
    runtime_instance_sha256: string;
    python_sha256: string | null;
    source_file_count: number;
    source_bytes: number;
    bootstrap_mode: 'python_system_stdlib_snapshot_v1' | 'synthetic_test_executable_v1';
    dependency_mode: 'stdlib_only_no_site_packages_v1' | 'synthetic_test_executable_v1';
    system_python_path: string | null;
    runtime_root: string;
    version_sha256: string;
    checks: { version: 'pass'; help: 'pass'; chat_help: 'pass'; required_flags: 'pass' };
    auth_provider: 'minimax-oauth';
    auth_mode: 'oauth';
    oauth_profile: 'cstar-hub';
    oauth_status: 'ready';
    oauth_refresh_required: false;
    oauth_min_ttl_seconds: number;
    live_spend: false;
    live_spend_unknown: false;
    live_source_collection: false;
}

export function minimalForgeAdapterEnvironment(
    args: ForgeExecutionArgs,
    decisionId: string,
    executionReceiptId: string,
    selectedAdapter: Record<string, any>,
): NodeJS.ProcessEnv {
    const allowedHostKeys = [
        'HOME', 'LANG', 'LC_ALL', 'TZ',
        'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
    ] as const;
    const env: NodeJS.ProcessEnv = {};
    for (const key of allowedHostKeys) {
        if (process.env[key]) env[key] = process.env[key];
    }
    const home = env.HOME?.trim();
    if (!home || !path.isAbsolute(home)) throw new Error('forge_hermes_profile_home_invalid');
    Object.assign(env, {
        HERMES_HOME: path.join(path.resolve(home), '.hermes', 'profiles', OAUTH_PROFILE),
        CSTAR_FORGE_EXECUTE_RECEIPT_ID: executionReceiptId,
        CSTAR_FORGE_REQUEST_RECEIPT_ID: args.forge_request_receipt_id,
        CSTAR_FORGE_EXECUTE_DECISION_ID: decisionId,
        CSTAR_FORGE_EXECUTE_ADAPTER_REF: selectedAdapter.ref,
        CSTAR_FORGE_HERMES_DELEGATED: '',
        NODE_OPTIONS: '--max-old-space-size=2048 --expose-gc',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONHASHSEED: '0',
        PYTHONNOUSERSITE: '1',
        TMPDIR: process.platform === 'linux' ? '/tmp' : undefined,
        TMP: process.platform === 'linux' ? '/tmp' : undefined,
        TEMP: process.platform === 'linux' ? '/tmp' : undefined,
    });
    const allowTestOverrides = Boolean(process.env.NODE_TEST_CONTEXT)
        && process.env.CSTAR_FORGE_TEST_MODE === '1';
    if (allowTestOverrides) {
        for (const key of [
            'NODE_TEST_CONTEXT', 'CSTAR_FORGE_TEST_MODE',
            'CSTAR_FORGE_WORKER_MODEL_RESPONSE', 'CSTAR_FORGE_HERMES_DELEGATE_SCRIPT',
            'CSTAR_FORGE_TEST_SENTINEL', 'HERMES_BIN',
        ]) {
            if (process.env[key]) env[key] = process.env[key];
        }
    }
    return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined));
}

function safePreflightFailure(stdout: string): string {
    try {
        const parsed = JSON.parse(stdout) as Record<string, unknown>;
        const reason = parsed.degraded_reason;
        if (parsed.schema === 'cstar.forge_delegate_failure.v1'
            && typeof reason === 'string'
            && /^forge_[a-z0-9_]+(?:_[0-9]+)?$/.test(reason)
            && reason.length <= 120) return reason;
    } catch { /* Provider output and raw errors are never persisted. */ }
    return 'forge_hermes_preflight_failed';
}

function requireDigest(value: unknown): value is string {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function validateAndProjectForgeHermesPreflight(
    parsed: Record<string, any>,
    runtimeProof: ForgeAdapterRuntimeProof,
): ForgeHermesPreflightProof {
    const checks = parsed.checks;
    const synthetic = Boolean(process.env.NODE_TEST_CONTEXT) && process.env.CSTAR_FORGE_TEST_MODE === '1';
    if (parsed.schema !== 'cstar.forge_hermes_preflight.v1'
        || parsed.status !== 'ok'
        || !requireDigest(parsed.executable_sha256)
        || !requireDigest(parsed.version_sha256)
        || !requireDigest(parsed.runtime_content_sha256)
        || !requireDigest(parsed.runtime_instance_sha256)
        || typeof parsed.locator_path !== 'string' || !path.isAbsolute(parsed.locator_path)
        || (synthetic ? parsed.python_sha256 !== null : !requireDigest(parsed.python_sha256))
        || parsed.bootstrap_mode !== (synthetic ? 'synthetic_test_executable_v1' : 'python_system_stdlib_snapshot_v1')
        || parsed.dependency_mode !== (synthetic ? 'synthetic_test_executable_v1' : 'stdlib_only_no_site_packages_v1')
        || (synthetic ? parsed.system_python_path !== null
            : parsed.system_python_path !== runtimeProof.python_interpreter.path
                || parsed.python_sha256 !== runtimeProof.python_interpreter.sha256)
        || !Number.isInteger(parsed.source_file_count) || parsed.source_file_count < 1
        || !Number.isInteger(parsed.source_bytes) || parsed.source_bytes < 1
        || typeof parsed.runtime_root !== 'string' || !path.isAbsolute(parsed.runtime_root)
        || checks?.version !== 'pass' || checks?.help !== 'pass'
        || checks?.chat_help !== 'pass' || checks?.required_flags !== 'pass'
        || parsed.auth_provider !== OAUTH_PROVIDER || parsed.auth_mode !== 'oauth'
        || parsed.oauth_profile !== OAUTH_PROFILE || parsed.oauth_status !== 'ready'
        || parsed.oauth_refresh_required !== false
        || !Number.isInteger(parsed.oauth_min_ttl_seconds)
        || parsed.oauth_min_ttl_seconds < MINIMUM_OAUTH_TTL_SECONDS
        || parsed.oauth_min_ttl_seconds > 3_600
        || parsed.live_spend !== false || parsed.live_spend_unknown !== false
        || parsed.live_source_collection !== false) {
        throw new Error('forge_hermes_preflight_invalid');
    }
    return {
        schema: 'cstar.forge_hermes_preflight.v1', status: 'ok',
        executable_sha256: parsed.executable_sha256, version_sha256: parsed.version_sha256,
        locator_path: parsed.locator_path, runtime_content_sha256: parsed.runtime_content_sha256,
        runtime_instance_sha256: parsed.runtime_instance_sha256, python_sha256: parsed.python_sha256,
        source_file_count: parsed.source_file_count, source_bytes: parsed.source_bytes,
        bootstrap_mode: parsed.bootstrap_mode, dependency_mode: parsed.dependency_mode,
        system_python_path: parsed.system_python_path, runtime_root: parsed.runtime_root,
        checks: { version: 'pass', help: 'pass', chat_help: 'pass', required_flags: 'pass' },
        auth_provider: OAUTH_PROVIDER, auth_mode: 'oauth', oauth_profile: OAUTH_PROFILE,
        oauth_status: 'ready', oauth_refresh_required: false,
        oauth_min_ttl_seconds: parsed.oauth_min_ttl_seconds,
        live_spend: false, live_spend_unknown: false, live_source_collection: false,
    };
}

export function runForgeHermesCompatibilityPreflight(
    runtimeProof: ForgeAdapterRuntimeProof,
    nodePath: string,
    delegatePath: string,
    environment: NodeJS.ProcessEnv,
    cwd: string,
    temporaryDirectory: string,
): ForgeHermesPreflightProof {
    const writablePaths = [temporaryDirectory];
    if (path.resolve(cwd).startsWith(`${path.parse(cwd).root}tmp${path.sep}`)) writablePaths.push(cwd);
    const testHermes = process.env.NODE_TEST_CONTEXT && process.env.CSTAR_FORGE_TEST_MODE === '1'
        ? environment.HERMES_BIN
        : null;
    if (testHermes && path.isAbsolute(testHermes)) writablePaths.push(path.dirname(testHermes));
    const result = spawnContainedForgeProcess({
        runtimeProof,
        command: nodePath,
        commandArgs: [delegatePath, '--preflight'],
        cwd,
        environment,
        writablePaths,
        timeoutMs: 18_000,
        maxBuffer: 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw new Error(safePreflightFailure(result.stdout || ''));
    let parsed: Record<string, any>;
    try { parsed = JSON.parse(result.stdout || ''); }
    catch { throw new Error('forge_hermes_preflight_invalid'); }
    return validateAndProjectForgeHermesPreflight(parsed, runtimeProof);
}

export function assertForgeHermesPreflightEquivalent(
    first: ForgeHermesPreflightProof,
    second: ForgeHermesPreflightProof,
): void {
    if (JSON.stringify(first) !== JSON.stringify(second)) {
        throw new Error('forge_hermes_oauth_preflight_drift');
    }
}

export async function preflightForgeHermesOAuthBeforeReservation(
    args: ForgeExecutionArgs,
    decisionId: string,
    executionReceiptId: string,
    root: string,
    selectedAdapter: Record<string, any>,
    runtimeProof: ForgeAdapterRuntimeProof,
    expectedHermesRuntime: ForgeHermesRuntimeExpectation,
): Promise<ForgeHermesPreflightProof | null> {
    if (selectedAdapter.ref !== 'cstar-forge-hermes-minimax-worker-adapter') return null;
    const node = runtimeProof.node_interpreter;
    const delegate = runtimeProof.dependencies.find((item) => item.role === 'hermes_minimax_delegate');
    const lineage = runtimeProof.dependencies.find((item) => item.role === 'hermes_runtime_lineage');
    const rolePlan = runtimeProof.dependencies.find((item) => item.role === 'forge_role_plan');
    if (!node || !delegate || !lineage || !rolePlan) {
        throw new Error('forge_hermes_preflight_runtime_missing');
    }
    const fsp = await import('node:fs/promises');
    const temporaryDirectory = await fsp.mkdtemp('/tmp/cstar-forge-oauth-preflight-');
    await fsp.chmod(temporaryDirectory, 0o700);
    try {
        const dependencyFiles = [
            [delegate, 'hermes_minimax_delegate.mjs', 0o700],
            [lineage, 'hermes_runtime_lineage.mjs', 0o600],
            [rolePlan, 'forge_role_plan.mjs', 0o600],
        ] as const;
        for (const [proof, name, mode] of dependencyFiles) {
            atomicWritePrivateFile(
                temporaryDirectory, path.join(temporaryDirectory, name),
                readVerifiedRuntimeFile(proof), false, mode,
            );
        }
        const delegatePath = path.join(temporaryDirectory, 'hermes_minimax_delegate.mjs');
        readVerifiedRuntimeFile(node);
        readVerifiedRuntimeFile(runtimeProof.process_containment);
        proveForgeContainment(runtimeProof, root);
        const environment = minimalForgeAdapterEnvironment(
            args, decisionId, executionReceiptId, selectedAdapter,
        );
        environment.CSTAR_FORGE_HERMES_LOCATOR = expectedHermesRuntime.locator_path;
        const proof = runForgeHermesCompatibilityPreflight(
            runtimeProof, node.path, delegatePath, environment, root, temporaryDirectory,
        );
        assertForgeHermesPreflightMatchesExpectation(
            proof as unknown as Record<string, unknown>, expectedHermesRuntime,
        );
        return proof;
    } finally {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
}
