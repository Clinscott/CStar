import path from 'node:path';

import type { Command } from 'commander';

import { registry } from '../../tools/pennyone/pathRegistry.ts';

function readRootArg(argv: string[]): string | undefined {
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if ((token === '--root' || token === '-r') && argv[index + 1]) {
            return argv[index + 1];
        }
        if (token.startsWith('--root=')) {
            return token.slice('--root='.length);
        }
    }
    return undefined;
}

export function getLaunchCwd(): string {
    return path.resolve(process.env.CSTAR_LAUNCH_CWD ?? process.cwd());
}

export function resolveWorkspaceSelection(
    rootOption: string | undefined,
    launchCwd: string = getLaunchCwd(),
): string {
    const candidate = rootOption ? path.resolve(launchCwd, rootOption) : launchCwd;
    return registry.detectWorkspaceRoot(candidate);
}

export function selectWorkspaceRoot(argv: string[], launchCwd: string = getLaunchCwd()): string {
    const resolvedRoot = resolveWorkspaceSelection(readRootArg(argv), launchCwd);
    registry.setRoot(resolvedRoot);
    process.env.CSTAR_WORKSPACE_ROOT = resolvedRoot;
    return resolvedRoot;
}

export function installWorkspaceSelectionHook(
    program: Command,
    launchCwd: string = getLaunchCwd(),
): void {
    program.hook('preAction', (_command, actionCommand) => {
        const options = actionCommand.optsWithGlobals() as { root?: string };
        const resolvedRoot = resolveWorkspaceSelection(options.root, launchCwd);
        registry.setRoot(resolvedRoot);
        process.env.CSTAR_WORKSPACE_ROOT = resolvedRoot;
    });
}
