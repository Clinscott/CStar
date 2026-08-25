import fs from 'node:fs';
import path from 'node:path';
import { registry } from '../../pennyone/pathRegistry.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import {
    MCP_PROPOSAL_MAX_BYTES,
    MCP_SAFE_PROPOSAL_ID,
    readBoundedUtf8FileInside,
    resolveExistingPathInside,
} from '../contracts/runtime.js';

// cstar_evolve — read-only deterministic ops over proposals and SPRT ledger.
// Proposal generation and adversarial critique are LLM-driven and stay
// host-native; this surface only exposes file/ledger inspection.
type EvolveAction = 'list_proposals' | 'get_proposal' | 'list_sprt_history';
const MAX_PROPOSAL_DIRECTORY_ENTRIES = 5_000;

function listBoundedProposalEntries(directoryPath: string): fs.Dirent[] {
    const entries: fs.Dirent[] = [];
    const directory = fs.opendirSync(directoryPath);
    try {
        let entry: fs.Dirent | null;
        while ((entry = directory.readSync()) !== null) {
            if (entries.length >= MAX_PROPOSAL_DIRECTORY_ENTRIES) {
                throw new Error('evolve_proposal_directory_entry_limit_exceeded');
            }
            entries.push(entry);
        }
    } finally {
        directory.closeSync();
    }
    return entries;
}

export async function handleEvolve({
    action,
    proposal_id,
    limit,
}: {
    action: EvolveAction;
    proposal_id?: string;
    limit?: number;
}): Promise<McpTextResponse> {
    try {
        const root = registry.getRoot();
        const proposalDir = path.join(root, '.agents', 'proposals', 'evolve');

        if (action === 'list_proposals') {
            if (!fs.existsSync(proposalDir)) {
                return textResponse({ status: 'ok', count: 0, proposals: [] });
            }
            const safeProposalDir = resolveExistingPathInside(root, proposalDir, 'directory');
            const all = listBoundedProposalEntries(safeProposalDir)
                .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
                .map((entry) => {
                    const full = path.join(safeProposalDir, entry.name);
                    const mtime = fs.lstatSync(full).mtimeMs;
                    return { file: entry.name, full, mtime };
                })
                .sort((a, b) => b.mtime - a.mtime); // newest first

            const cap = Math.min(limit ?? 20, 50);
            const proposals = all.slice(0, cap).map(({ file, full }) => {
                let summary = '';
                let bead_id: string | undefined;
                let created_at: number | undefined;
                try {
                    const safe = readBoundedUtf8FileInside(safeProposalDir, full, MCP_PROPOSAL_MAX_BYTES);
                    const raw = JSON.parse(safe.content) as Record<string, unknown>;
                    summary = String(raw.summary ?? raw.rationale ?? '').slice(0, 240);
                    bead_id = typeof raw.bead_id === 'string' ? raw.bead_id : undefined;
                    created_at = typeof raw.created_at === 'number' ? raw.created_at : undefined;
                } catch {
                    // Malformed / unreadable — file-only entry.
                }
                return {
                    proposal_id: file.replace(/\.json$/, ''),
                    file,
                    summary,
                    bead_id,
                    created_at,
                };
            });
            return textResponse({ status: 'ok', count: all.length, proposals });
        }

        if (action === 'get_proposal') {
            if (!proposal_id) {
                return textResponse({ error: 'get_proposal requires proposal_id' }, true);
            }
            const bare = proposal_id.replace(/\.json$/, '');
            if (!MCP_SAFE_PROPOSAL_ID.test(bare)) {
                return textResponse(
                    { error: 'proposal_id must match [a-zA-Z0-9._-]+ (no path components)' },
                    true,
                );
            }
            const full = path.join(proposalDir, `${bare}.json`);
            if (!fs.existsSync(full)) {
                return textResponse({ error: `proposal not found: ${bare}` }, true);
            }
            const safe = readBoundedUtf8FileInside(proposalDir, full, MCP_PROPOSAL_MAX_BYTES);
            const raw = JSON.parse(safe.content) as Record<string, unknown>;
            return textResponse({
                status: 'ok',
                proposal_id: bare,
                size_bytes: safe.size,
                proposal: raw,
            });
        }

        if (action === 'list_sprt_history') {
            const ledgerPath = path.join(root, '.agents', 'sprt_ledger.json');
            if (!fs.existsSync(ledgerPath)) {
                return textResponse({ status: 'ok', count: 0, history: [] });
            }
            const safe = readBoundedUtf8FileInside(root, ledgerPath, MCP_PROPOSAL_MAX_BYTES);
            const raw = JSON.parse(safe.content) as { history?: unknown[] };
            const history = Array.isArray(raw.history) ? raw.history : [];
            const cap = Math.min(limit ?? 20, 100);
            return textResponse({
                status: 'ok',
                count: history.length,
                history: history.slice(-cap),
            });
        }

        return textResponse({ error: `invalid evolve action: ${action}` }, true);
    } catch (error) {
        return errorResponse(error);
    }
}
