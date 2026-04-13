import { Command } from 'commander';
import { join } from 'node:path';
import { renderStandardCommandResult } from './command_context.js';
import { RuntimeDispatcher } from  '../runtime/dispatcher.js';
import { listHallPlanningSessions } from '../../../tools/pennyone/intel/database.js';
import type { HallPlanningSessionStatus } from '../../../types/hall.js';
import { buildPennyOneInvocation } from './pennyone.js';
import { buildRavensInvocation } from './ravens.js';
import { buildStartInvocation } from './start.js';
import {
    loadRegistryEntries,
    requiresTerminalExecution,
    resolveEntrySurface,
    resolveRegistryEntryForCommand,
    type EntrySurface,
} from '../runtime/entry_surface.js';
import { 
    type WeaveInvocation, 
    type ChantWeavePayload,
    type AutobotWeavePayload,
    type EvolveWeavePayload,
    type ArtifactForgeWeavePayload as ForgeWeavePayload,
    type PennyOneWeavePayload,
    type RavensWeavePayload,
    type StartWeavePayload,
    type RuntimeDispatchPort,
} from '../runtime/contracts.js';
import { resolveWorkspaceRoot, withCliWorkspaceTarget, type WorkspaceRootSource } from '../runtime/invocation.js';
import type { SkillBead } from '../skills/types.js';
const ACTIVE_CHANT_STATUSES: HallPlanningSessionStatus[] = [
    'INTENT_RECEIVED',
    'RESEARCH_PHASE',
    'PROPOSAL_REVIEW',
    'BEAD_CRITIQUE_LOOP',
    'BEAD_USER_REVIEW',
    'PLAN_CONCRETE',
    'FORGE_EXECUTION',
    'NEEDS_INPUT',
    'PLAN_READY',
    'ROUTED',
];

function lookupLatestActiveChantSessionId(projectRoot: string): string | undefined {
    const sessions = listHallPlanningSessions(projectRoot, { statuses: ACTIVE_CHANT_STATUSES })
        .filter((session) => session.skill_id === 'chant');
    return sessions[0]?.session_id;
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
): WeaveInvocation<StartWeavePayload | RavensWeavePayload | PennyOneWeavePayload | ChantWeavePayload | AutobotWeavePayload | EvolveWeavePayload | ForgeWeavePayload> {
    if (command.toLowerCase() === 'start') {
        const taskIndex = args.findIndex((arg) => arg === '--task');
        const ledgerIndex = args.findIndex((arg) => arg === '--ledger');
        const target = args.find((arg) => !arg.startsWith('-'));
        const task = taskIndex >= 0 && args[taskIndex + 1]
            ? args[taskIndex + 1]
            : args.filter((arg) => !arg.startsWith('-')).slice(1).join(' ');
        const ledger = ledgerIndex >= 0 && args[ledgerIndex + 1]
            ? args[ledgerIndex + 1]
            : join(projectRoot, 'ledger');

        return buildStartInvocation(target, {
            task,
            ledger,
            loki: args.includes('--loki'),
            debug: args.includes('--debug'),
            verbose: args.includes('--verbose') || args.includes('-v'),
        }, projectRoot);
    }

    if (command.toLowerCase() === 'ravens') {
        const action = ['start', 'sweep', 'cycle', 'stop', 'status']
            .includes(args[0]?.toLowerCase() ?? '')
            ? (args[0].toLowerCase() as 'start' | 'sweep' | 'cycle' | 'stop' | 'status')
            : 'status';
        const spokeIndex = args.findIndex((arg) => arg === '--spoke');
        return buildRavensInvocation(action, {
            shadowForge: args.includes('--shadow-forge'),
            spoke: spokeIndex >= 0 ? args[spokeIndex + 1] : undefined,
        }, projectRoot);
    }

    if (command.toLowerCase() === 'pennyone' || command.toLowerCase() === 'p1') {
        const [head, ...tail] = args;
        const lowered = head?.toLowerCase();
        if (lowered === 'search') {
            return buildPennyOneInvocation({ search: tail.join(' ') }, projectRoot);
        }
        if (lowered === 'stats') {
            return buildPennyOneInvocation({ stats: true }, projectRoot);
        }
        if (lowered === 'topology') {
            return buildPennyOneInvocation({ topology: true }, projectRoot);
        }
        if (lowered === 'view') {
            return buildPennyOneInvocation({ view: true }, projectRoot);
        }
        if (lowered === 'clean') {
            return buildPennyOneInvocation({ clean: true }, projectRoot);
        }
        if (lowered === 'status') {
            return buildPennyOneInvocation({ status: '.' }, projectRoot);
        }
        if (lowered === 'report') {
            return buildPennyOneInvocation({ report: '.' }, projectRoot);
        }
        if (lowered === 'normalize') {
            return buildPennyOneInvocation({ normalize: '.' }, projectRoot);
        }
        if (lowered === 'artifacts') {
            return buildPennyOneInvocation({ artifacts: '.' }, projectRoot);
        }
        if (lowered === 'refresh-intents') {
            return buildPennyOneInvocation({ refreshIntents: '.' }, projectRoot);
        }
        return buildPennyOneInvocation({ scan: '.' }, projectRoot);
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

    throw new Error(`No canonical runtime invocation exists for command '${command}'.`);
}

type RegistryCommandActivation =
    | { kind: 'none' }
    | { kind: 'blocked'; skillId: string; surface: EntrySurface; error: string }
    | { kind: 'skill'; bead: SkillBead<Record<string, unknown>> };

export function buildSurfaceBlockError(skillId: string, surface: EntrySurface): string {
    if (surface === 'host-only') {
        return `Capability '${skillId}' is host-only (entry_surface=host-only). Terminal dispatch is forbidden for this workflow; activate it through the host-native skill bridge.`;
    }
    return `Capability '${skillId}' is marked entry_surface=compatibility, but legacy compatibility command execution is disabled.`;
}

export function buildTerminalSkillBlockError(skillId: string, surface: EntrySurface): string {
    if (surface === 'cli') {
        return `Capability '${skillId}' is a skill. Terminal dispatch is forbidden for skills; activate it through the host-native skill bridge unless the capability explicitly requires terminal execution.`;
    }
    return buildSurfaceBlockError(skillId, surface);
}

export function resolveRegistryCommandActivation(
    command: string,
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): RegistryCommandActivation {
    const entries = loadRegistryEntries(projectRoot);
    const resolved = resolveRegistryEntryForCommand(entries, command);
    if (!resolved) {
        return { kind: 'none' };
    }

    const surface = resolveEntrySurface(resolved.entry, resolved.skillId);
    if (surface === 'cli' && requiresTerminalExecution(resolved.entry)) {
        return {
            kind: 'skill',
            bead: {
                id: `cli:${resolved.skillId}:${Date.now()}`,
                skill_id: resolved.skillId,
                target_path: projectRoot,
                intent: `CLI invocation for terminal-required skill ${resolved.skillId}: ${[command, ...args].join(' ').trim()}`.trim(),
                params: {
                    command: command.toLowerCase(),
                    args,
                    project_root: projectRoot,
                    cwd,
                    source: 'cli',
                    terminal_required: true,
                },
                status: 'PENDING',
                priority: 1,
            },
        };
    }

    return {
        kind: 'blocked',
        skillId: resolved.skillId,
        surface,
        error: buildTerminalSkillBlockError(resolved.skillId, surface),
    };
}

export function buildRegistrySkillBeadInvocation(
    command: string,
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): SkillBead<Record<string, unknown>> | null {
    const activation = resolveRegistryCommandActivation(command, args, projectRoot, cwd);
    return activation.kind === 'skill' ? activation.bead : null;
}

export function buildChantInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
    sessionId?: string,
    autoResume: boolean = true,
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

    if (!sessionId && autoResume) {
        sessionId = lookupLatestActiveChantSessionId(projectRoot);
    }

    if (sessionId && invocation.session) {
        invocation.session.session_id = sessionId;
    }

    return invocation;
}

