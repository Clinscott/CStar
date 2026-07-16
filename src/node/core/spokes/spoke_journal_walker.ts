import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readBoundedUtf8FileInside } from '../../../tools/cstar-kernel-mcp/contracts/runtime.js';
import { database } from '../../../tools/pennyone/intel/database.js';
import type { HallMountedSpokeRecord } from '../../../types/hall.js';
import { verifyMountToken } from './spoke_authority.js';

export type SpokeJournalFileValidation = 'ok' | 'invalid' | 'missing' | 'drift';
export type SpokeJournalValidation =
    | 'ok'
    | 'mount_status_drift'
    | 'mount_binding_unverified'
    | 'spoke_not_found';

export interface SpokeJournalFile {
    present: boolean;
    path: string;
    mtime?: number;
    sha256?: string;
    size_bytes?: number;
    summary?: string;
    validation: SpokeJournalFileValidation;
    validation_reason?: string;
    drift_paths?: string[];
    open_tasks?: number;
    prominent_functions?: string[];
    last_entry_timestamp?: string;
}

export interface SpokeJournalReport {
    spoke: string;
    root_sha256: string;
    files: {
        memory_md: SpokeJournalFile;
        tasks_md: SpokeJournalFile;
        wireframe_md: SpokeJournalFile;
        dev_journal_md: SpokeJournalFile;
    };
    validation: SpokeJournalValidation;
}

interface FileStatSummary {
    mtime: number;
    sha256: string;
    size_bytes: number;
    content: string;
}

const MAX_JOURNAL_BYTES = 256 * 1024;
const MEMORY_PRIMARY = '.agent/memory.md';
const MEMORY_FALLBACK = '.agents/memory.md';

function rootFingerprint(root: string): string {
    return createHash('sha256').update(path.resolve(root), 'utf-8').digest('hex');
}

function hallMountToken(spoke: HallMountedSpokeRecord): string | null {
    const authority = spoke.metadata?.authority;
    if (!authority || typeof authority !== 'object' || Array.isArray(authority)) return null;
    const token = (authority as Record<string, unknown>).mount_token;
    return typeof token === 'string' ? token : null;
}

function readFileStat(root: string, relativePath: string): FileStatSummary | null {
    try {
        const file = readBoundedUtf8FileInside(root, path.join(root, relativePath), MAX_JOURNAL_BYTES);
        return {
            mtime: Math.floor(file.mtimeMs / 1000),
            sha256: createHash('sha256').update(file.content).digest('hex'),
            size_bytes: file.size,
            content: file.content,
        };
    } catch {
        return null;
    }
}

function extractFirstH1(content: string): string | undefined {
    for (const line of content.split(/\r?\n/)) {
        const match = /^#\s+(.+)$/.exec(line);
        if (match) return match[1].trim();
    }
    return undefined;
}

