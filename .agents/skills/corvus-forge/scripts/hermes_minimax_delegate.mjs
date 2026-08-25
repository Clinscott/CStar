#!/usr/bin/env node

/**
 * Forge-private Hermes/MiniMax delegate.
 *
 * It accepts one sealed CStar intent, supplies bounded target material to
 * Hermes, and writes the model JSON to the requested response artifact. It
 * never reads provider secrets; Hermes owns its profile and credential flow.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const EXPECTED_PROFILE = 'cstar-hub';
const EXPECTED_PROVIDER = 'minimax';
const EXPECTED_MODEL = 'MiniMax-M3';
const NO_TOOLS_TOOLSET = 'context_engine';
const FAILURE_SCHEMA = 'cstar.forge_delegate_failure.v1';
const PREFLIGHT_SCHEMA = 'cstar.forge_hermes_preflight.v1';
// --profile is consumed by Hermes' pre-parser and intentionally omitted from help.
const CHAT_FLAGS = [
    '-q', '--quiet', '--toolsets', '--safe-mode', '--max-turns', '--source',
    '--provider', '--model',
];
const FILE_BYTE_CAP = 64 * 1024;
const TOTAL_BYTE_CAP = 512 * 1024;
const HERMES_OVERRIDE = process.env.HERMES_BIN?.trim();
const HERMES_CANDIDATES = HERMES_OVERRIDE
    ? [HERMES_OVERRIDE]
    : [
        path.join(os.homedir(), '.local', 'bin', 'hermes'),
        path.join(os.homedir(), 'Corvus', 'AutoBot', 'hermes-agent', '.venv', 'bin', 'hermes'),
    ];

let hermesInvocationMayHaveSpent = false;

function stableFailureReason(error) {
    const reason = error instanceof Error ? error.message : String(error);
    return /^forge_[a-z0-9_]+(?:_[0-9]+)?$/.test(reason) && reason.length <= 120
        ? reason
        : 'forge_hermes_delegate_failed';
}

function fail(reason) {
    process.stdout.write(`${JSON.stringify({
        schema: FAILURE_SCHEMA,
        status: 'degraded',
        degraded_reason: reason,
        provider: EXPECTED_PROVIDER,
        requested_model: EXPECTED_MODEL,
        actual_model: null,
        model_source: 'unreported',
        model: EXPECTED_MODEL,
        hermes_profile: EXPECTED_PROFILE,
        live_spend: hermesInvocationMayHaveSpent ? null : false,
        live_spend_unknown: hermesInvocationMayHaveSpent,
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
            if (fs.lstatSync(current).isSymbolicLink()) {
                throw new Error('forge_hermes_target_symlink_forbidden');
            }
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
        return { data: fs.readFileSync(fd).subarray(0, byteCap), size: stat.size };
    } finally {
        fs.closeSync(fd);
    }
}

function resolveHermes() {
    for (const candidate of HERMES_CANDIDATES) {
        const executable = safeExecutable(candidate);
        if (executable) return executable;
    }
    throw new Error('forge_hermes_executable_not_found_or_unsafe');
}

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
    if (
        directoryStat.isSymbolicLink()
        || !directoryStat.isDirectory()
        || directoryStat.uid !== process.getuid?.()
        || (directoryStat.mode & 0o022) !== 0
    ) {
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
    if (typeof data.project_root !== 'string' || !path.isAbsolute(data.project_root)) {
        throw new Error('forge_hermes_project_root_invalid');
    }
    const payload = data.payload ?? {};
    if (payload.hermes_profile !== EXPECTED_PROFILE || payload.model !== EXPECTED_MODEL) {
        throw new Error('forge_hermes_profile_or_model_mismatch');
    }
    if (payload.expected_output !== 'json') throw new Error('forge_hermes_json_output_required');
    if (typeof payload.write_to !== 'string' || !path.isAbsolute(payload.write_to)) {
        throw new Error('forge_hermes_response_path_invalid');
    }
    payload.write_to = assertPrivateResponsePath(intentPath, payload.write_to);
    if (!Array.isArray(data.target_paths) || data.target_paths.length === 0) {
        throw new Error('forge_hermes_nonempty_targets_required');
    }
    return data;
}

function minimalHermesEnvironment() {
    const allowed = [
        'HOME', 'LANG', 'LC_ALL', 'TZ',
        'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
        'TMPDIR', 'TMP', 'TEMP',
    ];
    const env = Object.fromEntries(
        allowed.filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
    );
    env.CSTAR_FORGE_HERMES_DELEGATED = '1';
    env.HERMES_SAFE_MODE = '1';
    env.HERMES_IGNORE_USER_CONFIG = '1';
    env.HERMES_IGNORE_RULES = '1';
    return env;
}

function makePrivateDirectory(root, name) {
    const directory = path.join(root, name);
    fs.mkdirSync(directory, { mode: 0o700 });
    return directory;
}

function sterilePreflightEnvironment(root) {
    const home = makePrivateDirectory(root, 'home');
    const tmp = makePrivateDirectory(root, 'tmp');
    const env = {
        HOME: home,
        XDG_CACHE_HOME: makePrivateDirectory(root, 'cache'),
        XDG_CONFIG_HOME: makePrivateDirectory(root, 'config'),
        XDG_DATA_HOME: makePrivateDirectory(root, 'data'),
        TMPDIR: tmp,
        TMP: tmp,
        TEMP: tmp,
        NO_COLOR: '1',
        PYTHONNOUSERSITE: '1',
        PYTHONDONTWRITEBYTECODE: '1',
    };
    for (const key of ['LANG', 'LC_ALL', 'TZ']) {
        if (process.env[key]) env[key] = process.env[key];
    }
    return env;
}

function runHelpProbe(hermes, args, env, cwd, failureReason) {
    const result = spawnSync(hermes, args, {
        cwd, env, encoding: 'utf-8', timeout: 5000,
        maxBuffer: 1024 * 1024, input: '',
    });
    if (result.error || result.status !== 0) throw new Error(failureReason);
    return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function assertHelpFlags(output, required) {
    const missing = required.find((flag) => !output.includes(flag));
    if (missing) {
        throw new Error(`forge_hermes_preflight_missing_${missing.replace(/^-+/, '').replace(/-/g, '_')}`);
    }
}

function executableSha256(hermes) {
    return createHash('sha256').update(fs.readFileSync(hermes)).digest('hex');
}

function runHermesPreflight(hermes = resolveHermes()) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-hermes-preflight-'));
    fs.chmodSync(root, 0o700);
    try {
        const env = sterilePreflightEnvironment(root);
        const version = runHelpProbe(hermes, ['--version'], env, root,
            'forge_hermes_preflight_version_failed');
        const topHelp = runHelpProbe(hermes, ['--help'], env, root,
            'forge_hermes_preflight_help_failed');
        const chatHelp = runHelpProbe(hermes, ['chat', '--help'], env, root,
            'forge_hermes_preflight_chat_help_failed');
        assertHelpFlags(chatHelp, CHAT_FLAGS);
        return {
            schema: PREFLIGHT_SCHEMA,
            status: 'ok',
            executable_sha256: executableSha256(hermes),
            version_sha256: sha256(version),
            checks: { version: 'pass', help: 'pass', chat_help: 'pass', required_flags: 'pass' },
            live_spend: false,
            live_spend_unknown: false,
            live_source_collection: false,
        };
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

function assertBoundPreflight(proof, hermes) {
    if (!proof || proof.schema !== PREFLIGHT_SCHEMA || proof.status !== 'ok'
        || proof.executable_sha256 !== executableSha256(hermes)
        || !/^[a-f0-9]{64}$/.test(proof.version_sha256 ?? '')
        || proof.checks?.version !== 'pass' || proof.checks?.help !== 'pass'
        || proof.checks?.chat_help !== 'pass' || proof.checks?.required_flags !== 'pass'
        || proof.live_spend !== false || proof.live_spend_unknown !== false
        || proof.live_source_collection !== false) {
        throw new Error('forge_hermes_preflight_binding_invalid');
    }
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
            if (!isInside(canonicalAncestor, projectRoot)) {
                throw new Error('forge_hermes_target_parent_escape');
            }
            materials.push({
                path: path.relative(projectRoot, candidate).split(path.sep).join('/'),
                bytes: 0,
                truncated: false,
                content: '[AUTHORIZED NEW FILE: currently absent]',
            });
            continue;
        }
        const canonical = fs.realpathSync(candidate);
        if (!isInside(canonical, projectRoot)) throw new Error('forge_hermes_target_symlink_escape');
        const remaining = TOTAL_BYTE_CAP - totalBytes;
        if (remaining <= 0) break;
        const safe = readSafeTarget(canonical, Math.min(FILE_BYTE_CAP, remaining));
        const data = safe.data;
        totalBytes += data.byteLength;
        materials.push({
            path: path.relative(projectRoot, canonical).split(path.sep).join('/'),
            bytes: data.byteLength,
            truncated: safe.size > data.byteLength,
            content: data.toString('utf-8'),
        });
    }
    return materials;
}

function buildPrompt(intent, materials) {
    const sections = [
        'You are the Forge-private Hermes worker selected by the CStar control plane.',
        `Provider: ${EXPECTED_PROVIDER}. Profile: ${EXPECTED_PROFILE}. Model: ${EXPECTED_MODEL}.`,
        'Obey the sealed mission and output contract. Do not call tools or write files.',
        '',
        intent.intent,
        '',
        'SEALED TARGET MATERIALS:',
    ];
    for (const material of materials) {
        sections.push(
            `\n--- ${material.path} (${material.bytes} bytes${material.truncated ? ', truncated' : ''}) ---`,
            material.content,
            '--- end target ---',
        );
    }
    sections.push('', 'Return JSON only. Do not wrap it in a Markdown fence.');
    return sections.join('\n');
}

function stripHermesBanners(value) {
    return value.split(/\r?\n/)
        .filter((line) => !/^\s*(?:session_id:|⚠)/.test(line))
        .join('\n')
        .trim();
}

function extractJsonObject(raw) {
    const cleaned = stripHermesBanners(raw);
    try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
        // Fall through to balanced-object extraction.
    }
    const candidates = [];
    for (let start = 0; start < cleaned.length; start += 1) {
        if (cleaned[start] !== '{') continue;
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let end = start; end < cleaned.length; end += 1) {
            const char = cleaned[end];
            if (inString) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') inString = false;
                continue;
            }
            if (char === '"') inString = true;
            else if (char === '{') depth += 1;
            else if (char === '}' && --depth === 0) {
                candidates.push(cleaned.slice(start, end + 1));
                break;
            }
        }
    }
    for (const candidate of candidates.reverse()) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
            // Keep searching.
        }
    }
    throw new Error('forge_hermes_response_json_invalid');
}

function sha256(value) {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

try {
    if (process.env.CSTAR_FORGE_HERMES_DELEGATED) throw new Error('forge_hermes_nested_delegation_forbidden');
    const invocation = parseArgs(process.argv.slice(2));
    if (invocation.mode === 'preflight') {
        process.stdout.write(`${JSON.stringify(runHermesPreflight())}\n`);
    } else {
        const intent = readIntent(invocation.intentPath);
        const prompt = buildPrompt(intent, materializeTargets(intent));
        const hermes = resolveHermes();
        if (intent.hermes_preflight) assertBoundPreflight(intent.hermes_preflight, hermes);
        else runHermesPreflight(hermes);
        const timeoutSeconds = Math.max(60, Math.min(1800, Number(intent.payload.timeout_seconds ?? 600)));
        const startedAt = Date.now();
        hermesInvocationMayHaveSpent = true;
        const result = spawnSync(hermes, [
            '--profile', EXPECTED_PROFILE,
            'chat', '--provider', EXPECTED_PROVIDER, '--model', EXPECTED_MODEL,
            '-q', prompt, '--quiet', '--toolsets', NO_TOOLS_TOOLSET, '--safe-mode',
            '--max-turns', '1', '--source', 'tool',
        ], {
            cwd: intent.project_root, encoding: 'utf-8', timeout: timeoutSeconds * 1000,
            maxBuffer: 16 * 1024 * 1024, env: minimalHermesEnvironment(),
        });
        if (result.error) throw new Error('forge_hermes_invocation_failed');
        if (result.status !== 0) throw new Error(`forge_hermes_exit_${result.status}`);
        const response = extractJsonObject(result.stdout ?? '');
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
            status: 'ok', intent_id: `forge-hermes-${sha256(prompt).slice(0, 16)}`,
            duration_ms: Date.now() - startedAt, response_chars: responseJson.length,
            est_prompt_tokens: Math.ceil(prompt.length / 4), est_response_tokens: Math.ceil(responseJson.length / 4),
            provider: EXPECTED_PROVIDER, requested_model: EXPECTED_MODEL, actual_model: null,
            model_source: 'unreported', model: EXPECTED_MODEL, hermes_profile: EXPECTED_PROFILE,
            wrote_to: intent.payload.write_to, ledger_entry: null, live_spend: true,
            live_source_collection: false,
        })}\n`);
    }
} catch (error) {
    fail(stableFailureReason(error));
}
