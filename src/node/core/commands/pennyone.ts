import { Command } from 'commander';

import { renderStandardCommandResult } from './command_context.js';
import { RuntimeDispatcher } from  '../runtime/dispatcher.js';
import { PennyOneWeavePayload, RuntimeDispatchPort, WeaveInvocation } from  '../runtime/contracts.js';
import { resolveWorkspaceRoot, withCliWorkspaceTarget, type WorkspaceRootSource } from  '../runtime/invocation.js';

export function buildPennyOneInvocation(options: {
    scan?: string | boolean;
    refreshIntents?: string | boolean;
    normalize?: string | boolean;
    report?: string | boolean;
    artifacts?: string | boolean;
    status?: string | boolean;
    kind?: 'normalize' | 'report' | 'maintenance';
    limit?: string;
    since?: string;
    sinceDate?: string;
    json?: boolean;
    estate?: boolean;
    view?: boolean;
    clean?: boolean;
    stats?: boolean;
    search?: string;
    import?: string;
    slug?: string;
    topology?: boolean;
}, workspaceRoot: string): WeaveInvocation<PennyOneWeavePayload> {
    if (options.import) {
        return withCliWorkspaceTarget({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'import',
                remote_url: options.import,
                slug: options.slug,
            },
        }, workspaceRoot);
    }

    if (options.topology) {
        return withCliWorkspaceTarget({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'topology',
            },
        }, workspaceRoot);
    }

    if (options.refreshIntents) {
        return withCliWorkspaceTarget({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'refresh_intents',
                path: typeof options.refreshIntents === 'string' ? options.refreshIntents : '.',
            },
        }, workspaceRoot);
    }

    if (options.normalize) {
        return withCliWorkspaceTarget({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'normalize',
                path: typeof options.normalize === 'string' ? options.normalize : '.',
                estate: options.estate ?? false,
            },
        }, workspaceRoot);
    }

    if (options.report) {
        return withCliWorkspaceTarget({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'report',
                path: typeof options.report === 'string' ? options.report : '.',
                estate: options.estate ?? false,
            },
        }, workspaceRoot);
    }

    if (options.artifacts) {
        const payload: PennyOneWeavePayload = {
            action: 'artifacts',
            path: typeof options.artifacts === 'string' ? options.artifacts : '.',
            estate: options.estate ?? false,
            artifact_kind: options.kind,
            limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
            since: options.since,
        };
        if (options.sinceDate) {
            payload.since_date = options.sinceDate;
        }
        return withCliWorkspaceTarget({
            weave_id: 'weave:pennyone',
            payload,
        }, workspaceRoot);
    }

    if (options.status) {
        const payload: PennyOneWeavePayload = {
            action: 'status',
            path: typeof options.status === 'string' ? options.status : '.',
            estate: options.estate ?? false,
            artifact_kind: options.kind,
            limit: options.limit ? Number.parseInt(options.limit, 10) : undefined,
            since: options.since,
        };
        if (options.sinceDate) {
            payload.since_date = options.sinceDate;
        }
        return withCliWorkspaceTarget({
            weave_id: 'weave:pennyone',
            payload,
        }, workspaceRoot);
    }

    if (options.search) {
        return withCliWorkspaceTarget({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'search',
                query: options.search,
                path: '.',
            },
        }, workspaceRoot);
    }

    if (options.stats) {
        return withCliWorkspaceTarget({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'stats',
            },
        }, workspaceRoot);
    }

    if (options.view) {
        return withCliWorkspaceTarget({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'view',
                path: typeof options.scan === 'string' ? options.scan : '.',
            },
        }, workspaceRoot);
    }

    if (options.clean) {
        return withCliWorkspaceTarget({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'clean',
                path: typeof options.scan === 'string' ? options.scan : '.',
                ghosts: true,
            },
        }, workspaceRoot);
    }

    return withCliWorkspaceTarget({
        weave_id: 'weave:pennyone',
        payload: {
            action: 'scan',
            path: typeof options.scan === 'string' ? options.scan : '.',
        },
    }, workspaceRoot);
}

/**
 * [GUNGNIR] PennyOne Command Spoke
 * Purpose: Authoritative shell for Operation PennyOne.
 */
export function registerPennyOneCommand(
    program: Command,
    workspaceRootSource: WorkspaceRootSource = process.cwd(),
    dispatchPort: RuntimeDispatchPort = RuntimeDispatcher.getInstance(),
) {
    program
        .command('pennyone')
        .alias('p1')
        .description('Operation PennyOne: 3D Neural Matrix & Repository Stats')
        .option('-s, --scan [path]', 'Scan the repository for stats and Gungnir scores', '.')
        .option('--refresh-intents [path]', 'Re-enrich Hall records that still carry the offline semantic-intent placeholder')
        .option('--normalize [path]', 'Backfill explicit Hall authority metadata for legacy beads, planning sessions, skill proposals, and documents')
        .option('--report [path]', 'Report recent Hall normalize receipts and current per-root Hall hygiene without mutating state')
        .option('--artifacts [path]', 'List recent PennyOne maintenance artifacts already recorded in Hall without recomputing them')
        .option('--status [path]', 'Return combined Hall hygiene status with latest receipts, reports, and maintenance artifacts')
        .option('--kind <kind>', 'Filter maintenance artifacts by kind: normalize, report, or maintenance')
        .option('--limit <count>', 'Limit listed maintenance artifacts per root')
        .option('--since <window>', 'Filter maintenance artifacts newer than a relative window such as 24h, 7d, or 30m')
        .option('--since-date <date>', 'Filter maintenance artifacts on or after an absolute UTC date in YYYY-MM-DD form')
        .option('--json', 'Emit machine-readable JSON instead of formatted text')
        .option('--estate', 'Apply the selected PennyOne maintenance action across every canonical Hall repository in the current estate database')
        .option('-v, --view', 'Spin up the 3D Gungnir Matrix visualization bridge')
        .option('-c, --clean', 'Purge the .stats/ directory and all archived sessions')
        .option('--stats', 'View long-term agent activity and logic loop analytics')
        .option('--search <query>', 'Search the Hall of Records by intent, path, or API endpoint')
        .option('--import <source>', 'Clone and project a public or local git repository into the estate gallery')
        .option('--slug <slug>', 'Override the imported repository slug')
        .option('--topology', 'Render the current estate topology summary')
        .action(async (options: {
            scan?: string | boolean;
            refreshIntents?: string | boolean;
            normalize?: string | boolean;
            report?: string | boolean;
            artifacts?: string | boolean;
            status?: string | boolean;
            kind?: 'normalize' | 'report' | 'maintenance';
            limit?: string;
            since?: string;
            sinceDate?: string;
            json?: boolean;
            estate?: boolean;
            view?: boolean;
            clean?: boolean;
            stats?: boolean;
            search?: string;
            import?: string;
            slug?: string;
            topology?: boolean;
        }) => {
            const workspaceRoot = resolveWorkspaceRoot(workspaceRootSource);
            const previousJsonOutput = process.env.CSTAR_JSON_OUTPUT;
            if (options.json) {
                process.env.CSTAR_JSON_OUTPUT = '1';
            }
            try {
                const result = await dispatchPort.dispatch(buildPennyOneInvocation(options, workspaceRoot));
                if (options.json) {
                    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
                    return;
                }
                renderStandardCommandResult(result, workspaceRoot);
            } finally {
                if (options.json) {
                    if (previousJsonOutput === undefined) {
                        delete process.env.CSTAR_JSON_OUTPUT;
                    } else {
                        process.env.CSTAR_JSON_OUTPUT = previousJsonOutput;
                    }
                }
            }
        });
}
