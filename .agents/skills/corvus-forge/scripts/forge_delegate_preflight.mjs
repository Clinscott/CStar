import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { assertHermesRuntimeMatches, materializeHermesRuntime,
    resolveHermesRuntime } from './hermes_runtime_lineage.mjs';
import { fixedOAuthHorizon, horizonEnvironment,
    identityFromEnvironment } from './forge_delegate_evidence.mjs';

const EXPECTED_PROFILE = 'cstar-hub';
const EXPECTED_PROVIDER = 'minimax-oauth';
const EXPECTED_AUTH_MODE = 'oauth';
const SAFE_MODE_CREDENTIAL_NAMES = JSON.stringify([]);
const OAUTH_STATUS_SCHEMA = 'hermes.forge_minimax_oauth_status.v2';
const PREFLIGHT_SCHEMA = 'cstar.forge_hermes_preflight.v2';
const CHAT_FLAGS = ['--forge-query-stdin', '--quiet', '--toolsets', '--safe-mode',
    '--max-turns', '--source', '--provider', '--model'];

function sha256(value) { return createHash('sha256').update(value, 'utf-8').digest('hex'); }
function makePrivateDirectory(root, name) {
    const directory = path.join(root, name); fs.mkdirSync(directory, { mode: 0o700 }); return directory;
}
function profileHermesHome() {
    const home = process.env.HOME?.trim();
    if (!home || !path.isAbsolute(home)) throw new Error('forge_hermes_oauth_profile_home_invalid');
    return path.join(path.resolve(home), '.hermes', 'profiles', EXPECTED_PROFILE);
}
function baseEnvironment() {
    const allowed = ['HOME', 'LANG', 'LC_ALL', 'TZ'];
    const environment = Object.fromEntries(
        allowed.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
    Object.assign(environment, {
        HERMES_HOME: profileHermesHome(), CSTAR_FORGE_HERMES_DELEGATED: '1',
        HERMES_SAFE_MODE: '1', HERMES_FORGE_EPHEMERAL: '1',
        HERMES_SAFE_MODE_PROVIDER: EXPECTED_PROVIDER,
        HERMES_SAFE_MODE_CREDENTIAL_NAMES: SAFE_MODE_CREDENTIAL_NAMES,
        HERMES_IGNORE_USER_CONFIG: '1', HERMES_IGNORE_RULES: '1',
        HERMES_INTERACTIVE: '0', NO_COLOR: '1', PYTHONNOUSERSITE: '1',
        PYTHONDONTWRITEBYTECODE: '1',
    });
    if (process.platform === 'linux') Object.assign(environment,
        { TMPDIR: '/tmp', TMP: '/tmp', TEMP: '/tmp' });
    return environment;
}
function sterileEnvironment(root) {
    const home = makePrivateDirectory(root, 'home'); const tmp = makePrivateDirectory(root, 'tmp');
    const environment = {
        HOME: home, HERMES_HOME: makePrivateDirectory(root, 'hermes'),
        CSTAR_FORGE_HERMES_DELEGATED: '1', HERMES_SAFE_MODE: '1',
        HERMES_FORGE_EPHEMERAL: '1', HERMES_FORGE_PREFLIGHT: '1',
        HERMES_SAFE_MODE_PROVIDER: EXPECTED_PROVIDER,
        HERMES_SAFE_MODE_CREDENTIAL_NAMES: SAFE_MODE_CREDENTIAL_NAMES,
        HERMES_IGNORE_USER_CONFIG: '1', HERMES_IGNORE_RULES: '1',
        XDG_CACHE_HOME: makePrivateDirectory(root, 'cache'),
        XDG_CONFIG_HOME: makePrivateDirectory(root, 'config'),
        XDG_DATA_HOME: makePrivateDirectory(root, 'data'),
        TMPDIR: tmp, TMP: tmp, TEMP: tmp, NO_COLOR: '1',
        PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1',
    };
    for (const key of ['LANG', 'LC_ALL', 'TZ']) if (process.env[key]) environment[key] = process.env[key];
    return environment;
}
function oauthEnvironment(root) {
    return { ...baseEnvironment(), HERMES_FORGE_PREFLIGHT: '1',
        HERMES_FORGE_OAUTH_STATUS_ONLY: '1',
        XDG_CACHE_HOME: makePrivateDirectory(root, 'oauth-cache'),
        XDG_CONFIG_HOME: makePrivateDirectory(root, 'oauth-config'),
        XDG_DATA_HOME: makePrivateDirectory(root, 'oauth-data') };
}

export function spawnContained(command, args, options) {
    const processGroupSupported = process.platform !== 'win32';
    const result = spawnSync(command, args, {
        ...options, detached: processGroupSupported, killSignal: 'SIGKILL',
    });
    if (processGroupSupported && Number.isInteger(result.pid)) {
        try { process.kill(-result.pid, 'SIGKILL'); }
        catch (error) {
            if (error?.code !== 'ESRCH') throw new Error('forge_hermes_process_group_cleanup_failed');
        }
    }
    return result;
}
function runHelp(runtime, args, environment, cwd, failureReason) {
    const result = spawnContained(runtime.command, [...runtime.prefixArgs, ...args], {
        cwd, env: environment, encoding: 'utf-8', timeout: 5000,
        maxBuffer: 1024 * 1024, input: '',
    });
    if (result.error || result.status !== 0) throw new Error(failureReason);
    return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}
function runOAuth(runtime, environment, cwd, horizon, allowSynthetic) {
    const result = spawnContained(runtime.command, [...runtime.prefixArgs, '--oauth-status'], {
        cwd, env: environment, encoding: 'utf-8', timeout: 5000,
        maxBuffer: 64 * 1024, input: '',
    });
    if (result.error || result.status !== 0 || String(result.stderr ?? '').trim()) {
        throw new Error('forge_hermes_oauth_status_failed');
    }
    let packet;
    try { packet = JSON.parse(String(result.stdout ?? '')); }
    catch { throw new Error('forge_hermes_oauth_status_invalid'); }
    if (allowSynthetic && packet?.schema === 'hermes.forge_minimax_oauth_status.v1') {
        const legacyKeys = ['auth_mode', 'min_ttl_seconds', 'profile', 'provider',
            'refresh_required', 'schema', 'status'].sort().join(',');
        if (Object.keys(packet).sort().join(',') !== legacyKeys || packet.min_ttl_seconds !== 2100) {
            throw new Error('forge_hermes_oauth_status_invalid');
        }
        packet = { schema: OAUTH_STATUS_SCHEMA, status: packet.status, provider: packet.provider,
            auth_mode: packet.auth_mode, profile: packet.profile, refresh_required: packet.refresh_required,
            horizon_seconds: 2100, horizon_started_unix_ms: horizon.horizon_started_unix_ms,
            required_until_unix_ms: horizon.required_until_unix_ms,
            horizon_binding_sha256: horizon.horizon_binding_sha256 };
    }
    const keys = ['auth_mode', 'horizon_binding_sha256', 'horizon_seconds',
        'horizon_started_unix_ms', 'profile', 'provider', 'refresh_required',
        'required_until_unix_ms', 'schema', 'status'].sort().join(',');
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)
        || Object.keys(packet).sort().join(',') !== keys
        || packet.schema !== OAUTH_STATUS_SCHEMA || packet.status !== 'ready'
        || packet.provider !== EXPECTED_PROVIDER || packet.auth_mode !== EXPECTED_AUTH_MODE
        || packet.profile !== EXPECTED_PROFILE || packet.refresh_required !== false
        || packet.horizon_seconds !== 2100
        || packet.horizon_started_unix_ms !== horizon.horizon_started_unix_ms
        || packet.required_until_unix_ms !== horizon.required_until_unix_ms
        || packet.horizon_binding_sha256 !== horizon.horizon_binding_sha256) {
        throw new Error('forge_hermes_oauth_status_invalid');
    }
    return packet;
}

