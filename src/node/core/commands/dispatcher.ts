import { getDb } from  '../../../tools/pennyone/intel/database.js';
import { Command } from 'commander';
import { RuntimeDispatcher } from  '../runtime/dispatcher.js';
import {
    AutobotWeavePayload,
    ChantWeavePayload,
    DynamicCommandPayload,
    EvolveWeavePayload,
    RuntimeDispatchPort,
    TaliesinForgeWeavePayload,
    WeaveInvocation,
} from '../runtime/contracts.ts';
import { buildCliSession, buildSpokeTarget, resolveWorkspaceRoot, withCliWorkspaceTarget, type WorkspaceRootSource } from  '../runtime/invocation.js';

const CHANT_RESUME_CONTROL_PHRASES = new Set([
    'approve',
    'yes',
    'proceed',
    'continue',
    'resume',
    'go ahead',
    'do it',
]);

type ChantSessionDirective = {
    queryArgs: string[];
    sessionId?: string;
    shouldResume: boolean;
};

function lookupLatestActiveChantSessionId(): string | undefined {
    try {
        const db = getDb();
        const row = db.prepare(`
            SELECT session_id
            FROM hall_planning_sessions
            WHERE status NOT IN ('COMPLETED', 'FAILED')
            ORDER BY created_at DESC LIMIT 1
        `).get() as { session_id: string } | undefined;
        return row?.session_id;
    } catch {
        return undefined;
    }
}

export function shouldAutoResumeChantSession(args: string[]): boolean {
    const normalized = args.join(' ').trim().toLowerCase();
    if (!normalized) {
        return true;
    }
    return CHANT_RESUME_CONTROL_PHRASES.has(normalized);
}

export function parseChantSessionDirective(args: string[]): ChantSessionDirective {
    const queryArgs = [...args];
    let sessionId: string | undefined;
    let shouldResume = false;

    while (queryArgs.length > 0) {
        const token = queryArgs[0];
        if (token === '--new-session') {
            queryArgs.shift();
            shouldResume = false;
            sessionId = undefined;
            continue;
        }
        if (token === '--resume') {
            queryArgs.shift();
            shouldResume = true;
            if (queryArgs[0]?.startsWith('chant-session:')) {
                sessionId = queryArgs.shift();
            }
            continue;
        }
        if (token.startsWith('--resume=')) {
            shouldResume = true;
            sessionId = token.slice('--resume='.length) || undefined;
            queryArgs.shift();
            continue;
        }
        if (token === '--session' && queryArgs[1]) {
            shouldResume = true;
            sessionId = queryArgs[1];
            queryArgs.splice(0, 2);
            continue;
        }
        if (token.startsWith('--session=')) {
            shouldResume = true;
            sessionId = token.slice('--session='.length) || undefined;
            queryArgs.shift();
            continue;
        }
        break;
    }

    if (!shouldResume) {
        shouldResume = shouldAutoResumeChantSession(queryArgs);
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
): WeaveInvocation<DynamicCommandPayload | ChantWeavePayload | AutobotWeavePayload | EvolveWeavePayload | TaliesinForgeWeavePayload> {
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

function parseNumberOption(value: string | undefined): number | undefined {
    if (!value) {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseAutobotSource(value: string | undefined): AutobotWeavePayload['source'] | undefined {
    if (value === 'cli' || value === 'python_adapter' || value === 'runtime') {
        return value;
    }
    return undefined;
}

export function buildAutobotInvocation(
    args: string[],
    projectRoot: string,
    cwd: string = process.cwd(),
): WeaveInvocation<AutobotWeavePayload> {
    const payload: AutobotWeavePayload = {
        project_root: projectRoot,
        cwd,
        source: 'cli',
    };

    for (let index = 0; index < args.length; index += 1) {
        const token = args[index];
        const next = args[index + 1];

        if ((token === '--bead-id' || token === '--bead') && next) {
            payload.bead_id = next;
            index += 1;
            continue;
        }
        if (token === '--claim-next') {
            payload.claim_next = true;
            continue;
        }
        if (token === '--checker-shell' && next) {
            payload.checker_shell = next;
            index += 1;
            continue;
        }
        if (token === '--max-attempts' && next) {
            payload.max_attempts = parseNumberOption(next);
            index += 1;
            continue;
        }
        if (token === '--timeout' && next) {
            payload.timeout = parseNumberOption(next);
            index += 1;
            continue;
        }
        if (token === '--startup-timeout' && next) {
            payload.startup_timeout = parseNumberOption(next);
            index += 1;
            continue;
        }
        if (token === '--checker-timeout' && next) {
            payload.checker_timeout = parseNumberOption(next);
            index += 1;
            continue;
        }
        if (token === '--grace-seconds' && next) {
            payload.grace_seconds = parseNumberOption(next);
            index += 1;
            continue;
        }
        if (token === '--agent-id' && next) {
            payload.agent_id = next;
            index += 1;
            continue;
        }
        if (token === '--worker-note' && next) {
            payload.worker_note = next;
            index += 1;
            continue;
        }
        if (token === '--autobot-dir' && next) {
            payload.autobot_dir = next;
            index += 1;
            continue;
        }
        if (token === '--command' && next) {
            payload.command = next;
            index += 1;
            continue;
        }
        if (token === '--command-arg' && next) {
            payload.command_args = [...(payload.command_args ?? []), next];
            index += 1;
            continue;
        }
        if (token === '--ready-regex' && next) {
            payload.ready_regex = next;
            index += 1;
            continue;
        }
        if (token === '--done-regex' && next) {
            payload.done_regexes = [...(payload.done_regexes ?? []), next];
            index += 1;
            continue;
        }
        if (token === '--env' && next) {
            const separatorIndex = next.indexOf('=');
            if (separatorIndex > 0) {
                const key = next.slice(0, separatorIndex).trim();
                const value = next.slice(separatorIndex + 1);
                if (key) {
                    payload.env = {
                        ...(payload.env ?? {}),
                        [key]: value,
                    };
                }
            }
            index += 1;
            continue;
        }
        if (token === '--stream') {
            payload.stream = true;
            continue;
        }
        if (token === '--source' && next) {
            payload.source = parseAutobotSource(next) ?? payload.source;
            index += 1;
        }
    }

    return withCliWorkspaceTarget({
        weave_id: 'weave:autobot',
        payload,
    }, projectRoot, cwd);
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
 * @param PROJECT_ROOT
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
        const result = await dispatchPort.dispatch(buildDynamicCommandInvocation(cmd, rawArgs, projectRoot, process.cwd()));

        if (result.status === 'FAILURE') {
            console.error(result.error ?? `Unknown command '${cmd}'`);
            process.exit(1);
        }

        if (result.weave_id !== 'weave:dynamic-command' && result.output) {
            console.log(result.output);
        }
    });
}