function makeMemorySummary(content: string): string | undefined {
    const heading = extractFirstH1(content);
    if (!heading) return undefined;
    const lines = content.split(/\r?\n/);
    const paragraph: string[] = [];
    let afterHeading = false;
    for (const line of lines) {
        if (!afterHeading) {
            if (/^#\s+/.test(line)) afterHeading = true;
            continue;
        }
        if (!line.trim()) {
            if (paragraph.length > 0) break;
            continue;
        }
        if (/^#+\s+/.test(line)) {
            if (paragraph.length > 0) break;
            continue;
        }
        paragraph.push(line.trim());
    }
    const summary = paragraph.length > 0 ? `${heading} — ${paragraph.join(' ')}` : heading;
    return summary.length <= 280 ? summary : `${summary.slice(0, 277)}...`;
}

function countOpenTasks(content: string): number {
    return content.match(/^- \[ \]/gm)?.length ?? 0;
}

function extractProminentFunctions(content: string): string[] {
    const output: string[] = [];
    let inSection = false;
    for (const line of content.split(/\r?\n/)) {
        if (/^#{2,3}\s+Prominent Functions/i.test(line)) {
            inSection = true;
            continue;
        }
        if (inSection && /^#{1,3}\s+/.test(line)) break;
        if (!inSection) continue;
        const match = /^-\s+`([^`]+)`/.exec(line);
        if (match) output.push(match[1]);
    }
    return output;
}

function findLastEntryTimestamp(content: string): string | undefined {
    const matches = content.match(/\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?Z?)?\b/g);
    return matches?.sort().at(-1);
}

function readMemoryFile(root: string): SpokeJournalFile {
    const primary = readFileStat(root, MEMORY_PRIMARY);
    const fallback = readFileStat(root, MEMORY_FALLBACK);
    const selected = primary ?? fallback;
    const selectedPath = primary ? MEMORY_PRIMARY : MEMORY_FALLBACK;
    if (!selected) return { present: false, path: MEMORY_PRIMARY, validation: 'missing' };
    const result: SpokeJournalFile = {
        present: true,
        path: selectedPath,
        mtime: selected.mtime,
        sha256: selected.sha256,
        size_bytes: selected.size_bytes,
        summary: makeMemorySummary(selected.content),
        validation: 'ok',
    };
    if (primary && fallback) {
        result.validation = 'drift';
        result.validation_reason = 'both memory conventions exist; spoke must select one';
        result.drift_paths = [MEMORY_PRIMARY, MEMORY_FALLBACK];
    }
    return result;
}

function readSimpleFile(
    root: string,
    relativePath: string,
    enrich?: (content: string, file: SpokeJournalFile) => void,
): SpokeJournalFile {
    const stat = readFileStat(root, relativePath);
    if (!stat) return { present: false, path: relativePath, validation: 'missing' };
    const file: SpokeJournalFile = {
        present: true,
        path: relativePath,
        mtime: stat.mtime,
        sha256: stat.sha256,
        size_bytes: stat.size_bytes,
        summary: extractFirstH1(stat.content),
        validation: 'ok',
    };
    enrich?.(stat.content, file);
    return file;
}

function missingReport(slug: string, root: string, validation: SpokeJournalValidation): SpokeJournalReport {
    const missing = (pathValue: string): SpokeJournalFile => ({ present: false, path: pathValue, validation: 'missing' });
    return {
        spoke: slug,
        root_sha256: rootFingerprint(root),
        files: {
            memory_md: missing(MEMORY_PRIMARY),
            tasks_md: missing('tasks.md'),
            wireframe_md: missing('wireframe.md'),
            dev_journal_md: missing('DEV_JOURNAL.md'),
        },
        validation,
    };
}

export function walkSpokeJournalForRecord(spoke: HallMountedSpokeRecord): SpokeJournalReport {
    if (spoke.mount_status !== 'active') return missingReport(spoke.slug, spoke.root_path, 'mount_status_drift');
    const binding = verifyMountToken(spoke.root_path, hallMountToken(spoke));
    if (binding.verdict !== 'ok') return missingReport(spoke.slug, spoke.root_path, 'mount_binding_unverified');
    let root: string;
    try {
        root = fs.realpathSync(spoke.root_path);
    } catch {
        return missingReport(spoke.slug, spoke.root_path, 'mount_binding_unverified');
    }
    return {
        spoke: spoke.slug,
        root_sha256: binding.root_sha256,
        files: {
            memory_md: readMemoryFile(root),
            tasks_md: readSimpleFile(root, 'tasks.md', (content, file) => { file.open_tasks = countOpenTasks(content); }),
            wireframe_md: readSimpleFile(root, 'wireframe.md', (content, file) => {
                file.prominent_functions = extractProminentFunctions(content);
            }),
            dev_journal_md: readSimpleFile(root, 'DEV_JOURNAL.md', (content, file) => {
                file.last_entry_timestamp = findLastEntryTimestamp(content);
            }),
        },
        validation: 'ok',
    };
}

export function walkSpokeJournal(spokeSlug: string): SpokeJournalReport {
    const spoke = database.getHallMountedSpoke(spokeSlug);
    return spoke
        ? walkSpokeJournalForRecord(spoke)
        : missingReport(spokeSlug, '', 'spoke_not_found');
}

export const __journalTesting = {
    extractFirstH1,
    makeMemorySummary,
    countOpenTasks,
    extractProminentFunctions,
    findLastEntryTimestamp,
    readMemoryFile,
};
