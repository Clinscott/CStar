import chalk from 'chalk';
import { registry } from  '../pathRegistry.js';
import {
    getHallBeads,
    getHallFiles,
    getLatestHallScanId,
    listHallMountedSpokes,
    listHallPlanningSessions,
    listHallRepositories,
    listHallSkillProposals,
    searchIntents,
} from  '../intel/database.js';
import { HUD } from  '../../../node/core/hud.js';
import { createGungnirMatrix } from  '../../../types/gungnir.js';
import type { HallFileRecord } from  '../../../types/hall.js';

type HallContextHit = {
    kind: 'BEAD' | 'PLAN' | 'PROPOSAL';
    repoRoot: string;
    id: string;
    label: string;
    detail?: string;
    status?: string;
    targetPath?: string;
    score: number;
};

function getEstateRoots(workspaceRoot: string): string[] {
    const mounted = listHallMountedSpokes(workspaceRoot).map((entry) => entry.root_path);
    const known = listHallRepositories().map((entry) => entry.root_path);
    return Array.from(new Set([workspaceRoot, ...mounted, ...known].map((root) => registry.normalize(root))));
}

function getEstateHallFiles(workspaceRoot: string): HallFileRecord[] {
    const roots = getEstateRoots(workspaceRoot);
    const files: HallFileRecord[] = [];

    for (const root of roots) {
        files.push(...getHallFiles(root, getLatestHallScanId(root)));
    }

    return files;
}

function formatEstatePath(filePath: string, workspaceRoot: string): string {
    const mounted = listHallMountedSpokes(workspaceRoot);
    const normalized = registry.normalize(filePath);
    for (const entry of mounted) {
        const root = registry.normalize(entry.root_path);
        const prefix = root.endsWith('/') ? root : `${root}/`;
        if (normalized === root || normalized.startsWith(prefix)) {
            const relative = normalized.slice(prefix.length);
            return relative ? `spoke://${entry.slug}/${relative}` : `spoke://${entry.slug}/`;
        }
    }

    return registry.getRelative(filePath);
}

function formatEstateRoot(rootPath: string, workspaceRoot: string): string {
    const mounted = listHallMountedSpokes(workspaceRoot);
    const normalized = registry.normalize(rootPath);
    for (const entry of mounted) {
        const root = registry.normalize(entry.root_path);
        if (normalized === root) {
            return `spoke://${entry.slug}`;
        }
    }

    const relative = registry.getRelative(normalized);
    return relative === '.' ? pathTail(normalized) : relative;
}

function pathTail(value: string): string {
    const normalized = value.replace(/\/+$/, '');
    const tail = normalized.split('/').filter(Boolean).at(-1);
    return tail || normalized;
}

function formatTargetPath(targetPath: string | undefined, repoRoot: string, workspaceRoot: string): string | undefined {
    if (!targetPath) return undefined;
    if (targetPath.startsWith('/')) {
        return formatEstatePath(targetPath, workspaceRoot);
    }

    const normalizedRepo = registry.normalize(repoRoot);
    return formatEstatePath(`${normalizedRepo}/${targetPath.replace(/^\/+/, '')}`, workspaceRoot);
}

function scoreQueryMatch(rawQuery: string, queryTokens: string[], values: Array<string | undefined>): number {
    const normalizedQuery = rawQuery.trim().toLowerCase();
    const queryFragments = normalizedQuery
        .split(/\s+/g)
        .map((fragment) => fragment.trim())
        .filter((fragment) => fragment.length >= 3);
    const fields = values
        .filter(Boolean)
        .map((value) => value!.toLowerCase());

    if (fields.length === 0) return 0;

    const matchedTokens = new Set<string>();
    let score = 0;

    for (const field of fields) {
        if (normalizedQuery && field.includes(normalizedQuery)) {
            score = Math.max(score, 100 + normalizedQuery.length);
        }
        for (const token of queryTokens) {
            if (field.includes(token)) matchedTokens.add(token);
        }
    }

    const matchedFragments = queryFragments.filter((fragment) => fields.some((field) => field.includes(fragment)));
    if (score < 100 && queryFragments.length > 0 && matchedFragments.length === 0) {
        return 0;
    }

    const minimumTokenMatches = queryTokens.length >= 4
        ? 4
        : Math.max(1, queryTokens.length);

    if (score < 100 && matchedTokens.size < minimumTokenMatches) {
        return 0;
    }

    return score + matchedTokens.size;
}

