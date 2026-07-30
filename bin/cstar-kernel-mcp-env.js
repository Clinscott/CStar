import fs from 'node:fs';
import path from 'node:path';

/**
 * Construct the complete environment for the direct-stdio CStar kernel.
 *
 * This is an allowlist, not a scrub list. The parent may contain provider
 * credentials, shell hooks, preload directives, persona state, or unrelated
 * application secrets; none of those values belong in the control-plane
 * child. Root and transport bindings are accepted only as explicit overrides
 * from the supported launcher.
 */

export const KERNEL_MCP_ALLOWED_PARENT_ENV_KEYS = Object.freeze([
    'HOME',
    'PATH',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'TZ',
    'USERPROFILE',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
    'CODEX_HOME',
    'CSTAR_MCP_CALLER_THREAD_ID',
    'CSTAR_MCP_CALLER_TRANSPORT',
    'CSTAR_PYTHON_EXECUTABLE',
]);

export const KERNEL_MCP_ALLOWED_OVERRIDE_KEYS = Object.freeze([
    'CSTAR_CODE_ROOT',
    'CSTAR_CONTROL_ROOT',
    'CSTAR_PROJECT_ROOT',
    'CSTAR_WORKSPACE_ROOT',
    'CSTAR_MCP_CALLER_THREAD_ID',
    'CSTAR_MCP_CALLER_TRANSPORT',
    'CSTAR_PYTHON_EXECUTABLE',
]);

function currentUid() {
    return typeof process.getuid === 'function' ? process.getuid() : null;
}

function assertOwnedNotWritableByOthers(stat, errorPrefix) {
    const uid = currentUid();
    if (uid !== null && stat.uid !== uid) throw new Error(`${errorPrefix}_owner_mismatch`);
    if ((stat.mode & 0o022) !== 0) throw new Error(`${errorPrefix}_permissions_unsafe`);
}

function resolveSafeCanonicalDirectory(candidate, errorPrefix) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
        throw new Error(`${errorPrefix}_missing`);
    }
    if (!path.isAbsolute(candidate)) throw new Error(`${errorPrefix}_not_absolute`);
    const lexical = path.resolve(candidate);
    const stat = fs.lstatSync(lexical, { throwIfNoEntry: false });
    if (!stat) throw new Error(`${errorPrefix}_missing`);
    if (stat.isSymbolicLink()) throw new Error(`${errorPrefix}_symlink_forbidden`);
    if (!stat.isDirectory()) throw new Error(`${errorPrefix}_not_directory`);
    const canonical = fs.realpathSync(lexical);
    if (canonical !== lexical) throw new Error(`${errorPrefix}_not_canonical`);
    assertOwnedNotWritableByOthers(stat, errorPrefix);
    return canonical;
}

function assertExistingSafeHallStore(controlRoot) {
    const statsPath = path.join(controlRoot, '.stats');
    const stats = fs.lstatSync(statsPath, { throwIfNoEntry: false });
    if (!stats) throw new Error('kernel_control_hall_stats_missing');
    if (stats.isSymbolicLink()) throw new Error('kernel_control_hall_stats_symlink_forbidden');
    if (!stats.isDirectory()) throw new Error('kernel_control_hall_stats_not_directory');
    if (fs.realpathSync(statsPath) !== statsPath) {
        throw new Error('kernel_control_hall_stats_not_canonical');
    }
    assertOwnedNotWritableByOthers(stats, 'kernel_control_hall_stats');

    const hallPath = path.join(statsPath, 'pennyone.db');
    const hall = fs.lstatSync(hallPath, { throwIfNoEntry: false });
    if (!hall) throw new Error('kernel_control_hall_store_missing');
    if (hall.isSymbolicLink()) throw new Error('kernel_control_hall_store_symlink_forbidden');
    if (!hall.isFile()) throw new Error('kernel_control_hall_store_not_regular_file');
    if (hall.nlink !== 1) throw new Error('kernel_control_hall_store_hardlink_forbidden');
    if (fs.realpathSync(hallPath) !== hallPath) {
        throw new Error('kernel_control_hall_store_not_canonical');
    }
    assertOwnedNotWritableByOthers(hall, 'kernel_control_hall_store');
    return hallPath;
}

/**
 * Resolve the two roots owned by the supported stdio launcher.
 *
 * CODE_ROOT is immutable executable/source lineage. CONTROL_ROOT is the
 * canonical CStar Hall and lifecycle root. A production launch never falls
 * back from one to the other and never creates a replacement Hall store.
 */
export function resolveKernelMcpLaunchRoots({ codeRoot, controlRoot }) {
    const resolvedCodeRoot = resolveSafeCanonicalDirectory(codeRoot, 'kernel_code_root');
    const resolvedControlRoot = resolveSafeCanonicalDirectory(controlRoot, 'kernel_control_root');
    const hallPath = assertExistingSafeHallStore(resolvedControlRoot);
    return {
        codeRoot: resolvedCodeRoot,
        controlRoot: resolvedControlRoot,
        hallPath,
    };
}

export const KERNEL_MCP_INACTIVE_HOST_ENV = Object.freeze({
    GEMINI_CLI_ACTIVE: 'false',
    GEMINI_CLI: '0',
    GEMINI_CLI_SUBAGENTS: 'false',
    CODEX_SHELL: '0',
    CODEX_THREAD_ID: '',
    CODEX_SUBAGENTS: 'false',
    CLAUDE_CLI_ACTIVE: 'false',
    CLAUDECODE: '',
    CLAUDE_SUBAGENTS: 'false',
    DROID_CLI_ACTIVE: 'false',
    CORVUS_HOST_PROVIDER: '',
    AGENT_MODE: 'headless',
    CORVUS_HOST_SESSION_ACTIVE: '0',
});

function copyAllowed(target, source, keys) {
    for (const key of keys) {
        const value = source?.[key];
        if (typeof value === 'string' && value.length > 0) {
            target[key] = value;
        }
    }
}

export function buildKernelMcpChildEnv(sourceEnv = process.env, overrides = {}) {
    const childEnv = {};
    copyAllowed(childEnv, sourceEnv, KERNEL_MCP_ALLOWED_PARENT_ENV_KEYS);
    copyAllowed(childEnv, overrides, KERNEL_MCP_ALLOWED_OVERRIDE_KEYS);

    Object.assign(childEnv, KERNEL_MCP_INACTIVE_HOST_ENV, {
        CSTAR_KERNEL_MCP: '1',
        CSTAR_KERNEL_DISABLE_WATCH: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONHASHSEED: '0',
        PYTHONNOUSERSITE: '1',
    });

    if (process.platform === 'linux') {
        childEnv.TMPDIR = '/tmp';
        childEnv.TMP = '/tmp';
        childEnv.TEMP = '/tmp';
    }
    return childEnv;
}

export function neutralizeKernelMcpProcessEnv(targetEnv = process.env, overrides = {}) {
    const safeEnv = buildKernelMcpChildEnv(targetEnv, overrides);
    for (const key of Object.keys(targetEnv)) {
        delete targetEnv[key];
    }
    Object.assign(targetEnv, safeEnv);
    return targetEnv;
}
