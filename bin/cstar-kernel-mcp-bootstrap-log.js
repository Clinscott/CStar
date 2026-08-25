import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MCP_BOOTSTRAP_LOG_MAX_BYTES = 256 * 1024;

const MCP_BOOTSTRAP_ERROR_CODES = new Set([
    'EACCES', 'EADDRINUSE', 'EEXIST', 'EISDIR', 'EMFILE', 'ENFILE',
    'ENOENT', 'ENOMEM', 'ENOSPC', 'ENOTDIR', 'EPERM',
]);

function isInside(candidate, root) {
    const relative = path.relative(root, candidate);
    return relative === '' || (
        relative !== '..'
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative)
    );
}

function currentUid() {
    return typeof process.getuid === 'function' ? process.getuid() : null;
}

function isOwned(stat) {
    const uid = currentUid();
    return uid !== null && stat.uid === uid;
}

function ensurePrivateDirectory(root, relativePath) {
    const target = path.join(root, relativePath);
    if (!isInside(path.resolve(target), root)) throw new Error('bootstrap_log_path_escape');
    if (!fs.existsSync(target)) fs.mkdirSync(target, { mode: 0o700 });
    const stat = fs.lstatSync(target);
    if (
        !stat.isDirectory()
        || stat.isSymbolicLink()
        || !isOwned(stat)
        || (stat.mode & 0o022) !== 0
    ) throw new Error('bootstrap_log_directory_unsafe');
    const canonical = fs.realpathSync(target);
    if (!isInside(canonical, root)) throw new Error('bootstrap_log_directory_escape');
    return canonical;
}

export function formatBootstrapErrorRecord(error, timestamp = new Date()) {
    const candidateCode = error && typeof error === 'object' && 'code' in error
        ? String(error.code ?? '').toUpperCase()
        : '';
    const code = MCP_BOOTSTRAP_ERROR_CODES.has(candidateCode)
        ? candidateCode.toLowerCase()
        : 'bootstrap_failure';
    const fingerprintInput = error instanceof Error
        ? `${error.name}\n${error.stack ?? error.message}`
        : String(error);
    const fingerprint = createHash('sha256')
        .update(fingerprintInput, 'utf8')
        .digest('hex')
        .slice(0, 16);
    return `[${timestamp.toISOString()}] code=${code} fingerprint=${fingerprint}\n`;
}

export function logBootstrapError(projectRoot, error) {
    try {
        const root = fs.realpathSync(projectRoot);
        if (root !== path.resolve(projectRoot)) return;
        ensurePrivateDirectory(root, 'logs');
        const logDirectory = ensurePrivateDirectory(root, path.join('logs', 'mcp'));
        const logPath = path.join(logDirectory, 'mcp_bootstrap_error.log');
        if (fs.existsSync(logPath)) {
            const existing = fs.lstatSync(logPath);
            if (
                !existing.isFile()
                || existing.isSymbolicLink()
                || existing.nlink !== 1
                || !isOwned(existing)
                || (existing.mode & 0o777) !== 0o600
            ) return;
            if (existing.size >= MCP_BOOTSTRAP_LOG_MAX_BYTES) return;
        }
        const flags = fs.constants.O_APPEND
            | fs.constants.O_CREAT
            | fs.constants.O_WRONLY
            | (fs.constants.O_NOFOLLOW ?? 0);
        const descriptor = fs.openSync(logPath, flags, 0o600);
        try {
            const stat = fs.fstatSync(descriptor);
            if (
                !stat.isFile()
                || stat.nlink !== 1
                || !isOwned(stat)
                || (stat.mode & 0o777) !== 0o600
            ) return;
            const record = formatBootstrapErrorRecord(error);
            if (stat.size + Buffer.byteLength(record, 'utf8') > MCP_BOOTSTRAP_LOG_MAX_BYTES) return;
            fs.writeSync(descriptor, record, undefined, 'utf8');
        } finally {
            fs.closeSync(descriptor);
        }
    } catch {
        // Diagnostics must never break the MCP surface.
    }
}
