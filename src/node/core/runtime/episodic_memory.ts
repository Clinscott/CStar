import { execa } from 'execa';

import type {
    CompressWeavePayload,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from './contracts.ts';
import { DistillWeave } from './weaves/distill.js';

export interface ReadyForReviewMemoryRequest {
    bead_id: string;
    bead_intent: string;
    project_root: string;
    cwd: string;
    target_paths?: string[];
    context: RuntimeContext;
    dispatchPort?: RuntimeDispatchPort;
    session_id?: string;
    target_domain?: RuntimeContext['target_domain'];
    spoke?: string;
}

export const deps = {
    runGitDiff: async (projectRoot: string): Promise<string> => {
        const result = await execa('git', ['diff', 'HEAD'], { cwd: projectRoot });
        return result.stdout;
    },
    createDistillWeave: () => new DistillWeave(),
};

function buildDistillInvocation(
    request: ReadyForReviewMemoryRequest,
    gitDiff: string,
): WeaveInvocation<CompressWeavePayload> {
    return {
        weave_id: 'weave:distill',
        payload: {
            bead_id: request.bead_id,
            bead_intent: request.bead_intent,
            project_root: request.project_root,
            cwd: request.cwd,
            git_diff: gitDiff,
            target_paths: request.target_paths ?? [],
            source: 'runtime',
        },
        session: {
            mode: 'subkernel',
            interactive: false,
            session_id: request.session_id,
        },
        target: {
            domain: request.target_domain ?? request.context.target_domain,
            workspace_root: request.project_root,
            requested_path: request.project_root,
            spoke: request.spoke,
        },
    };
}

export async function engraveReadyForReviewMemory(
    request: ReadyForReviewMemoryRequest,
): Promise<WeaveResult> {
    const gitDiff = await deps.runGitDiff(request.project_root);
    const invocation = buildDistillInvocation(request, gitDiff);

    if (request.dispatchPort) {
        return request.dispatchPort.dispatch(invocation);
    }

    return deps.createDistillWeave().execute(invocation, request.context);
}
