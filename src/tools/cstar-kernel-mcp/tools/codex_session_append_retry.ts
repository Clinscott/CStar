import { createHash } from 'node:crypto';
import fs from 'node:fs';

const APPEND_RETRY_ATTEMPTS = 3;
const HASH_CHUNK_BYTES = 64 * 1024;
const SESSION_CHANGED = 'codex_request_identity_session_changed_during_read';

interface SessionSnapshot {
    dev: number;
    ino: number;
    uid: number;
    gid: number;
    mode: number;
    nlink: number;
    birthtimeMs: number;
    size: number;
    sha256: string;
}

function sessionChanged(): never {
    throw new Error(SESSION_CHANGED);
}

function sameIdentity(left: Pick<SessionSnapshot, 'dev' | 'ino' | 'uid' | 'gid' | 'mode' | 'nlink' | 'birthtimeMs'>, right: fs.Stats): boolean {
    return left.dev === right.dev && left.ino === right.ino
        && left.uid === right.uid && left.gid === right.gid
        && left.mode === right.mode && left.nlink === right.nlink
        && left.birthtimeMs === right.birthtimeMs;
}

function assertSafeSession(stat: fs.Stats, maxFileBytes: number): void {
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.()
        || (stat.mode & 0o022) !== 0 || stat.size === 0 || stat.size > maxFileBytes) {
        throw new Error('codex_request_identity_opened_session_file_is_unsafe');
    }
}

function hashPrefix(
    descriptor: number,
    size: number,
    priorSize?: number,
): { sha256: string; priorSha256?: string } {
    const digest = createHash('sha256');
    const priorDigest = priorSize === undefined ? undefined : createHash('sha256');
    const chunk = Buffer.allocUnsafe(Math.min(HASH_CHUNK_BYTES, size));
    let offset = 0;
    while (offset < size) {
        const requested = Math.min(chunk.length, size - offset);
        const read = fs.readSync(descriptor, chunk, 0, requested, offset);
        if (read === 0) sessionChanged();
        const bytes = chunk.subarray(0, read);
        digest.update(bytes);
        if (priorDigest && offset < priorSize!) {
            priorDigest.update(bytes.subarray(0, Math.min(read, priorSize! - offset)));
        }
        offset += read;
    }
    return { sha256: digest.digest('hex'), priorSha256: priorDigest?.digest('hex') };
}

function captureSnapshot(
    sessionFile: string,
    maxFileBytes: number,
    prior?: SessionSnapshot,
): SessionSnapshot {
    let before: fs.Stats;
    try {
        before = fs.lstatSync(sessionFile);
    } catch {
        return sessionChanged();
    }
    if (before.isSymbolicLink()) return sessionChanged();
    let descriptor: number;
    try {
        descriptor = fs.openSync(sessionFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    } catch {
        return sessionChanged();
    }
    try {
        const opened = fs.fstatSync(descriptor);
        assertSafeSession(opened, maxFileBytes);
        if (!sameIdentity(opened, before)
            || (prior && (!sameIdentity(prior, opened) || opened.size < prior.size))) {
            return sessionChanged();
        }
        const hashes = hashPrefix(descriptor, opened.size, prior?.size);
        let afterPath: fs.Stats;
        try {
            afterPath = fs.lstatSync(sessionFile);
        } catch {
            return sessionChanged();
        }
        const afterRead = fs.fstatSync(descriptor);
        if (afterPath.isSymbolicLink() || !sameIdentity(opened, afterRead)
            || !sameIdentity(opened, afterPath)
            || afterRead.size < opened.size || afterPath.size < opened.size
            || (prior && hashes.priorSha256 !== prior.sha256)) {
            return sessionChanged();
        }
        if (afterRead.size !== opened.size || afterPath.size !== opened.size
            || afterRead.mtimeMs !== opened.mtimeMs || afterRead.ctimeMs !== opened.ctimeMs) {
            const stable = hashPrefix(descriptor, opened.size, prior?.size);
            if (stable.sha256 !== hashes.sha256
                || stable.priorSha256 !== hashes.priorSha256) return sessionChanged();
        }
        return {
            dev: opened.dev, ino: opened.ino, uid: opened.uid, gid: opened.gid,
            mode: opened.mode, nlink: opened.nlink, birthtimeMs: opened.birthtimeMs,
            size: opened.size, sha256: hashes.sha256,
        };
    } finally {
        fs.closeSync(descriptor);
    }
}

export function retryAppendOnlyCodexSessionRead<T>(
    sessionFile: string,
    maxFileBytes: number,
    read: () => T,
): T {
    let snapshot = captureSnapshot(sessionFile, maxFileBytes);
    for (let attempt = 0; attempt < APPEND_RETRY_ATTEMPTS; attempt += 1) {
        try {
            const result = read();
            captureSnapshot(sessionFile, maxFileBytes, snapshot);
            return result;
        } catch (error) {
            if (!(error instanceof Error && error.message === SESSION_CHANGED)
                || attempt + 1 >= APPEND_RETRY_ATTEMPTS) throw error;
            const next = captureSnapshot(sessionFile, maxFileBytes, snapshot);
            if (next.size <= snapshot.size) throw error;
            snapshot = next;
        }
    }
    throw new Error(SESSION_CHANGED);
}