export function runHermesPreflight(hermes, allowSynthetic) {
    const resolved = resolveHermesRuntime(hermes, allowSynthetic);
    let identity;
    try { identity = identityFromEnvironment(); }
    catch (error) {
        if (!allowSynthetic) throw error;
        identity = { forge_request_receipt_id: 'synthetic-preflight',
            forge_execute_receipt_id: 'synthetic-preflight', decision_id: 'synthetic-preflight',
            adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter' };
    }
    const horizonInput = { ...process.env };
    if (allowSynthetic && !horizonInput.CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS) {
        const started = Date.now();
        horizonInput.CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS = String(started);
        horizonInput.CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS = String(started + 2_100_000);
    }
    const horizon = fixedOAuthHorizon(identity, resolved.runtime_content_sha256, horizonInput);
    const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
    const root = fs.mkdtempSync(path.join(secureTmp, 'cstar-forge-hermes-preflight-'));
    fs.chmodSync(root, 0o700);
    try {
        const runtime = materializeHermesRuntime(resolved, root);
        const environment = sterileEnvironment(root);
        const version = runHelp(runtime, ['--version'], environment, root,
            'forge_hermes_preflight_version_failed');
        runHelp(runtime, ['--help'], environment, root, 'forge_hermes_preflight_help_failed');
        const chatHelp = runHelp(runtime, ['chat', '--help'], environment, root,
            'forge_hermes_preflight_chat_help_failed');
        const missing = CHAT_FLAGS.find((flag) => !chatHelp.includes(flag));
        if (missing) throw new Error(`forge_hermes_preflight_missing_${missing.replace(/^-+/, '').replace(/-/g, '_')}`);
        const oauthEnv = oauthEnvironment(root);
        Object.assign(oauthEnv, horizonEnvironment(horizon), {
            CSTAR_FORGE_RUNTIME_CONTENT_SHA256: resolved.runtime_content_sha256,
            CSTAR_FORGE_REQUEST_RECEIPT_ID: identity.forge_request_receipt_id,
            CSTAR_FORGE_EXECUTE_RECEIPT_ID: identity.forge_execute_receipt_id,
            CSTAR_FORGE_EXECUTE_DECISION_ID: identity.decision_id,
            CSTAR_FORGE_EXECUTE_ADAPTER_REF: identity.adapter_ref,
        });
        const oauth = runOAuth(runtime, oauthEnv, root, horizon, allowSynthetic);
        return {
            schema: PREFLIGHT_SCHEMA, status: 'ok', locator_path: resolved.locator,
            ...Object.fromEntries(['executable_sha256', 'runtime_content_sha256',
                'runtime_instance_sha256', 'runtime_manifest_sha256', 'runtime_schema',
                'runtime_owner', 'credential_profile_owner', 'python_sha256', 'source_file_count',
                'source_bytes', 'bootstrap_mode', 'runtime_root', 'dependency_mode',
                'system_python_path'].map((key) => [key, resolved[key]])),
            version_sha256: sha256(version),
            checks: { version: 'pass', help: 'pass', chat_help: 'pass', required_flags: 'pass' },
            auth_provider: oauth.provider, auth_mode: oauth.auth_mode, oauth_profile: oauth.profile,
            oauth_status: oauth.status, oauth_refresh_required: oauth.refresh_required,
            oauth_horizon_seconds: oauth.horizon_seconds,
            oauth_horizon_started_unix_ms: oauth.horizon_started_unix_ms,
            oauth_required_until_unix_ms: oauth.required_until_unix_ms,
            oauth_horizon_binding_sha256: oauth.horizon_binding_sha256,
            live_spend: false, live_spend_unknown: false, live_source_collection: false,
        };
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

export function assertBoundPreflight(proof, hermes, allowSynthetic) {
    const runtime = resolveHermesRuntime(hermes, allowSynthetic);
    if (!proof || proof.schema !== PREFLIGHT_SCHEMA || proof.status !== 'ok'
        || proof.locator_path !== runtime.locator || proof.executable_sha256 !== runtime.executable_sha256
        || !/^[a-f0-9]{64}$/.test(proof.version_sha256 ?? '')
        || proof.checks?.version !== 'pass' || proof.checks?.help !== 'pass'
        || proof.checks?.chat_help !== 'pass' || proof.checks?.required_flags !== 'pass'
        || proof.auth_provider !== EXPECTED_PROVIDER || proof.auth_mode !== EXPECTED_AUTH_MODE
        || proof.oauth_profile !== EXPECTED_PROFILE || proof.oauth_status !== 'ready'
        || proof.oauth_refresh_required !== false || proof.oauth_horizon_seconds !== 2100
        || !Number.isInteger(proof.oauth_horizon_started_unix_ms)
        || !Number.isInteger(proof.oauth_required_until_unix_ms)
        || !/^[a-f0-9]{64}$/.test(proof.oauth_horizon_binding_sha256 ?? '')
        || proof.live_spend !== false || proof.live_spend_unknown !== false
        || proof.live_source_collection !== false) {
        throw new Error('forge_hermes_preflight_binding_invalid');
    }
    assertHermesRuntimeMatches(proof, runtime);
    const horizon = fixedOAuthHorizon(identityFromEnvironment(), runtime.runtime_content_sha256, {
        CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS: String(proof.oauth_horizon_started_unix_ms),
        CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS: String(proof.oauth_required_until_unix_ms),
    });
    if (horizon.horizon_binding_sha256 !== proof.oauth_horizon_binding_sha256) {
        throw new Error('forge_hermes_preflight_binding_invalid');
    }
    return { runtime, horizon };
}
