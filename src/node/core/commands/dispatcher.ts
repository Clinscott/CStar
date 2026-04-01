import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { renderStandardCommandResult } from './command_context.js';
import { RuntimeDispatcher } from  '../runtime/dispatcher.js';
import { 
    type WeaveInvocation, 
    type DynamicCommandPayload,
    type ChantWeavePayload,
    type AutobotWeavePayload,
    type EvolveWeavePayload,
    type ArtifactForgeWeavePayload as ForgeWeavePayload,
    type RuntimeDispatchPort,
} from '../runtime/contracts.js';
import { resolveWorkspaceRoot, withCliWorkspaceTarget, type WorkspaceRootSource } from '../runtime/invocation.js';
import type { SkillBead } from '../skills/types.js';

interface CommandRegistryEntry {
    execution?: {
        mode?: string;
    };
    runtime_trigger?: string;
}

interface CommandRegistryManifest {
    entries?: Record<string, CommandRegistryEntry>;
    skills?: Record<string, CommandRegistryEntry>;
}

function lookupLatestActiveChantSessionId(): string | undefined {
    // This would normally query the Hall database for the most recent incomplete session
    return undefined;
}

export function shouldAutoResumeChantSession(args: string[]): boolean {
    const filtered = args.filter((arg) => arg !== '--new-session').map((arg) => arg.trim().toLowerCase()).filter(Boolean);
    if (filtered.length !== 1) {
        return false;
    }

    return ['resume', 'proceed', 'continue', 'next'].includes(filtered[0]);
}

export function parseChantSessionDirective(args: string[]): { 
    queryArgs: string[]; 
    sessionId?: string; 
    shouldResume: boolean;
} {
    const queryArgs: string[] = [];
    let sessionId: string | undefined;
    let shouldResume = shouldAutoResumeChantSession(args);
    let forceNewSession = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--session' && i + 1 < args.length) {
            sessionId = args[++i];
            shouldResume = true;
        } else if (arg === '--resume') {
            shouldResume = true;
        } else if (arg === '--new-session') {
            forceNewSession = true;
        } else {
            queryArgs.push(arg);
        }
    }

    if (forceNewSession) {
        shouldResume = false;
        sessionId = undefined;
    }

    return {
        queryArgs,
        sessionId,
        shouldResume,
    };
}

export function buildDynamicCommandInvocation(
    command: string,
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<DynamicCommandPayload | ChantWeavePayload | AutobotWeavePayload | EvolveWeavePayload | ForgeWeavePayload> {
    if (command.toLowerCase() === 'chant') {
        const directive = parseChantSessionDirective(args);
        const sessionId = directive.sessionId ?? (directive.shouldResume ? lookupLatestActiveChantSessionId() : undefined);
        return buildChantInvocation(directive.queryArgs, projectRoot, cwd, sessionId);
    }
    if (command.toLowerCase() === 'autobot') {
        return buildAutobotInvocation(args, projectRoot, cwd);
    }
    if (command.toLowerCase() === 'evolve') {
        return buildEvolveInvocation(args, projectRoot, cwd);
    }
    if (command.toLowerCase() === 'forge') {
        return buildArtifactForgeInvocation(args, projectRoot, cwd);
    }

    return withCliWorkspaceTarget({
        weave_id: 'weave:dynamic-command',
        payload: {
            command: command.toLowerCase(),
            args,
            project_root: projectRoot,
            cwd,
        },
    }, projectRoot, cwd);
}

function loadRegistryEntries(projectRoot: string): Record<string, CommandRegistryEntry> {
    const manifestPath = path.join(projectRoot, '.agents', 'skill_registry.json');
    if (!fs.existsSync(manifestPath)) {
        return {};
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as CommandRegistryManifest;
        return manifest.entries ?? manifest.skills ?? {};
    } catch {
        return {};
    }
}

function resolveRegistrySkillIdForCommand(
    command: string,
    entries: Record<string, CommandRegistryEntry>,
): string | null {
    const normalized = command.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    if (entries[normalized]) {
        return normalized;
    }

    for (const [skillId, entry] of Object.entries(entries)) {
        if (String(entry.runtime_trigger ?? '').trim().toLowerCase() === normalized) {
            return skillId;
        }
    }
    return null;
}

export function buildRegistrySkillBeadInvocation(
    command: string,
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): SkillBead<Record<string, unknown>> | null {
    const entries = loadRegistryEntries(projectRoot);
    const skillId = resolveRegistrySkillIdForCommand(command, entries);
    if (!skillId) {
        return null;
    }

    return {
        id: `cli:${skillId}:${Date.now()}`,
        skill_id: skillId,
        target_path: projectRoot,
        intent: `CLI invocation for ${skillId}: ${[command, ...args].join(' ').trim()}`.trim(),
        params: {
            command: command.toLowerCase(),
            args,
            project_root: projectRoot,
            cwd,
            source: 'cli',
        },
        status: 'PENDING',
        priority: 1,
    };
}

export function buildChantInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
    sessionId?: string,
): WeaveInvocation<ChantWeavePayload> {
    const invocation = withCliWorkspaceTarget<ChantWeavePayload>({
        weave_id: 'weave:chant',
        payload: {
            query: args.join(' ').trim(),
            project_root: projectRoot,
            cwd,
            source: 'cli',
        },
    }, projectRoot, cwd);

    if (sessionId && invocation.session) {
        invocation.session.session_id = sessionId;
    }

    return invocation;
}

