#!/usr/bin/env node
/** Forge-private Hermes worker: sealed source in, validated JSON out.
 * Hermes owns OAuth resolution; CStar receives only redacted readiness. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertHermesRuntimeMatches, materializeHermesRuntime, resolveHermesRuntime } from './hermes_runtime_lineage.mjs';
import { buildRolePrompt, extractFinalQaManifest, getForgeRolePlan, parseRoleHandoff } from './forge_role_plan.mjs';
const EXPECTED_PROFILE = 'cstar-hub';
const EXPECTED_PROVIDER = 'minimax-oauth';
const EXPECTED_AUTH_MODE = 'oauth';
const EXPECTED_MODEL = 'MiniMax-M3';
const SAFE_MODE_CREDENTIAL_NAMES = JSON.stringify([]);
const OAUTH_STATUS_SCHEMA = 'hermes.forge_minimax_oauth_status.v1'; const OAUTH_MIN_TTL_SECONDS = 2100;
const NO_TOOLS_TOOLSET = 'context_engine';
const FAILURE_SCHEMA = 'cstar.forge_delegate_failure.v1';
const PREFLIGHT_SCHEMA = 'cstar.forge_hermes_preflight.v1';
// --profile is consumed by Hermes' pre-parser and intentionally omitted from help.
const CHAT_FLAGS = ['--forge-query-stdin', '--quiet', '--toolsets', '--safe-mode', '--max-turns',
    '--source', '--provider', '--model'];
const FILE_BYTE_CAP = 64 * 1024;
const TOTAL_BYTE_CAP = 512 * 1024;
const PROMPT_BYTE_CAP = 1024 * 1024;
const HERMES_OVERRIDE = process.env.HERMES_BIN?.trim();
const REQUEST_BOUND_HERMES = process.env.CSTAR_FORGE_HERMES_LOCATOR?.trim();
let hermesInvocationMayHaveSpent = false;
let providerRequestsStarted = 0;
let providerRequestsCompleted = 0;
let activeRolePlan = null; let roleReceipts = [];
let aggregateInputTokens = 0; let aggregateOutputTokens = 0;
function stableFailureReason(error) {
    const reason = error instanceof Error ? error.message : String(error);
    return /^forge_[a-z0-9_]+(?:_[0-9]+)?$/.test(reason) && reason.length <= 120
        ? reason : 'forge_hermes_delegate_failed';
}
function fail(reason) {
    process.stdout.write(`${JSON.stringify({
        schema: FAILURE_SCHEMA, status: 'degraded', degraded_reason: reason,
        provider: EXPECTED_PROVIDER, auth_provider: EXPECTED_PROVIDER,
        auth_mode: EXPECTED_AUTH_MODE, requested_model: EXPECTED_MODEL, actual_model: null,
        model_source: 'unreported', model: EXPECTED_MODEL, hermes_profile: EXPECTED_PROFILE,
        live_spend: providerRequestsCompleted > 0 ? true : hermesInvocationMayHaveSpent ? null : false,
        live_spend_unknown: providerRequestsStarted > providerRequestsCompleted,
        provider_requests_started: providerRequestsStarted,
        provider_requests_completed: providerRequestsCompleted,
        forge_topology: activeRolePlan?.plan_id ?? null,
        role_plan_sha256: activeRolePlan?.plan_sha256 ?? null,
        role_receipts: roleReceipts, input_tokens: aggregateInputTokens,
        output_tokens: aggregateOutputTokens,
        live_source_collection: false,
    })}\n`);
    process.exitCode = 1;
}
function isInside(candidate, root) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function safeExecutable(candidate) {
    try {
        const lexical = fs.lstatSync(candidate);
        if (lexical.isSymbolicLink() || !lexical.isFile() || lexical.nlink !== 1) return null;
        const canonical = fs.realpathSync(candidate);
        const stat = fs.statSync(canonical);
        if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0) return null;
        fs.accessSync(canonical, fs.constants.X_OK);
        return canonical;
    } catch {
        return null;
    }
}
function assertNoSymlinkSegments(root, candidate) {
    const relative = path.relative(root, candidate);
    if (!isInside(candidate, root)) throw new Error('forge_hermes_target_outside_project');
    let current = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        try {
            if (fs.lstatSync(current).isSymbolicLink()) throw new Error('forge_hermes_target_symlink_forbidden');
        } catch (error) {
            if (error?.code === 'ENOENT') continue;
            throw error;
        }
    }
}
function readSafeTarget(candidate, byteCap) {
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const fd = fs.openSync(candidate, flags);
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile()) throw new Error('forge_hermes_target_must_be_file');
        if (stat.nlink !== 1) throw new Error('forge_hermes_target_hardlink_forbidden');
        if (stat.size > byteCap) throw new Error('forge_hermes_target_material_too_large');
        return { data: fs.readFileSync(fd), size: stat.size };
    } finally { fs.closeSync(fd); }
}
function decodeUtf8(data) { try { return new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { throw new Error('forge_hermes_target_not_utf8'); } }
function resolveHermes() {
    if (HERMES_OVERRIDE && !syntheticRuntimeAllowed()) {
        throw new Error('forge_hermes_ambient_override_forbidden');
    }
    if (!HERMES_OVERRIDE && (!REQUEST_BOUND_HERMES || !path.isAbsolute(REQUEST_BOUND_HERMES))) {
        throw new Error('forge_hermes_request_bound_locator_required');
    }
    for (const candidate of HERMES_OVERRIDE ? [HERMES_OVERRIDE] : [REQUEST_BOUND_HERMES]) {
        const executable = safeExecutable(candidate);
        if (executable) return executable;
    }
    throw new Error('forge_hermes_executable_not_found_or_unsafe');
}
function profileHermesHome() {
    const home = process.env.HOME?.trim();
    if (!home || !path.isAbsolute(home)) throw new Error('forge_hermes_oauth_profile_home_invalid');
    return path.join(path.resolve(home), '.hermes', 'profiles', EXPECTED_PROFILE); }
function parseArgs(argv) {
    if (argv.length === 1 && argv[0] === '--preflight') return { mode: 'preflight' };
    if (argv.includes('--preflight')) throw new Error('forge_hermes_preflight_arguments_invalid');
    const index = argv.indexOf('--intent-file');
    if (index < 0 || !argv[index + 1]) throw new Error('forge_hermes_intent_file_required');
    return { mode: 'execute', intentPath: argv[index + 1] };
}
function assertPrivateResponsePath(intentPath, responsePath) {
    const privateRoot = fs.realpathSync(path.dirname(intentPath));
    const resolved = path.resolve(responsePath);
    if (!isInside(resolved, privateRoot) || path.dirname(resolved) !== privateRoot) {
        throw new Error('forge_hermes_response_path_outside_private_runtime');
    }
    const directoryStat = fs.lstatSync(privateRoot);
    if (directoryStat.isSymbolicLink()
        || !directoryStat.isDirectory()
        || directoryStat.uid !== process.getuid?.()
        || (directoryStat.mode & 0o022) !== 0) {
        throw new Error('forge_hermes_response_directory_unsafe');
    }
    if (fs.lstatSync(resolved, { throwIfNoEntry: false })) {
        throw new Error('forge_hermes_response_path_already_exists');
    }
    return resolved;
}
function readIntent(intentPath) {
    const data = JSON.parse(fs.readFileSync(intentPath, 'utf-8'));
    if (!data || typeof data !== 'object' || typeof data.intent !== 'string' || !data.intent.trim()) {
        throw new Error('forge_hermes_intent_invalid');
    }
    if (typeof data.project_root !== 'string' || !path.isAbsolute(data.project_root)) throw new Error('forge_hermes_project_root_invalid');
    const payload = data.payload ?? {};
    if (payload.hermes_profile !== EXPECTED_PROFILE || payload.model !== EXPECTED_MODEL) throw new Error('forge_hermes_profile_or_model_mismatch');
    if (payload.expected_output !== 'json') throw new Error('forge_hermes_json_output_required');
    if (typeof payload.write_to !== 'string' || !path.isAbsolute(payload.write_to)) throw new Error('forge_hermes_response_path_invalid');
    payload.write_to = assertPrivateResponsePath(intentPath, payload.write_to);
    if (!Array.isArray(data.target_paths) || data.target_paths.length === 0) throw new Error('forge_hermes_nonempty_targets_required');
    const identity = data.execution_identity;
    const identityFields = { forge_request_receipt_id: 'CSTAR_FORGE_REQUEST_RECEIPT_ID',
        forge_execute_receipt_id: 'CSTAR_FORGE_EXECUTE_RECEIPT_ID',
        decision_id: 'CSTAR_FORGE_EXECUTE_DECISION_ID', adapter_ref: 'CSTAR_FORGE_EXECUTE_ADAPTER_REF' };
    if (!identity || typeof identity !== 'object' || Array.isArray(identity)
        || Object.keys(identity).sort().join(',') !== Object.keys(identityFields).sort().join(',')) {
        throw new Error('forge_hermes_execution_identity_invalid');
    }
    for (const [field, envName] of Object.entries(identityFields)) {
        const value = identity[field];
        if (typeof value !== 'string' || !/^[A-Za-z0-9._:/-]{1,200}$/.test(value)
            || process.env[envName] !== value) {
            throw new Error('forge_hermes_execution_identity_invalid');
        }
    }
    return data;
}
function minimalHermesEnvironment() {
    const allowed = ['HOME', 'LANG', 'LC_ALL', 'TZ'];
    const env = Object.fromEntries(
        allowed.filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
    );
    Object.assign(env, { HERMES_HOME: profileHermesHome(),
        CSTAR_FORGE_HERMES_DELEGATED: '1', HERMES_SAFE_MODE: '1',
        HERMES_FORGE_EPHEMERAL: '1',
        HERMES_SAFE_MODE_PROVIDER: EXPECTED_PROVIDER, HERMES_SAFE_MODE_CREDENTIAL_NAMES: SAFE_MODE_CREDENTIAL_NAMES,
        HERMES_IGNORE_USER_CONFIG: '1', HERMES_IGNORE_RULES: '1', HERMES_INTERACTIVE: '0',
        NO_COLOR: '1', PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1' });
    for (const key of [
        'CSTAR_FORGE_REQUEST_RECEIPT_ID', 'CSTAR_FORGE_EXECUTE_RECEIPT_ID',
        'CSTAR_FORGE_EXECUTE_DECISION_ID', 'CSTAR_FORGE_EXECUTE_ADAPTER_REF',
    ]) if (process.env[key]) env[key] = process.env[key];
    if (process.platform === 'linux') Object.assign(env, { TMPDIR: '/tmp', TMP: '/tmp', TEMP: '/tmp' });
    return env;
}
function makePrivateDirectory(root, name) {
    const directory = path.join(root, name); fs.mkdirSync(directory, { mode: 0o700 }); return directory;
}
function sterilePreflightEnvironment(root) {
    const home = makePrivateDirectory(root, 'home');
    const tmp = makePrivateDirectory(root, 'tmp');
    const env = {
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
    for (const key of ['LANG', 'LC_ALL', 'TZ']) if (process.env[key]) env[key] = process.env[key];
    return env;
}
function oauthPreflightEnvironment(root) {
    const env = minimalHermesEnvironment();
    Object.assign(env, { HERMES_FORGE_PREFLIGHT: '1', HERMES_FORGE_OAUTH_STATUS_ONLY: '1',
        XDG_CACHE_HOME: makePrivateDirectory(root, 'oauth-cache'),
        XDG_CONFIG_HOME: makePrivateDirectory(root, 'oauth-config'),
        XDG_DATA_HOME: makePrivateDirectory(root, 'oauth-data') }); return env; }
function spawnContained(command, args, options) {
    const { markLiveSpend = false, ...spawnOptions } = options;
    const processGroupSupported = process.platform !== 'win32';
    const result = spawnSync(command, args, { ...spawnOptions, detached: processGroupSupported, killSignal: 'SIGKILL' });
    if (markLiveSpend && Number.isInteger(result.pid)) hermesInvocationMayHaveSpent = true;
    if (processGroupSupported && Number.isInteger(result.pid)) {
        try {
            process.kill(-result.pid, 'SIGKILL');
        } catch (error) {
            if (error?.code !== 'ESRCH') throw new Error('forge_hermes_process_group_cleanup_failed');
        }
    }
    return result;
}
function runHelpProbe(runtime, args, env, cwd, failureReason) {
    const result = spawnContained(runtime.command, [...runtime.prefixArgs, ...args], {
        cwd, env, encoding: 'utf-8', timeout: 5000,
        maxBuffer: 1024 * 1024, input: '',
    });
    if (result.error || result.status !== 0) throw new Error(failureReason);
    return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}
function assertHelpFlags(output, required) {
    const missing = required.find((flag) => !output.includes(flag));
    if (missing) throw new Error(`forge_hermes_preflight_missing_${missing.replace(/^-+/, '').replace(/-/g, '_')}`);
}
function runOAuthStatusProbe(runtime, env, cwd) {
    const result = spawnContained(runtime.command, [...runtime.prefixArgs, '--oauth-status'], {
        cwd, env, encoding: 'utf-8', timeout: 5000, maxBuffer: 64 * 1024, input: '' });
    if (result.error || result.status !== 0 || String(result.stderr ?? '').trim()) throw new Error('forge_hermes_oauth_status_failed');
    let packet;
    try { packet = JSON.parse(String(result.stdout ?? '')); }
    catch { throw new Error('forge_hermes_oauth_status_invalid'); }
    const exactKeys = ['auth_mode', 'min_ttl_seconds', 'profile', 'provider', 'refresh_required', 'schema', 'status'].sort().join(',');
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)
        || Object.keys(packet).sort().join(',') !== exactKeys
        || packet.schema !== OAUTH_STATUS_SCHEMA || packet.status !== 'ready'
        || packet.provider !== EXPECTED_PROVIDER || packet.auth_mode !== EXPECTED_AUTH_MODE
        || packet.profile !== EXPECTED_PROFILE || packet.refresh_required !== false
        || !Number.isInteger(packet.min_ttl_seconds) || packet.min_ttl_seconds < OAUTH_MIN_TTL_SECONDS) {
        throw new Error('forge_hermes_oauth_status_invalid');
    }
    return packet; }
function runHermesPreflight(hermes = resolveHermes()) {
    const resolved = resolveHermesRuntime(hermes, syntheticRuntimeAllowed());
    const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();
    const root = fs.mkdtempSync(path.join(secureTmp, 'cstar-forge-hermes-preflight-'));
    fs.chmodSync(root, 0o700);
    try {
        const runtime = materializeHermesRuntime(resolved, root);
        const env = sterilePreflightEnvironment(root);
        const version = runHelpProbe(runtime, ['--version'], env, root, 'forge_hermes_preflight_version_failed');
        const topHelp = runHelpProbe(runtime, ['--help'], env, root, 'forge_hermes_preflight_help_failed');
        const chatHelp = runHelpProbe(runtime, ['chat', '--help'], env, root, 'forge_hermes_preflight_chat_help_failed');
        assertHelpFlags(chatHelp, CHAT_FLAGS);
        const oauth = runOAuthStatusProbe(runtime, oauthPreflightEnvironment(root), root);
        return {
            schema: PREFLIGHT_SCHEMA, status: 'ok',
            locator_path: resolved.locator,
            ...Object.fromEntries(['executable_sha256', 'runtime_content_sha256', 'runtime_instance_sha256',
                'python_sha256', 'source_file_count', 'source_bytes', 'bootstrap_mode', 'runtime_root',
                'dependency_mode', 'system_python_path'].map((key) => [key, resolved[key]])),
            version_sha256: sha256(version),
            checks: { version: 'pass', help: 'pass', chat_help: 'pass', required_flags: 'pass' },
            auth_provider: oauth.provider, auth_mode: oauth.auth_mode, oauth_profile: oauth.profile,
            oauth_status: oauth.status, oauth_refresh_required: oauth.refresh_required, oauth_min_ttl_seconds: oauth.min_ttl_seconds,
            live_spend: false, live_spend_unknown: false, live_source_collection: false,
        };
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function assertBoundPreflight(proof, hermes) {
    const runtime = resolveHermesRuntime(hermes, syntheticRuntimeAllowed());
    if (!proof || proof.schema !== PREFLIGHT_SCHEMA || proof.status !== 'ok'
        || proof.locator_path !== runtime.locator
        || proof.executable_sha256 !== runtime.executable_sha256
        || !/^[a-f0-9]{64}$/.test(proof.version_sha256 ?? '')
        || proof.checks?.version !== 'pass' || proof.checks?.help !== 'pass'
        || proof.checks?.chat_help !== 'pass' || proof.checks?.required_flags !== 'pass'
        || proof.auth_provider !== EXPECTED_PROVIDER || proof.auth_mode !== EXPECTED_AUTH_MODE
        || proof.oauth_profile !== EXPECTED_PROFILE || proof.oauth_status !== 'ready'
        || proof.oauth_refresh_required !== false
        || !Number.isInteger(proof.oauth_min_ttl_seconds)
        || proof.oauth_min_ttl_seconds < OAUTH_MIN_TTL_SECONDS
        || proof.live_spend !== false || proof.live_spend_unknown !== false
        || proof.live_source_collection !== false) {
        throw new Error('forge_hermes_preflight_binding_invalid');
    }
    assertHermesRuntimeMatches(proof, runtime);
    return runtime;
}
function assertProviderEnvelope(raw, intent, runtime, role, phase, inputHandoffSha256, specificationSha256, plan) {
    let packet;
    try { packet = JSON.parse(raw); } catch { throw new Error('forge_hermes_provider_envelope_invalid'); }
    const identity = intent.execution_identity;
    if (!packet || packet.schema !== 'hermes.cstar_forge_provider_response.v1'
        || !packet.execution_identity || Object.keys(packet.execution_identity).sort().join(',') !== Object.keys(identity).sort().join(',')
        || Object.entries(identity).some(([key, value]) => packet.execution_identity[key] !== value)
        || packet.runtime_content_sha256 !== runtime.runtime_content_sha256
        || packet.forge_role !== role || packet.forge_phase !== phase
        || packet.role_plan_id !== plan.plan_id || packet.role_plan_sha256 !== plan.plan_sha256
        || packet.input_handoff_sha256 !== inputHandoffSha256
        || packet.specification_handoff_sha256 !== specificationSha256
        || packet.auth_provider !== EXPECTED_PROVIDER || packet.auth_mode !== EXPECTED_AUTH_MODE
        || packet.provider_model !== EXPECTED_MODEL || typeof packet.text !== 'string'
        || !packet.text.trim() || Buffer.byteLength(packet.text, 'utf-8') > 8 * 1024 * 1024
        || !Number.isInteger(packet.usage?.input_tokens) || packet.usage.input_tokens < 0
        || !Number.isInteger(packet.usage?.output_tokens) || packet.usage.output_tokens < 0) {
        throw new Error('forge_hermes_provider_envelope_invalid');
    }
    return packet;
}
function providerPacketFrom(raw, intent, runtime, role, phase, inputHandoffSha256, specificationSha256, plan) {
    if (!syntheticRuntimeAllowed()) {
        return assertProviderEnvelope(raw, intent, runtime, role, phase, inputHandoffSha256, specificationSha256, plan);
    }
    let candidate;
    try { candidate = JSON.parse(raw); } catch { /* Legacy fixture. */ }
    if (candidate?.schema === 'hermes.cstar_forge_provider_response.v1') {
        return assertProviderEnvelope(raw, intent, runtime, role, phase, inputHandoffSha256, specificationSha256, plan);
    }
    return { text: raw, provider_model: null, usage: { input_tokens: 0, output_tokens: 0 } };
}
function materializeTargets(intent) {
    const projectRoot = fs.realpathSync(intent.project_root);
    const materials = [];
    let totalBytes = 0;
    for (const rawTarget of intent.target_paths) {
        const candidate = path.isAbsolute(rawTarget)
            ? path.resolve(rawTarget)
            : path.resolve(projectRoot, rawTarget);
        if (!isInside(candidate, projectRoot)) throw new Error('forge_hermes_target_outside_project');
        assertNoSymlinkSegments(projectRoot, candidate);
        if (!fs.existsSync(candidate)) {
            let ancestor = path.dirname(candidate);
            while (!fs.existsSync(ancestor)) {
                const parent = path.dirname(ancestor);
                if (parent === ancestor) throw new Error('forge_hermes_target_parent_missing');
                ancestor = parent;
            }
            const canonicalAncestor = fs.realpathSync(ancestor);
            if (!isInside(canonicalAncestor, projectRoot)) throw new Error('forge_hermes_target_parent_escape');
            materials.push({
                path: path.relative(projectRoot, candidate).split(path.sep).join('/'),
                bytes: 0, content: '[AUTHORIZED NEW FILE: currently absent]',
            });
            continue;
        }
        const canonical = fs.realpathSync(candidate);
        if (!isInside(canonical, projectRoot)) throw new Error('forge_hermes_target_symlink_escape');
        const remaining = TOTAL_BYTE_CAP - totalBytes;
        if (remaining <= 0) throw new Error('forge_hermes_target_material_too_large');
        const safe = readSafeTarget(canonical, Math.min(FILE_BYTE_CAP, remaining));
        const data = safe.data;
        totalBytes += data.byteLength;
        materials.push({
            path: path.relative(projectRoot, canonical).split(path.sep).join('/'),
            bytes: data.byteLength, content: decodeUtf8(data),
        });
    }
    return materials;
}
function extractJsonObject(raw) {
    try {
        const parsed = JSON.parse(raw.trim());
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* Strict synthetic compatibility only. */ }
    throw new Error('forge_hermes_response_json_invalid');
}
function sha256(value) { return createHash('sha256').update(value, 'utf-8').digest('hex'); }
function syntheticRuntimeAllowed() { return process.env.NODE_TEST_CONTEXT !== undefined && process.env.CSTAR_FORGE_TEST_MODE === '1'; }
try {
    if (process.env.CSTAR_FORGE_HERMES_DELEGATED) throw new Error('forge_hermes_nested_delegation_forbidden');
    const invocation = parseArgs(process.argv.slice(2));
    if (invocation.mode === 'preflight') {
        process.stdout.write(`${JSON.stringify(runHermesPreflight())}\n`);
    } else {
        const intent = readIntent(invocation.intentPath);
        const materials = materializeTargets(intent);
        const plan = getForgeRolePlan();
        activeRolePlan = plan;
        const hermes = resolveHermes();
        let resolved;
        if (intent.hermes_preflight) resolved = assertBoundPreflight(intent.hermes_preflight, hermes);
        else if (syntheticRuntimeAllowed()) resolved = resolveHermesRuntime(hermes, true);
        else throw new Error('forge_hermes_bound_preflight_required');
        const runtimeRoot = fs.mkdtempSync(path.join('/tmp', 'cstar-forge-hermes-runtime-'));
        fs.chmodSync(runtimeRoot, 0o700);
        const totalTimeoutSeconds = Math.max(360, Math.min(1800, Number(intent.payload.timeout_seconds ?? 1800)));
        const roleTimeoutSeconds = Math.max(60, Math.floor((totalTimeoutSeconds - 30) / plan.roles.length));
        const startedAt = Date.now();
        let runtime; let previousHandoff = null; let specificationHandoff = null; let response = null;
        let totalPromptChars = 0;
        let actualModel = null; let legacySyntheticResponse = false;
        try {
            runtime = materializeHermesRuntime(resolved, runtimeRoot);
            for (let index = 0; index < plan.roles.length; index += 1) {
                const role = plan.roles[index];
                const phase = `${index + 1}/${plan.roles.length}`;
                const inputHandoffSha256 = previousHandoff?.handoff_sha256 ?? '0'.repeat(64);
                const specificationSha256 = specificationHandoff?.handoff_sha256 ?? '0'.repeat(64);
                const prompt = buildRolePrompt({ role, mission: intent.intent, materials, previousHandoff,
                    specificationHandoff: index > 1 ? specificationHandoff : null });
                const promptBytes = Buffer.from(prompt, 'utf-8');
                if (promptBytes.byteLength > PROMPT_BYTE_CAP) throw new Error('forge_hermes_prompt_too_large');
                const env = minimalHermesEnvironment();
                env.HERMES_FORGE_QUERY_BYTES = String(promptBytes.byteLength);
                env.HERMES_FORGE_QUERY_SHA256 = sha256(prompt);
                env.CSTAR_FORGE_RUNTIME_CONTENT_SHA256 = resolved.runtime_content_sha256;
                Object.assign(env, { CSTAR_FORGE_ROLE: role, CSTAR_FORGE_PHASE: phase,
                    CSTAR_FORGE_ROLE_PLAN_ID: plan.plan_id, CSTAR_FORGE_ROLE_PLAN_SHA256: plan.plan_sha256,
                    CSTAR_FORGE_INPUT_HANDOFF_SHA256: inputHandoffSha256,
                    CSTAR_FORGE_SPECIFICATION_HANDOFF_SHA256: specificationSha256 });
                const result = spawnContained(runtime.command, [...runtime.prefixArgs,
                    '--profile', EXPECTED_PROFILE,
                    'chat', '--provider', EXPECTED_PROVIDER, '--model', EXPECTED_MODEL,
                    '--forge-query-stdin', '--quiet', '--toolsets', NO_TOOLS_TOOLSET, '--safe-mode',
                    '--max-turns', '1', '--source', 'tool',
                ], { cwd: intent.project_root, encoding: 'utf-8', timeout: roleTimeoutSeconds * 1000,
                    maxBuffer: 16 * 1024 * 1024, env, input: promptBytes,
                    stdio: ['pipe', 'pipe', 'pipe'], markLiveSpend: true });
                if (Number.isInteger(result.pid)) providerRequestsStarted += 1;
                if (result.error) {
                    if (!Number.isInteger(result.pid) && result.error.code === 'E2BIG') throw new Error('forge_hermes_spawn_e2big');
                    throw new Error('forge_hermes_invocation_failed');
                }
                if (result.status !== 0) throw new Error(`forge_hermes_exit_${result.status}`);
                providerRequestsCompleted += 1;
                const providerPacket = providerPacketFrom(
                    result.stdout ?? '', intent, resolved, role, phase, inputHandoffSha256, specificationSha256, plan,
                );
                actualModel = providerPacket.provider_model ?? actualModel;
                totalPromptChars += prompt.length;
                aggregateInputTokens += providerPacket.usage.input_tokens;
                aggregateOutputTokens += providerPacket.usage.output_tokens;
                try {
                    previousHandoff = parseRoleHandoff(providerPacket.text, {
                        expectedRole: role,
                        expectedPreviousHandoffSha256: index === 0 ? null : inputHandoffSha256,
                    });
                    if (index === 0) specificationHandoff = previousHandoff;
                } catch (error) {
                    if (!syntheticRuntimeAllowed() || index !== 0) throw error;
                    response = extractJsonObject(providerPacket.text);
                    legacySyntheticResponse = true;
                }
                roleReceipts.push({ role, phase, input_handoff_sha256: inputHandoffSha256,
                    specification_handoff_sha256: specificationSha256,
                    output_handoff_sha256: previousHandoff?.handoff_sha256 ?? null,
                    input_tokens: providerPacket.usage.input_tokens,
                    output_tokens: providerPacket.usage.output_tokens });
                if (legacySyntheticResponse) break;
            }
        } finally { fs.rmSync(runtimeRoot, { recursive: true, force: true }); }
        if (!response) response = extractFinalQaManifest(previousHandoff);
        const responseJson = JSON.stringify(response);
        const responseFd = fs.openSync(intent.payload.write_to,
            fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
        try {
            fs.writeFileSync(responseFd, `${responseJson}\n`, 'utf-8');
            fs.fsyncSync(responseFd);
        } finally { fs.closeSync(responseFd); }
        const responseDirectoryFd = fs.openSync(path.dirname(intent.payload.write_to), fs.constants.O_RDONLY);
        try { fs.fsyncSync(responseDirectoryFd); } finally { fs.closeSync(responseDirectoryFd); }
        process.stdout.write(`${JSON.stringify({
            status: 'ok', intent_id: `forge-hermes-${sha256(JSON.stringify(roleReceipts)).slice(0, 16)}`,
            duration_ms: Date.now() - startedAt, response_chars: responseJson.length,
            est_prompt_tokens: Math.ceil(totalPromptChars / 4), est_response_tokens: Math.ceil(responseJson.length / 4),
            provider: EXPECTED_PROVIDER, auth_provider: EXPECTED_PROVIDER,
            auth_mode: EXPECTED_AUTH_MODE, requested_model: EXPECTED_MODEL, actual_model: actualModel,
            model_source: actualModel ? 'provider_reported' : 'unreported',
            model: EXPECTED_MODEL, hermes_profile: EXPECTED_PROFILE,
            input_tokens: aggregateInputTokens, output_tokens: aggregateOutputTokens,
            forge_topology: legacySyntheticResponse ? 'synthetic_legacy_single_response_v1' : plan.plan_id,
            role_plan_sha256: plan.plan_sha256, role_receipts: roleReceipts,
            provider_requests_started: providerRequestsStarted,
            provider_requests_completed: providerRequestsCompleted,
            wrote_to: intent.payload.write_to, ledger_entry: null, live_spend: true,
            live_spend_unknown: false,
            live_source_collection: false,
        })}\n`);
    }
} catch (error) {
    fail(stableFailureReason(error));
}
