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

function fail(reason, details = {}) {
    process.stdout.write(`${JSON.stringify({
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
        ...details,
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
    const index = argv.indexOf('--intent-file');
    if (index < 0 || !argv[index + 1]) throw new Error('forge_hermes_intent_file_required');
    return argv[index + 1];
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
    return env;
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
    const intent = readIntent(parseArgs(process.argv.slice(2)));
    const prompt = buildPrompt(intent, materializeTargets(intent));
    const hermes = resolveHermes();
    const timeoutSeconds = Math.max(60, Math.min(1800, Number(intent.payload.timeout_seconds ?? 600)));
    const startedAt = Date.now();
    hermesInvocationMayHaveSpent = true;
    const result = spawnSync(hermes, [
        '--profile', EXPECTED_PROFILE,
        '--provider', EXPECTED_PROVIDER,
        '--model', EXPECTED_MODEL,
        'chat', '-q', prompt, '--quiet',
        '--toolsets', 'clarify',
        '--safe-mode',
        '--max-turns', '1',
        '--source', 'tool',
    ], {
        cwd: intent.project_root,
        encoding: 'utf-8',
        timeout: timeoutSeconds * 1000,
        maxBuffer: 16 * 1024 * 1024,
        env: minimalHermesEnvironment(),
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`forge_hermes_exit_${result.status}`);
    }
    const response = extractJsonObject(result.stdout ?? '');
    const responseJson = JSON.stringify(response);
    const responseFd = fs.openSync(
        intent.payload.write_to,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
        0o600,
    );
    try {
        fs.writeFileSync(responseFd, `${responseJson}\n`, 'utf-8');
        fs.fsyncSync(responseFd);
    } finally {
        fs.closeSync(responseFd);
    }
    const responseDirectoryFd = fs.openSync(path.dirname(intent.payload.write_to), fs.constants.O_RDONLY);
    try {
        fs.fsyncSync(responseDirectoryFd);
    } finally {
        fs.closeSync(responseDirectoryFd);
    }
    process.stdout.write(`${JSON.stringify({
        status: 'ok',
        intent_id: `forge-hermes-${sha256(prompt).slice(0, 16)}`,
        duration_ms: Date.now() - startedAt,
        response_chars: responseJson.length,
        est_prompt_tokens: Math.ceil(prompt.length / 4),
        est_response_tokens: Math.ceil(responseJson.length / 4),
        provider: EXPECTED_PROVIDER,
        requested_model: EXPECTED_MODEL,
        actual_model: null,
        model_source: 'unreported',
        model: EXPECTED_MODEL,
        hermes_profile: EXPECTED_PROFILE,
        wrote_to: intent.payload.write_to,
        ledger_entry: null,
        live_spend: true,
        live_source_collection: false,
    })}\n`);
} catch (error) {
    fail(error instanceof Error ? error.message : String(error));
}