export function buildAutobotInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<AutobotWeavePayload> {
    let beadId: string | undefined;
    const commandArgs: string[] = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--bead-id' && i + 1 < args.length) {
            beadId = args[++i];
        } else {
            commandArgs.push(args[i]);
        }
    }

    return withCliWorkspaceTarget<AutobotWeavePayload>({
        weave_id: 'weave:autobot',
        payload: {
            bead_id: beadId,
            project_root: projectRoot,
            cwd,
            source: 'cli',
            command_args: commandArgs,
        },
    }, projectRoot, cwd);
}

export function buildEvolveInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<EvolveWeavePayload> {
    let action: 'propose' | 'promote' | undefined;
    let beadId: string | undefined;
    let proposalId: string | undefined;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === 'propose') action = 'propose';
        else if (args[i] === 'promote') action = 'promote';
        else if (args[i] === '--bead-id' && i + 1 < args.length) beadId = args[++i];
        else if (args[i] === '--proposal-id' && i + 1 < args.length) proposalId = args[++i];
    }

    return withCliWorkspaceTarget<EvolveWeavePayload>({
        weave_id: 'weave:evolve',
        payload: {
            action,
            bead_id: beadId,
            proposal_id: proposalId,
            project_root: projectRoot,
            cwd,
            source: 'cli',
        },
    }, projectRoot, cwd);
}

export function buildArtifactForgeInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<ForgeWeavePayload> {
    let beadId: string | undefined;
    let persona: string | undefined;
    let model: string | undefined;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--bead-id' && i + 1 < args.length) beadId = args[++i];
        else if (args[i] === '--persona' && i + 1 < args.length) persona = args[++i];
        else if (args[i] === '--model' && i + 1 < args.length) model = args[++i];
    }

    return withCliWorkspaceTarget<ForgeWeavePayload>({
        weave_id: 'weave:artifact-forge',
        payload: {
            bead_id: beadId,
            persona,
            model,
            project_root: projectRoot,
            cwd,
            source: 'cli',
        },
    }, projectRoot, cwd);
}

function extractUnknownCommandArgs(command: string, fallbackArgs: string[]): string[] {
    const argv = process.argv.slice(2);
    const commandIndex = argv.indexOf(command);
    if (commandIndex === -1) {
        return fallbackArgs;
    }
    return argv.slice(commandIndex + 1);
}

/**
 * [GUNGNIR] Dispatcher Spoke
 * Purpose: Thin shell for runtime-backed dynamic workflow and skill discovery.
 * @param program
 * @param projectRootSource
 * @param dispatchPort
 */
export function registerDispatcher(
    program: Command,
    projectRootSource: WorkspaceRootSource,
    dispatchPort: RuntimeDispatchPort = RuntimeDispatcher.getInstance(),
) {
    program.on('command:*', async (operands: string[]) => {
        const [cmd, ...args] = operands;
        const rawArgs = extractUnknownCommandArgs(cmd, args);
        const projectRoot = resolveWorkspaceRoot(projectRootSource);
        const skillBead = buildRegistrySkillBeadInvocation(cmd, rawArgs, projectRoot, process.cwd());
        const result = await dispatchPort.dispatch(
            skillBead ?? buildDynamicCommandInvocation(cmd, rawArgs, projectRoot, process.cwd()),
        );

        if (result.status === 'FAILURE') {
            console.error(result.error ?? `Unknown command '${cmd}'`);
            process.exit(1);
        }

        if (skillBead || result.weave_id !== 'weave:dynamic-command') {
            renderStandardCommandResult(result, projectRoot);
        }
    });
}
