import type { HostProvider } from  '../../core/host_session.js';
import { resolveHostProvider } from  '../../core/host_session.js';
import { ANS } from  './ans.js';
import type {
    HostGovernorWeavePayload,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
    OperatorSession,
    WorkspaceTarget,
} from './runtime/contracts.ts';

export interface OperatorResumeOptions {
    workspaceRoot: string;
    cwd: string;
    task?: string;
    ledger?: string;
    env?: NodeJS.ProcessEnv;
    autoExecute?: boolean;
    autoReplanBlocked?: boolean;
    maxParallel?: number;
    maxPromotions?: number;
    dryRun?: boolean;
    source?: HostGovernorWeavePayload['source'];
    session?: OperatorSession;
    target?: WorkspaceTarget;
}

export interface OperatorResumeResult {
    resumed: boolean;
    provider: HostProvider | null;
    wokeKernel: boolean;
    governorResult?: WeaveResult;
}

interface OperatorResumeDependencies {
    wakeKernel?: () => Promise<void>;
}

export async function resumeHostGovernorIfAvailable(
    dispatchPort: RuntimeDispatchPort,
    options: OperatorResumeOptions,
    dependencies: OperatorResumeDependencies = {},
): Promise<OperatorResumeResult> {
    const env = options.env ?? process.env;
    const provider = resolveHostProvider(env);
    if (!provider) {
        return {
            resumed: false,
            provider: null,
            wokeKernel: false,
        };
    }

    const wakeKernel = dependencies.wakeKernel ?? (() => ANS.wake());
    try {
        await wakeKernel();
        const governorInvocation: WeaveInvocation<HostGovernorWeavePayload> = {
            weave_id: 'weave:host-governor',
            payload: {
                task: options.task,
                ledger: options.ledger,
                auto_execute: options.autoExecute ?? true,
                auto_replan_blocked: options.autoReplanBlocked ?? true,
                max_parallel: options.maxParallel ?? 1,
                max_promotions: options.maxPromotions,
                dry_run: options.dryRun,
                project_root: options.workspaceRoot,
                cwd: options.cwd,
                source: options.source ?? 'cli',
            },
            session: options.session,
            target: options.target,
        };

        const governorResult = await dispatchPort.dispatch(governorInvocation);
        return {
            resumed: true,
            provider,
            wokeKernel: true,
            governorResult,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            resumed: true,
            provider,
            wokeKernel: true,
            governorResult: {
                weave_id: 'weave:host-governor',
                status: 'FAILURE',
                output: '',
                error: `Operator entry failed to resume the host governor: ${message}`,
            },
        };
    }
}