export function buildHostNativeChantInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<ChantWeavePayload> {
    const directive = parseChantSessionDirective(args);
    return buildChantInvocation(
        directive.queryArgs,
        projectRoot,
        cwd,
        directive.sessionId,
        directive.shouldResume,
    );
}

export function buildAutobotInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<AutobotWeavePayload> {
    let beadId: string | undefined;
    let checkerShell: string | undefined;
    let timeout: number | undefined;
    let agentId: string | undefined;
    let workerNote: string | undefined;
    let source: 'runtime' | 'cli' = 'cli';
    const commandArgs: string[] = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--bead-id' && i + 1 < args.length) {
            beadId = args[++i];
        } else if (args[i] === '--checker-shell' && i + 1 < args.length) {
            checkerShell = args[++i];
        } else if (args[i] === '--timeout' && i + 1 < args.length) {
            const parsed = Number(args[++i]);
            timeout = Number.isFinite(parsed) ? parsed : undefined;
        } else if (args[i] === '--agent-id' && i + 1 < args.length) {
            agentId = args[++i];
        } else if (args[i] === '--worker-note' && i + 1 < args.length) {
            workerNote = args[++i];
        } else if (args[i] === '--source' && i + 1 < args.length) {
            const value = String(args[++i]).trim().toLowerCase();
            source = value === 'runtime' ? 'runtime' : 'cli';
        } else {
            commandArgs.push(args[i]);
        }
    }

    const payload: AutobotWeavePayload = {
        bead_id: beadId,
        project_root: projectRoot,
        cwd,
        source,
    };
    if (checkerShell) {
        payload.checker_shell = checkerShell;
    }
    if (timeout !== undefined) {
        payload.timeout = timeout;
    }
    if (agentId) {
        payload.agent_id = agentId;
    }
    if (workerNote) {
        payload.worker_note = workerNote;
    }
    if (commandArgs.length > 0) {
        payload.command_args = commandArgs;
    }

    return withCliWorkspaceTarget<AutobotWeavePayload>({
        weave_id: 'weave:autobot',
        payload,
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
        const activation = resolveRegistryCommandActivation(cmd, rawArgs, projectRoot, process.cwd());
        if (activation.kind === 'blocked') {
            console.error(activation.error);
            process.exit(1);
        }

        let invocation: SkillBead<unknown> | WeaveInvocation<unknown> | null = null;
        if (activation.kind === 'skill') {
            invocation = activation.bead;
        } else if (['autobot', 'evolve', 'forge'].includes(cmd.toLowerCase())) {
            invocation = buildDynamicCommandInvocation(cmd, rawArgs, projectRoot, process.cwd());
        }

        if (!invocation) {
            console.error(`Unknown command '${cmd}'. Legacy dynamic command execution is disabled.`);
            process.exit(1);
        }

        const result = await dispatchPort.dispatch(invocation);
        if (result.status === 'FAILURE') {
            console.error(result.error ?? `Unknown command '${cmd}'`);
            process.exit(1);
        }

        if (activation.kind === 'skill' || result.weave_id !== 'weave:dynamic-command') {
            renderStandardCommandResult(result, projectRoot);
        }
    });
}
