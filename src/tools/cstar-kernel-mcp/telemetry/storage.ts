import fs from 'node:fs';
import path from 'node:path';

import { readBoundedUtf8RelativeFile } from '../../../core/safe_local_file.js';

export const MCP_USAGE_STATE_RELATIVE_PATH = path.join(
    '.agents', 'state', 'cstar-kernel-mcp-usage.jsonl',
);
export const MCP_USEFULNESS_STATE_RELATIVE_PATH = path.join(
    '.agents', 'state', 'cstar-kernel-mcp-usefulness.jsonl',
);
export const MCP_TELEMETRY_MAX_BYTES = 2 * 1024 * 1024;
export const MCP_TELEMETRY_MAX_LINE_BYTES = 8 * 1024;

function currentUid(): number {
    if (typeof process.getuid !== 'function') throw new Error('telemetry_owner_check_unavailable');
    return process.getuid();
}

function assertOwnedNotWritableByOthers(stat: fs.Stats, error: string): void {
    if (stat.uid !== currentUid() || (stat.mode & 0o022) !== 0) throw new Error(error);
}

function assertSafeDirectory(candidate: string, error: string): fs.Stats {
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(error);
    if (fs.realpathSync(candidate) !== candidate) throw new Error(error);
    assertOwnedNotWritableByOthers(stat, `${error}_permissions`);
    return stat;
}

function resolveTelemetryState(root: string, create: boolean): string | null {
    const lexicalRoot = path.resolve(root);
    assertSafeDirectory(lexicalRoot, 'telemetry_root_unsafe');
    const agents = path.join(lexicalRoot, '.agents');
    assertSafeDirectory(agents, 'telemetry_agents_directory_unsafe');
    const state = path.join(agents, 'state');
    const existing = fs.lstatSync(state, { throwIfNoEntry: false });
    if (!existing) {
        if (!create) return null;
        fs.mkdirSync(state, { mode: 0o700 });
    }
    assertSafeDirectory(state, 'telemetry_state_directory_unsafe');
    return state;
}

function assertSafeTelemetryFile(target: string): fs.Stats {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('telemetry_file_unsafe');
    if (stat.nlink !== 1) throw new Error('telemetry_file_hardlink_forbidden');
    assertOwnedNotWritableByOthers(stat, 'telemetry_file_permissions_unsafe');
    return stat;
}

function assertFilename(filename: string): void {
    if (!/^[a-z0-9._-]+\.jsonl$/i.test(filename)) throw new Error('telemetry_filename_invalid');
}

function acquireTelemetryLock(state: string, filename: string): string | null {
    const lock = path.join(state, `${filename}.lock`);
    try {
        fs.mkdirSync(lock, { mode: 0o700 });
        assertSafeDirectory(lock, 'telemetry_lock_directory_unsafe');
        return lock;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null;
        throw error;
    }
}

export function appendBoundedTelemetryLine(
    root: string,
    filename: string,
    line: string,
    maxBytes = MCP_TELEMETRY_MAX_BYTES,
): boolean {
    assertFilename(filename);
    const record = line.endsWith('\n') ? line : `${line}\n`;
    const recordBytes = Buffer.byteLength(record, 'utf8');
    if (recordBytes > MCP_TELEMETRY_MAX_LINE_BYTES || recordBytes > maxBytes) return false;
    const state = resolveTelemetryState(root, true)!;
    const lock = acquireTelemetryLock(state, filename);
    if (!lock) return false;
    const target = path.join(state, filename);
    const flags = fs.constants.O_APPEND
        | fs.constants.O_CREAT
        | fs.constants.O_WRONLY
        | (fs.constants.O_NOFOLLOW ?? 0);
    let descriptor: number | null = null;
    try {
        descriptor = fs.openSync(target, flags, 0o600);
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile() || stat.nlink !== 1) return false;
        assertOwnedNotWritableByOthers(stat, 'telemetry_file_permissions_unsafe');
        if (stat.size + recordBytes > maxBytes) fs.ftruncateSync(descriptor, 0);
        fs.writeSync(descriptor, record, undefined, 'utf8');
        if (fs.fstatSync(descriptor).size > maxBytes) {
            fs.ftruncateSync(descriptor, 0);
            return false;
        }
        return true;
    } finally {
        if (descriptor !== null) fs.closeSync(descriptor);
        fs.rmdirSync(lock);
    }
}

export function readBoundedTelemetryFile(
    root: string,
    relativePath: string,
): string | null {
    const filename = path.basename(relativePath);
    assertFilename(filename);
    if (relativePath !== path.join('.agents', 'state', filename)) {
        throw new Error('telemetry_relative_path_invalid');
    }
    const state = resolveTelemetryState(root, false);
    if (!state) return null;
    const target = path.join(state, filename);
    if (!fs.existsSync(target)) return null;
    assertSafeTelemetryFile(target);
    return readBoundedUtf8RelativeFile(root, relativePath, MCP_TELEMETRY_MAX_BYTES)?.content ?? null;
}
