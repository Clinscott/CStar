import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { TextDecoder } from 'node:util';

const SCAN_CHUNK_BYTES = 64 * 1024;
const MAX_JSONL_RECORD_BYTES = 64 * 1024 * 1024;
const MAX_JSONL_RECORDS = 1_000_000;

export interface FixedCodexSessionRecord {
    index: number;
    rawLine: string;
    row: Record<string, unknown>;
}

export interface FixedCodexSessionScan {
    fileBytes: number;
    recordCount: number;
    sha256: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameOpenedFile(left: fs.Stats, right: fs.Stats): boolean {
    return left.dev === right.dev
        && left.ino === right.ino
        && left.uid === right.uid
        && left.gid === right.gid
        && left.mode === right.mode
        && left.nlink === right.nlink
        && left.size === right.size
        && left.mtimeMs === right.mtimeMs
        && left.ctimeMs === right.ctimeMs;
}

function assertOpenedSessionFileIsSafe(stat: fs.Stats, maxFileBytes: number): void {
    if (
        !stat.isFile() || stat.nlink !== 1
        || stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0
        || stat.size === 0 || stat.size > maxFileBytes
    ) {
        throw new Error('codex_request_identity_opened_session_file_is_unsafe');
    }
}

/**
 * Scan one immutable descriptor, validating every JSONL row before any caller
 * may use its bounded authority state. The visitor must not retain unrelated
 * row content and receives decoded raw-line bytes only for the current row.
 */
export function scanFixedCodexSession(
    sessionFile: string,
    maxFileBytes: number,
    visitor: (record: FixedCodexSessionRecord) => void,
): FixedCodexSessionScan {
    const beforeOpen = fs.lstatSync(sessionFile);
    if (beforeOpen.isSymbolicLink()) {
        throw new Error('codex_request_identity_opened_session_file_is_unsafe');
    }
    const descriptor = fs.openSync(sessionFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const opened = fs.fstatSync(descriptor);
        assertOpenedSessionFileIsSafe(opened, maxFileBytes);
        if (!sameOpenedFile(beforeOpen, opened)) {
            throw new Error('codex_request_identity_session_changed_before_open');
        }

        const digest = createHash('sha256');
        const chunk = Buffer.allocUnsafe(Math.min(SCAN_CHUNK_BYTES, opened.size));
        let lineFragments: Buffer[] = [];
        let lineBytes = 0;
        let offset = 0;
        let recordCount = 0;
        let finalByte: number | undefined;
        let firstRecordFailure: { index: number; error: Error } | undefined;
        let firstVisitorFailure: { index: number; error: Error } | undefined;

        const rememberRecordFailure = (index: number, message: string): void => {
            firstRecordFailure ??= { index, error: new Error(message) };
        };
        const processLine = (terminalFragment: Buffer): void => {
            const index = recordCount++;
            if (recordCount > MAX_JSONL_RECORDS) {
                rememberRecordFailure(index, 'codex_request_identity_session_record_count_limit_exceeded');
                lineFragments = [];
                lineBytes = 0;
                return;
            }
            const totalBytes = lineBytes + terminalFragment.length;
            if (totalBytes > MAX_JSONL_RECORD_BYTES) {
                rememberRecordFailure(index, 'codex_request_identity_session_record_limit_exceeded');
                lineFragments = [];
                lineBytes = 0;
                return;
            }
            if (firstRecordFailure) {
                lineFragments = [];
                lineBytes = 0;
                return;
            }
            const rawBytes = lineFragments.length === 0
                ? terminalFragment
                : Buffer.concat([...lineFragments, terminalFragment], totalBytes);
            lineFragments = [];
            lineBytes = 0;
            const startsWithBom = index === 0 && rawBytes.length >= 3
                && rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf;
            let rawLineWithPossibleCr: string;
            try {
                rawLineWithPossibleCr = new TextDecoder('utf-8', {
                    fatal: true,
                    ignoreBOM: true,
                }).decode(startsWithBom ? rawBytes.subarray(3) : rawBytes);
            } catch {
                rememberRecordFailure(index, 'codex_request_identity_session_utf8_invalid');
                return;
            }
            const rawLine = rawLineWithPossibleCr.endsWith('\r')
                ? rawLineWithPossibleCr.slice(0, -1)
                : rawLineWithPossibleCr;
            let unknownRow: unknown;
            try {
                unknownRow = JSON.parse(rawLine);
            } catch {
                rememberRecordFailure(index, 'codex_request_identity_session_json_malformed');
                return;
            }
            if (!isRecord(unknownRow)) {
                rememberRecordFailure(index, 'codex_request_identity_session_record_invalid');
                return;
            }
            if (!firstVisitorFailure) {
                try {
                    visitor({ index, rawLine, row: unknownRow });
                } catch (error) {
                    firstVisitorFailure = {
                        index,
                        error: error instanceof Error
                            ? error : new Error('codex_request_identity_record_projection_failed'),
                    };
                }
            }
        };

        while (offset < opened.size) {
            const requested = Math.min(chunk.length, opened.size - offset);
            const read = fs.readSync(descriptor, chunk, 0, requested, offset);
            if (read === 0) {
                throw new Error('codex_request_identity_session_changed_during_read');
            }
            const bytes = chunk.subarray(0, read);
            digest.update(bytes);
            finalByte = bytes[bytes.length - 1];
            let cursor = 0;
            while (cursor < bytes.length) {
                const newline = bytes.indexOf(0x0a, cursor);
                if (newline < 0) {
                    const fragment = bytes.subarray(cursor);
                    lineBytes += fragment.length;
                    if (lineBytes > MAX_JSONL_RECORD_BYTES) {
                        rememberRecordFailure(recordCount, 'codex_request_identity_session_record_limit_exceeded');
                        lineFragments = [];
                        lineBytes = 0;
                    } else if (!firstRecordFailure) {
                        lineFragments.push(Buffer.from(fragment));
                    }
                    break;
                }
                processLine(bytes.subarray(cursor, newline));
                cursor = newline + 1;
            }
            offset += read;
        }

        const afterRead = fs.fstatSync(descriptor);
        let afterPath: fs.Stats;
        try {
            afterPath = fs.lstatSync(sessionFile);
        } catch {
            throw new Error('codex_request_identity_session_changed_during_read');
        }
        if (
            afterPath.isSymbolicLink()
            || !sameOpenedFile(opened, afterRead)
            || !sameOpenedFile(opened, afterPath)
        ) {
            throw new Error('codex_request_identity_session_changed_during_read');
        }
        if (finalByte !== 0x0a) {
            throw new Error('codex_request_identity_session_has_incomplete_final_line');
        }
        const firstFailure = firstRecordFailure && firstVisitorFailure
            ? (firstRecordFailure.index <= firstVisitorFailure.index
                ? firstRecordFailure.error : firstVisitorFailure.error)
            : firstRecordFailure?.error ?? firstVisitorFailure?.error;
        if (firstFailure) throw firstFailure;
        return { fileBytes: opened.size, recordCount, sha256: digest.digest('hex') };
    } finally {
        fs.closeSync(descriptor);
    }
}
