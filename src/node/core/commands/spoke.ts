import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

import { resolveWorkspaceRoot, type WorkspaceRootSource } from  '../runtime/invocation.js';
import { StateRegistry } from  '../state.js';
import {
    getHallRepository,
    listHallMountedSpokes,
    removeHallMountedSpoke,
    saveHallMountedSpoke,
} from '../../../tools/pennyone/intel/database.ts';
import { registry } from  '../../../tools/pennyone/pathRegistry.js';

function normalizeSlug(input: string): string {
    return input.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

export function registerSpokeCommand(program: Command, projectRootSource: WorkspaceRootSource): void {
    const spoke = program
        .command('spoke')
        .description('Manage mounted estate spokes');

    spoke
        .command('link <slug> <rootPath>')
        .description('Link a mounted spoke into the Hall-backed estate model')
        .option('--kind <kind>', 'Mounted spoke kind', 'local')
        .option('--remote-url <url>', 'Remote git URL for imported or mirrored spokes')
        .option('--branch <branch>', 'Default branch for git-backed spokes', 'main')
        .option('--trust <trust>', 'Trust policy (trusted, observe, quarantined)', 'trusted')
        .option('--write-policy <policy>', 'Write policy (read_write, read_only)', 'read_only')
        .action((slug: string, rootPath: string, options: Record<string, string>) => {
            const workspaceRoot = resolveWorkspaceRoot(projectRootSource);
            registry.setRoot(workspaceRoot);

            const normalizedSlug = normalizeSlug(slug);
            const absolutePath = path.resolve(rootPath);
            if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
                console.error(chalk.red(`Mounted spoke path does not exist or is not a directory: ${absolutePath}`));
                process.exit(1);
            }

            StateRegistry.save(StateRegistry.get());
            const repo = getHallRepository(workspaceRoot);
            if (!repo) {
                console.error(chalk.red('Failed to materialize the Hall repository before linking the spoke.'));
                process.exit(1);
            }

            saveHallMountedSpoke({
                spoke_id: `spoke:${normalizedSlug}`,
                repo_id: repo.repo_id,
                slug: normalizedSlug,
                kind: (options.kind as 'local' | 'git' | 'mirror' | 'archive') ?? 'local',
                root_path: registry.detectWorkspaceRoot(absolutePath),
                remote_url: options.remoteUrl,
                default_branch: options.branch,
                mount_status: 'active',
                trust_level: (options.trust as 'trusted' | 'observe' | 'quarantined') ?? 'trusted',
                write_policy: (options.writePolicy as 'read_write' | 'read_only') ?? 'read_only',
                projection_status: 'missing',
                created_at: Date.now(),
                updated_at: Date.now(),
                metadata: {
                    source: 'spoke-command',
                },
            });

            StateRegistry.save(StateRegistry.get());
            console.log(chalk.green(`Mounted spoke '${normalizedSlug}' linked to ${registry.detectWorkspaceRoot(absolutePath)}.`));
        });

    spoke
        .command('unlink <slug>')
        .description('Remove a mounted spoke from the Hall-backed estate model')
        .action((slug: string) => {
            const workspaceRoot = resolveWorkspaceRoot(projectRootSource);
            registry.setRoot(workspaceRoot);

            const removed = removeHallMountedSpoke(normalizeSlug(slug), workspaceRoot);
            if (!removed) {
                console.error(chalk.red(`Mounted spoke '${slug}' is not registered.`));
                process.exit(1);
            }

            StateRegistry.save(StateRegistry.get());
            console.log(chalk.yellow(`Mounted spoke '${normalizeSlug(slug)}' removed from the estate.`));
        });

    spoke
        .command('list')
        .description('List Hall-backed mounted spokes for the active estate')
        .action(() => {
            const workspaceRoot = resolveWorkspaceRoot(projectRootSource);
            registry.setRoot(workspaceRoot);
            const mounted = listHallMountedSpokes(workspaceRoot);

            if (mounted.length === 0) {
                console.log(chalk.dim('No mounted spokes are currently registered.'));
                return;
            }

            console.log(chalk.cyan('\n ◤ ESTATE SPOKES ◢ '));
            console.log(chalk.dim('━'.repeat(60)));
            for (const entry of mounted) {
                console.log(`${chalk.bold(entry.slug.padEnd(16))} ${chalk.green(entry.mount_status.padEnd(12))} ${chalk.blue(entry.root_path)}`);
            }
            console.log(chalk.dim('━'.repeat(60)));
        });
}
