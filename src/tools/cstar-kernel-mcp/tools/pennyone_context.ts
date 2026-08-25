import path from 'node:path';
import { database } from '../../pennyone/intel/database.js';
import { registry } from '../../pennyone/pathRegistry.js';
import { errorResponse, mcpGuardrail, textResponse } from '../contracts/responses.js';

type PennyOneContextAction = 'status' | 'bead_summary' | 'validation_summary' | 'repository_summary';

export interface PennyOneContextArgs {
    action?: PennyOneContextAction;
    limit?: number;
    statuses?: string[];
    bead_id?: string;
}

const SAFE_COUNT_TABLES = [
    'hall_repositories',
    'hall_beads',
    'hall_validation_runs',
    'hall_episodic_memory',
    'hall_lessons',
    'hall_mounted_spokes',
    'hall_planning_sessions',
] as const;

function boundedLimit(value: unknown, fallback = 10, max = 50): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(Math.max(Math.trunc(value), 1), max);
}

function tableCount(root: string, table: string): number | null {
    try {
        const db = database.getReadDb(root);
        const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count?: number } | undefined;
        return typeof row?.count === 'number' ? row.count : null;
    } catch {
        return null;
    }
}

function compactValidationRun(run: any): Record<string, unknown> {
    return {
        validation_id: run.validation_id,
        bead_id: run.bead_id,
        verdict: run.verdict,
        validator: run.validator,
        created_at: run.created_at,
        summary: run.summary ?? run.notes,
    };
}

export async function handlePennyOneContext(args: PennyOneContextArgs = {}) {
    try {
        const action = args.action ?? 'status';
        const root = registry.getRoot();
        const dbPath = path.join(root, '.stats', 'pennyone.db');
        const guardrail = mcpGuardrail(
            'allow',
            'continue',
            'PennyOne context read is bounded to named Hall/PennyOne summaries; no arbitrary SQL is accepted.',
        );

        if (action === 'status') {
            const table_counts = Object.fromEntries(SAFE_COUNT_TABLES.map((table) => [table, tableCount(root, table)]));
            return textResponse({
                status: 'ok',
                action,
                source: 'pennyone_sqlite',
                root,
                db_path: dbPath,
                arbitrary_sql_allowed: false,
                table_counts,
                guardrail,
            });
        }

        if (action === 'bead_summary') {
            const limit = boundedLimit(args.limit);
            const beads = database.getHallBeads(root, args.statuses as any).slice(0, limit);
            return textResponse({
                status: 'ok',
                action,
                count: beads.length,
                result_limit: limit,
                beads: beads.map((bead: any) => ({
                    bead_id: bead.bead_id ?? bead.id,
                    status: bead.status,
                    target_kind: bead.target_kind,
                    target_ref: bead.target_ref,
                    assigned_agent: bead.assigned_agent,
                    resolved_validation_id: bead.resolved_validation_id,
                    rationale: bead.rationale,
                    updated_at: bead.updated_at,
                })),
                guardrail,
            });
        }

        if (action === 'validation_summary') {
            const limit = boundedLimit(args.limit);
            const runs = args.bead_id
                ? database.getValidationRuns(args.bead_id).slice(0, limit)
                : [];
            return textResponse({
                status: 'ok',
                action,
                bead_id: args.bead_id ?? null,
                count: runs.length,
                result_limit: limit,
                validations: runs.map(compactValidationRun),
                guardrail,
                next_action: args.bead_id
                    ? 'Use validation ids as bead evidence, not as standalone project memory.'
                    : 'Provide bead_id to retrieve bounded validation records.',
            });
        }

        if (action === 'repository_summary') {
            const repos = database.listHallRepositories(root);
            const spokes = database.listHallMountedSpokes(root);
            return textResponse({
                status: 'ok',
                action,
                repositories: repos.map((repo: any) => ({
                    repo_id: repo.repo_id,
                    root_path: repo.root_path,
                    name: repo.name,
                    status: repo.status,
                    updated_at: repo.updated_at,
                })),
                mounted_spokes: spokes.map((spoke: any) => ({
                    slug: spoke.slug,
                    root_path: spoke.root_path,
                    mount_status: spoke.mount_status,
                    trust_level: spoke.trust_level,
                    write_policy: spoke.write_policy,
                })),
                guardrail,
            });
        }

        return textResponse({ error: `Unsupported PennyOne context action: ${action}` }, true);
    } catch (error) {
        return errorResponse(error);
    }
}
