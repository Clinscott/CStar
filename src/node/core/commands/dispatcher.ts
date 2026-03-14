import { getDb } from '../../../tools/pennyone/intel/database.ts';
import { Command } from 'commander';
import { RuntimeDispatcher } from '../runtime/dispatcher.ts';
import {
    ChantWeavePayload,
    DynamicCommandPayload,
    EvolveWeavePayload,
    RuntimeDispatchPort,
    TaliesinForgeWeavePayload,
    WeaveInvocation,
} from '../runtime/contracts.ts';
import { buildCliSession, buildSpokeTarget, resolveWorkspaceRoot, withCliWorkspaceTarget, type WorkspaceRootSource } from '../runtime/invocation.ts';


export function buildDynamicCommandInvocation(
    command: string,
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<DynamicCommandPayload | ChantWeavePayload | EvolveWeavePayload | TaliesinForgeWeavePayload> {
    if (command.toLowerCase() === 'chant') {
        // Look up the most recent active session to resume it
        let sessionId;
        try {
            const db = getDb();
            const row = db.prepare(`
                SELECT session_id 
                FROM hall_planning_sessions 
                WHERE status NOT IN ('COMPLETED', 'FAILED') 
                ORDER BY created_at DESC LIMIT 1
            `).get() as { session_id: string } | undefined;
            if (row) {
                sessionId = row.session_id;
            }
        } catch (e) {
            // Ignore DB errors if not initialized
        }
        return buildChantInvocation(args, projectRoot, cwd, sessionId);
    }
    if (command.toLowerCase() === 'evolve') {
        return buildEvolveInvocation(args, projectRoot, cwd);
    }
    if (command.toLowerCase() === 'forge') {
        return buildTaliesinForgeInvocation(args, projectRoot, cwd);
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

    if (sessionId) {
        return {
            ...invocation,
            session: {
                mode: invocation.session?.mode ?? 'cli',
                interactive: invocation.session?.interactive ?? true,
                session_id: sessionId,
            },
        };
    }

    return invocation;
}

export function buildEvolveInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<EvolveWeavePayload> {
    const payload: EvolveWeavePayload = {
        action: 'propose',
        project_root: projectRoot,
        cwd,
        source: 'cli',
        simulate: true,
    };
    let spoke: string | undefined;

    for (let index = 0; index < args.length; index += 1) {
        const token = args[index];
        if (token === '--bead-id' && args[index + 1]) {
            payload.bead_id = args[index + 1];
            index += 1;
            continue;
        }
        if (token === '--proposal-id' && args[index + 1]) {
            payload.proposal_id = args[index + 1];
            index += 1;
            continue;
        }
        if ((token === '--spoke' || token === '--target-spoke') && args[index + 1]) {
            spoke = args[index + 1].trim().toLowerCase();
            index += 1;
            continue;
        }
        if (token.startsWith('--spoke=')) {
            spoke = token.slice('--spoke='.length).trim().toLowerCase();
            continue;
        }
        if (token === '--promote') {
            payload.action = 'promote';
            continue;
        }
        if (token === '--dry-run') {
            payload.dry_run = true;
            continue;
        }
        if (token === '--no-simulate') {
            payload.simulate = false;
            continue;
        }
        if (token === '--focus-axis' && args[index + 1]) {
            payload.focus_axes = [...(payload.focus_axes ?? []), args[index + 1]];
            index += 1;
            continue;
        }
        if (token === '--validation-profile' && args[index + 1]) {
            payload.validation_profile = args[index + 1];
            index += 1;
        }
    }

    if (spoke) {
        return {
            weave_id: 'weave:evolve',
            payload,
            target: buildSpokeTarget(projectRoot, spoke),
            session: buildCliSession(),
        };
    }

    return withCliWorkspaceTarget({
        weave_id: 'weave:evolve',
        payload,
    }, projectRoot, cwd);
}

export function buildTaliesinForgeInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<TaliesinForgeWeavePayload> {
    const payload: TaliesinForgeWeavePayload = {
        project_root: projectRoot,
        cwd,
        source: 'cli',
    };

    for (let index = 0; index < args.length; index += 1) {
        const token = args[index];
        if (token === '--bead-id' && args[index + 1]) {
            payload.bead_id = args[index + 1];
            index += 1;
            continue;
        }
        if (token === '--persona' && args[index + 1]) {
            payload.persona = args[index + 1];
            index += 1;
            continue;
        }
        if (token === '--model' && args[index + 1]) {
            payload.model = args[index + 1];
            index += 1;
        }
    }

    return withCliWorkspaceTarget({
        weave_id: 'weave:taliesin-forge',
        payload,
    }, projectRoot, cwd);
}

/**
 * [GUNGNIR] Dispatcher Spoke
 * Purpose: Thin shell for runtime-backed dynamic workflow and skill discovery.
 * @param program
 * @param PROJECT_ROOT
 */
export function registerDispatcher(
    program: Command,
    projectRootSource: WorkspaceRootSource,
    dispatchPort: RuntimeDispatchPort = RuntimeDispatcher.getInstance(),
) {
    program.on('command:*', async (operands: string[]) => {
        const [cmd, ...args] = operands;
        const projectRoot = resolveWorkspaceRoot(projectRootSource);
        const result = await dispatchPort.dispatch(buildDynamicCommandInvocation(cmd, args, projectRoot, process.cwd()));

        if (result.status === 'FAILURE') {
            console.error(result.error ?? `Unknown command '${cmd}'`);
            process.exit(1);
        }

        if (result.weave_id !== 'weave:dynamic-command' && result.output) {
            console.log(result.output);
        }
    });
}