function searchHallContext(query: string, workspaceRoot: string): HallContextHit[] {
    const queryTokens = query
        .toLowerCase()
        .split(/[^a-z0-9_]+/g)
        .map((token) => token.trim())
        .filter(Boolean);

    if (queryTokens.length === 0) return [];

    const hits: HallContextHit[] = [];

    for (const root of getEstateRoots(workspaceRoot)) {
        for (const bead of getHallBeads(root)) {
            const score = scoreQueryMatch(query, queryTokens, [
                bead.id,
                bead.target_path,
                bead.rationale,
                bead.acceptance_criteria,
                bead.architect_opinion,
            ]);
            if (score === 0) continue;
            hits.push({
                kind: 'BEAD',
                repoRoot: root,
                id: bead.id,
                label: bead.rationale,
                detail: bead.acceptance_criteria,
                status: bead.status,
                targetPath: bead.target_path,
                score,
            });
        }

        for (const session of listHallPlanningSessions(root)) {
            const score = scoreQueryMatch(query, queryTokens, [
                session.session_id,
                session.user_intent,
                session.normalized_intent,
                session.summary,
                session.current_bead_id,
                session.architect_opinion,
            ]);
            if (score === 0) continue;
            hits.push({
                kind: 'PLAN',
                repoRoot: root,
                id: session.session_id,
                label: session.summary ?? session.normalized_intent,
                detail: session.current_bead_id ? `Current bead: ${session.current_bead_id}` : session.user_intent,
                status: session.status,
                score,
            });
        }

        for (const proposal of listHallSkillProposals(root)) {
            const score = scoreQueryMatch(query, queryTokens, [
                proposal.proposal_id,
                proposal.bead_id,
                proposal.target_path,
                proposal.summary,
                proposal.promotion_note,
            ]);
            if (score === 0) continue;
            hits.push({
                kind: 'PROPOSAL',
                repoRoot: root,
                id: proposal.proposal_id,
                label: proposal.summary ?? proposal.proposal_id,
                detail: proposal.bead_id ? `Bead: ${proposal.bead_id}` : undefined,
                status: proposal.status,
                targetPath: proposal.target_path,
                score,
            });
        }
    }

    return hits.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

/**
 * Search matrix
 * @param {string} query - The search query
 * @param {string} _targetPath - Optional path to target
 * @returns {Promise<void>} The search results
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchMatrix(query: string, _targetPath: string = '.'): Promise<void> {
    const palette = HUD.palette;
    process.stdout.write(HUD.boxTop(`WELL OF MIMIR: SEARCHING "${query}"`));

    try {
        const hallFiles = getEstateHallFiles(registry.getRoot());
        const hallFileMap = new Map(hallFiles.map((record) => [registry.normalize(record.path), record]));

        // 1. Primary Path: High-Fidelity FTS5 Search
        const dbResults = searchIntents(query);

        if (dbResults.length > 0) {
            dbResults.forEach(r => {
                if (r.type === 'LORE') {
                    process.stdout.write(HUD.boxRow('📜 LORE', r.path, palette.mimir));
                    process.stdout.write(HUD.boxRow('  INTENT', (r.intent.slice(0, 40) + '...'), palette.void));
                    process.stdout.write(HUD.boxSeparator());
                    return;
                }
                if (r.type === 'DOC') {
                    process.stdout.write(HUD.boxRow('DOC', r.path, palette.mimir));
                    process.stdout.write(HUD.boxRow('  TITLE', (r.intent || '...').slice(0, 80) + (((r.intent || '').length > 80) ? '...' : ''), palette.void));
                    process.stdout.write(HUD.boxRow('  SUMMARY', (r.interaction_protocol || '...').slice(0, 80) + (((r.interaction_protocol || '').length > 80) ? '...' : ''), palette.void));
                    process.stdout.write(HUD.boxSeparator());
                    return;
                }

                const entry = hallFileMap.get(registry.normalize(r.path));
                const m = entry?.matrix ? createGungnirMatrix(entry.matrix) : createGungnirMatrix({});
                
                process.stdout.write(HUD.boxRow('◈ SECTOR', formatEstatePath(r.path, registry.getRoot()), palette.accent));
                process.stdout.write(HUD.boxRow('  SOVEREIGNTY', `${((m.sovereignty || 0) * 100).toFixed(0)}%`, HUD.progressBar(m.sovereignty || 0, 10) as any));
                process.stdout.write(HUD.boxRow('  INTENT', (r.intent || '...').slice(0, 40) + '...', palette.void));
                process.stdout.write(HUD.boxSeparator());
            });
            process.stdout.write(HUD.boxNote(palette.bifrost(`Found ${dbResults.length} high-fidelity sectors via FTS5.`)));
            process.stdout.write(HUD.boxBottom());
            return;
        }

        // 2. Fallback Path: Heuristic Hall Search (Structural)
        const results = [];
        const contextResults = searchHallContext(query, registry.getRoot());

        const lowerQuery = query.toLowerCase();

        for (const file of hallFiles) {
            const relPath = registry.getRelative(file.path);
            const intentText = file.intent_summary || '';
            const matchesIntent = intentText.toLowerCase().includes(lowerQuery);
            const matchesPath = relPath.toLowerCase().includes(lowerQuery);

            if (matchesIntent || matchesPath) {
                results.push(file);
            }
        }

        if (results.length === 0 && contextResults.length === 0) {
            process.stdout.write(HUD.boxRow('INFO', 'No matches found in the Hall of Records.', chalk.yellow));
            process.stdout.write(HUD.boxBottom());
            return;
        }

        results.forEach(r => {
            const m = r.matrix ? createGungnirMatrix(r.matrix) : createGungnirMatrix({});
            process.stdout.write(HUD.boxRow('◈ SECTOR', formatEstatePath(r.path, registry.getRoot()), chalk.blue));
            process.stdout.write(HUD.boxRow('  SOVEREIGNTY', `${((m.sovereignty || 0) * 100).toFixed(0)}%`, HUD.progressBar(m.sovereignty || 0, 10) as any));
            process.stdout.write(HUD.boxRow('  INTENT', (r.intent_summary || '...').slice(0, 40) + '...'));
            process.stdout.write(HUD.boxSeparator());
        });

        contextResults.forEach((result) => {
            process.stdout.write(HUD.boxRow(result.kind, `${formatEstateRoot(result.repoRoot, registry.getRoot())} :: ${result.id}`, palette.mimir));
            if (result.targetPath) {
                process.stdout.write(HUD.boxRow('  TARGET', formatTargetPath(result.targetPath, result.repoRoot, registry.getRoot()) ?? result.targetPath, palette.void));
            }
            if (result.status) {
                process.stdout.write(HUD.boxRow('  STATUS', result.status, palette.void));
            }
            process.stdout.write(HUD.boxRow('  SUMMARY', (result.label || '...').slice(0, 80) + (((result.label || '').length > 80) ? '...' : ''), palette.void));
            if (result.detail) {
                process.stdout.write(HUD.boxRow('  DETAIL', result.detail.slice(0, 80) + (result.detail.length > 80 ? '...' : ''), palette.void));
            }
            process.stdout.write(HUD.boxSeparator());
        });

        const totalHits = results.length + contextResults.length;
        process.stdout.write(HUD.boxNote(`Found ${totalHits} Hall matches via heuristic scan.`));
        process.stdout.write(HUD.boxBottom());

    } catch (err) {
        process.stdout.write(HUD.boxRow('ERROR', 'Hall of Records currently inaccessible.', chalk.red));
        process.stdout.write(HUD.boxBottom());
    }
}

/**
 * CLI entry point for testing
 */
if (typeof process.argv[1] === 'string' && process.argv[1].includes('search')) {
    const q = process.argv.slice(2).join(' ');
    if (q) searchMatrix(q);
}
