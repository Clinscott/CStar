export const RETIRED_NODE_DEPLOYMENT_ERROR =
    'legacy_node_deployment_retired_use_operator_gated_cstar_git_closure';

/**
 * Compatibility tombstone for the former candidate overwrite and auto-commit
 * helper. Candidate delivery, exact-file staging, commit, and push are separate
 * operator gates and cannot be delegated through this module.
 */
export async function deployCandidate(
    _targetFile: string,
    _candidateFile: string,
    _commitMessage: string,
    _execFunction?: unknown,
): Promise<never> {
    throw new Error(RETIRED_NODE_DEPLOYMENT_ERROR);
}
