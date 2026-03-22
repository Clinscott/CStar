import { database } from  '../../../tools/pennyone/intel/database.js';
import type { HallPlanningSessionRecord } from  '../../../types/hall.js';
import { buildSkeletonContext } from  './ast_slicer.js';

export const deps = {
    database,
    buildSkeletonContext,
};

const AUTOBOT_SECTION_LIMIT = 220;
const AUTOBOT_ACCEPTANCE_LIMIT = 420;
const AUTOBOT_NOTE_LIMIT = 2_200;
const CHECKER_COMMAND_RE = /`([^`\n]+)`/g;

function compactText(value: string | undefined, limit: number = AUTOBOT_SECTION_LIMIT): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return undefined;
    }

    if (normalized.length <= limit) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function compactJson(value: unknown, limit: number = AUTOBOT_SECTION_LIMIT): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    try {
        return compactText(JSON.stringify(value), limit);
    } catch {
        return undefined;
    }
}

function pushSection(lines: string[], label: string, value: string | undefined): void {
    if (value) {
        lines.push(`${label}: ${value}`);
    }
}

function finalizeAutobotNote(lines: string[]): string {
    const normalized = lines
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .join('\n');
    if (normalized.length <= AUTOBOT_NOTE_LIMIT) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, AUTOBOT_NOTE_LIMIT - 1)).trimEnd()}…`;
}

function getSessionStringMetadata(
    session: HallPlanningSessionRecord | null,
    keys: string[],
): string | undefined {
    const metadata = session?.metadata;
    if (!metadata) {
        return undefined;
    }

    for (const key of keys) {
        const value = metadata[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return undefined;
}

function isProbableShellCommand(candidate: string): boolean {
    const trimmed = candidate.trim();
    if (!trimmed.includes(' ')) {
        return false;
    }

    const [firstToken] = trimmed.split(/\s+/, 1);
    return /^[./A-Za-z0-9_-]+$/.test(firstToken ?? '');
}

function extractCheckerShellFromAcceptanceCriteria(acceptanceCriteria: string | undefined): string | undefined {
    if (!acceptanceCriteria) {
        return undefined;
    }

    const matches = Array.from(acceptanceCriteria.matchAll(CHECKER_COMMAND_RE))
        .map((match) => match[1]?.trim())
        .filter((value): value is string => Boolean(value))
        .filter((value) => isProbableShellCommand(value));

    const uniqueMatches = Array.from(new Set(matches));
    return uniqueMatches.length === 1 ? uniqueMatches[0] : undefined;
}

export function resolveAutobotBeadId(
    workspaceRoot: string,
    session: HallPlanningSessionRecord | null,
): string | undefined {
    const currentBeadId = session?.current_bead_id?.trim();
    if (currentBeadId) {
        return currentBeadId;
    }

    const isExecutable = (bead: { target_path?: string; target_ref?: string; acceptance_criteria?: string }) =>
        Boolean((bead.target_path || bead.target_ref) && bead.acceptance_criteria);

    const candidates = deps.database.getHallBeads(workspaceRoot);

    return candidates.find((bead) => bead.status === 'IN_PROGRESS' && isExecutable(bead))?.id
        ?? candidates.find((bead) => bead.status === 'SET' && isExecutable(bead))?.id
        ?? candidates.find((bead) => bead.status === 'OPEN' && isExecutable(bead))?.id;
}

export function buildAutobotWorkerNote(
    workspaceRoot: string,
    beadId: string,
    session: HallPlanningSessionRecord | null,
): string {
    const bead = deps.database.getHallBeads(workspaceRoot).find((candidate) => candidate.id === beadId);
    const fileIntel = bead?.target_path
        ? deps.database.getHallFile(bead.target_path, workspaceRoot, bead.scan_id || undefined)
        : null;
    const checkerShell = resolveAutobotCheckerShell(workspaceRoot, beadId, session);
    const focusHint = typeof bead?.critique_payload?.focus_hint === 'string' && bead.critique_payload.focus_hint.trim()
        ? bead.critique_payload.focus_hint.trim()
        : undefined;
    const lines = [
        focusHint
            ? 'Local SovereignWorker micro-bead. Start from the focus hint below and avoid whole-file inspection unless the target file forces it.'
            : 'Local SovereignWorker micro-bead. Use only the context below unless the target file forces direct adjacent inspection.',
        'Do not invent imports, dependencies, commands, or files. If something is not already present or directly verified in the repo, do not rely on it.',
        'CRITICAL: Before running the full checker_shell, you MUST run a fast syntax check (e.g. `npx tsc --noEmit` or `node --check file.js`) to avoid filling your context window with massive stack traces.',
        'CRITICAL: If a file is large, DO NOT read the entire file at once. Use tools like `grep -n`, `head`, `tail`, or `sed -n` to read only the relevant functions.',
    ];

    const targetSymbol = bead?.critique_payload?.target_symbol;
    const skeleton = bead?.target_path 
        ? deps.buildSkeletonContext(workspaceRoot, bead.target_path, typeof targetSymbol === 'string' ? targetSymbol : undefined)
        : undefined;

    pushSection(lines, 'Active bead', beadId);
    pushSection(lines, 'Target path', compactText(bead?.target_path ?? bead?.target_ref));
    pushSection(lines, 'Target skeleton', skeleton ?? undefined);
    pushSection(lines, 'Focus hint', compactText(focusHint, AUTOBOT_ACCEPTANCE_LIMIT));
    pushSection(lines, 'Checker shell', compactText(checkerShell));
    pushSection(lines, 'Contract refs', compactText(bead?.contract_refs.join(', ')));
    pushSection(lines, 'Bead rationale', compactText(bead?.rationale));
    pushSection(lines, 'Acceptance criteria', compactText(bead?.acceptance_criteria, AUTOBOT_ACCEPTANCE_LIMIT));
    pushSection(lines, 'Target file role', compactText(fileIntel?.intent_summary));
    pushSection(lines, 'Target file interactions', compactText(fileIntel?.interaction_summary));
    pushSection(lines, 'Baseline scores', compactJson(bead?.baseline_scores, 180));

    return finalizeAutobotNote(lines);
}

export function resolveAutobotCheckerShell(
    workspaceRoot: string,
    beadId: string,
    session: HallPlanningSessionRecord | null,
): string | undefined {
    const explicitCheckerShell = getSessionStringMetadata(session, ['checker_shell']);
    if (explicitCheckerShell) {
        return explicitCheckerShell;
    }

    const bead = deps.database.getHallBeads(workspaceRoot).find((candidate) => candidate.id === beadId);
    if (bead?.checker_shell?.trim()) {
        return bead.checker_shell.trim();
    }
    return extractCheckerShellFromAcceptanceCriteria(bead?.acceptance_criteria);
}
