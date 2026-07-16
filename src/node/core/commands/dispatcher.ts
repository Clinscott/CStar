import type { Command } from 'commander';
import {
    loadRegistryEntries,
    resolveEntrySurface,
    resolveRegistryEntryForCommand,
    type EntrySurface,
} from '../runtime/entry_surface.js';
import type {
    ArtifactForgeWeavePayload as ForgeWeavePayload,
    ChantWeavePayload,
    EvolveWeavePayload,
    RuntimeDispatchPort,
    WeaveInvocation,
} from '../runtime/contracts.js';
import { withCliWorkspaceTarget, type WorkspaceRootSource } from '../runtime/invocation.js';
import type { SkillBead } from '../skills/types.js';

export const LEGACY_DYNAMIC_COMMAND_ERROR =
    'legacy_dynamic_command_retired_use_cstar_kernel';

export function shouldAutoResumeChantSession(args: string[]): boolean {
    const filtered = args
        .filter((arg) => arg !== '--new-session')
        .map((arg) => arg.trim().toLowerCase())
        .filter(Boolean);
    return filtered.length === 1 && ['resume', 'proceed', 'continue', 'next'].includes(filtered[0]);
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

    return forceNewSession
        ? { queryArgs, sessionId: undefined, shouldResume: false }
        : { queryArgs, sessionId, shouldResume };
}

function rejectLegacyDynamicCommand(command: string): never {
    const normalized = command.trim().toLowerCase();
    throw new Error(
        `Legacy dynamic command '${normalized}' is retired; use cstar-kernel MCP (${LEGACY_DYNAMIC_COMMAND_ERROR}).`,
    );
}

export function buildDynamicCommandInvocation(
    command: string,
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<unknown> {
    void args;
    void projectRoot;
    void cwd;
    return rejectLegacyDynamicCommand(command);
}

type RegistryCommandActivation =
    | { kind: 'none' }
    | { kind: 'blocked'; skillId: string; surface: EntrySurface; error: string }
    | { kind: 'skill'; bead: SkillBead<Record<string, unknown>> };

export function buildSurfaceBlockError(skillId: string, surface: EntrySurface): string {
    if (surface === 'host-only') {
        return `Capability '${skillId}' is host-only (entry_surface=host-only). Terminal dispatch is forbidden; use the active host conversation.`;
    }
    if (surface === 'compatibility') {
        return `Capability '${skillId}' is retired compatibility surface; use cstar-kernel MCP.`;
    }
    return `Capability '${skillId}' has no authorized dynamic CLI execution surface. Terminal dispatch is forbidden for skills.`;
}

export function buildTerminalSkillBlockError(skillId: string, surface: EntrySurface): string {
    return buildSurfaceBlockError(skillId, surface);
}

export function resolveRegistryCommandActivation(
    command: string,
    _args: string[],
    projectRoot: string,
    _cwd: string = process.cwd(),
): RegistryCommandActivation {
    const resolved = resolveRegistryEntryForCommand(loadRegistryEntries(projectRoot), command);
    if (!resolved) return { kind: 'none' };

    const surface = resolveEntrySurface(resolved.entry, resolved.skillId);
    return {
        kind: 'blocked',
        skillId: resolved.skillId,
        surface,
        error: buildTerminalSkillBlockError(resolved.skillId, surface),
    };
}

export function buildRegistrySkillBeadInvocation(
    _command: string,
    _args: string[],
    _projectRoot: string,
    _cwd: string = process.cwd(),
): SkillBead<Record<string, unknown>> | null {
    return null;
}

export function buildChantInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
    sessionId?: string,
    _autoResume: boolean = true,
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
    if (sessionId && invocation.session) invocation.session.session_id = sessionId;
    return invocation;
}

export function buildHostNativeChantInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<ChantWeavePayload> {
    const directive = parseChantSessionDirective(args);
    return buildChantInvocation(directive.queryArgs, projectRoot, cwd, directive.sessionId, false);
}

export function buildEvolveInvocation(
    _args: string[],
    _projectRoot: string,
    _cwd: string = process.cwd(),
): WeaveInvocation<EvolveWeavePayload> {
    return rejectLegacyDynamicCommand('evolve');
}

export function buildArtifactForgeInvocation(
    _args: string[],
    _projectRoot: string,
    _cwd: string = process.cwd(),
): WeaveInvocation<ForgeWeavePayload> {
    return rejectLegacyDynamicCommand('forge');
}

export function registerDispatcher(
    program: Command,
    _projectRootSource: WorkspaceRootSource,
    _dispatchPort?: RuntimeDispatchPort,
): void {
    program.on('command:*', (operands: string[]) => {
        const command = String(operands[0] ?? '').trim().toLowerCase();
        if (['evolve', 'forge', 'orchestrate'].includes(command)) {
            console.error(`Legacy dynamic command '${command}' is retired; use cstar-kernel MCP (${LEGACY_DYNAMIC_COMMAND_ERROR}).`);
        } else {
            console.error(`Unknown command '${command}'. Dynamic runtime execution is disabled.`);
        }
        process.exitCode = 1;
    });
}
