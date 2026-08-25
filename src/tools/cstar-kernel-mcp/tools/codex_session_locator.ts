import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MAX_CODEX_SESSION_FILE_BYTES = 512 * 1024 * 1024;
const MAX_SESSION_FILES_SCANNED = 20_000;
const MAX_SESSION_DIRECTORY_DEPTH = 16;

function isInside(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function resolveCodexSessionsRoot(): string {
    const codexHome = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex');
    const sessionsRoot = path.join(codexHome, 'sessions');
    const stat = fs.lstatSync(sessionsRoot);
    if (
        stat.isSymbolicLink()
        || !stat.isDirectory()
        || stat.uid !== process.getuid?.()
        || (stat.mode & 0o022) !== 0
    ) {
        throw new Error('operator_authorization_sessions_root_is_not_a_real_directory');
    }
    return fs.realpathSync(sessionsRoot);
}

export function findCodexSessionFile(sessionsRoot: string, threadId: string): string {
    const matches: string[] = [];
    let scanned = 0;
    const pending = [{ directory: sessionsRoot, depth: 0 }];
    while (pending.length > 0) {
        const current = pending.pop()!;
        const directory = fs.opendirSync(current.directory);
        try {
            let entry: fs.Dirent | null;
            while ((entry = directory.readSync()) !== null) {
                if (++scanned > MAX_SESSION_FILES_SCANNED) {
                    throw new Error('operator_authorization_session_scan_limit_exceeded');
                }
                const candidate = path.join(current.directory, entry.name);
                if (entry.isSymbolicLink()) continue;
                if (entry.isDirectory()) {
                    if (current.depth >= MAX_SESSION_DIRECTORY_DEPTH) {
                        throw new Error('operator_authorization_session_depth_limit_exceeded');
                    }
                    pending.push({ directory: candidate, depth: current.depth + 1 });
                } else if (entry.isFile() && entry.name.endsWith(`-${threadId}.jsonl`)) {
                    matches.push(candidate);
                    if (matches.length > 1) {
                        throw new Error(`operator_authorization_session_match_count:${matches.length}`);
                    }
                }
            }
        } finally {
            directory.closeSync();
        }
    }
    if (matches.length !== 1) {
        throw new Error(`operator_authorization_session_match_count:${matches.length}`);
    }
    const sessionFile = matches[0]!;
    const stat = fs.lstatSync(sessionFile);
    if (
        stat.isSymbolicLink()
        || !stat.isFile()
        || stat.nlink !== 1
        || stat.uid !== process.getuid?.()
        || (stat.mode & 0o022) !== 0
        || stat.size > MAX_CODEX_SESSION_FILE_BYTES
    ) {
        throw new Error('operator_authorization_session_file_is_unsafe');
    }
    const canonical = fs.realpathSync(sessionFile);
    if (!isInside(canonical, sessionsRoot)) {
        throw new Error('operator_authorization_session_file_escapes_root');
    }
    return canonical;
}
