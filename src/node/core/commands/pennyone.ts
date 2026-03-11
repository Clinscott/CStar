import { Command } from 'commander';
import chalk from 'chalk';

import { RuntimeDispatcher } from '../runtime/dispatcher.ts';
import { PennyOneWeavePayload, RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../runtime/contracts.ts';
import { resolveWorkspaceRoot, withCliWorkspaceTarget, type WorkspaceRootSource } from '../runtime/invocation.ts';

function renderResult(result: WeaveResult): void {
    if (result.status === 'FAILURE') {
        console.error(chalk.red(`\n[SYSTEM FAILURE]: ${result.error ?? 'Unknown runtime failure.'}`));
        return;
    }

    const printer = result.status === 'TRANSITIONAL' ? chalk.yellow : chalk.green;
    console.log(printer(`\n[ALFRED]: "${result.output}"`));
}

export function buildPennyOneInvocation(options: {
    scan?: string | boolean;
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
        .option('-v, --view', 'Spin up the 3D Gungnir Matrix visualization bridge')
        .option('-c, --clean', 'Purge the .stats/ directory and all archived sessions')
        .option('--stats', 'View long-term agent activity and logic loop analytics')
        .option('--search <query>', 'Search the Hall of Records by intent, path, or API endpoint')
        .option('--import <source>', 'Clone and project a public or local git repository into the estate gallery')
        .option('--slug <slug>', 'Override the imported repository slug')
        .option('--topology', 'Render the current estate topology summary')
        .action(async (options: {
            scan?: string | boolean;
            view?: boolean;
            clean?: boolean;
            stats?: boolean;
            search?: string;
            import?: string;
            slug?: string;
            topology?: boolean;
        }) => {
            const result = await dispatchPort.dispatch(buildPennyOneInvocation(options, resolveWorkspaceRoot(workspaceRootSource)));
            renderResult(result);
        });
}
