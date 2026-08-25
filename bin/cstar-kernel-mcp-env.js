/**
 * Build the environment for bounded CStar MCP tool-serving children.
 *
 * MCP transport is not an interactive host session. Host markers inherited
 * from Codex, Gemini, Claude, or Droid must not grant a tool-serving child
 * host-native authority or make it select a host cognition path.
 */

export const KERNEL_MCP_INACTIVE_HOST_ENV = Object.freeze({
    GEMINI_CLI_ACTIVE: 'false',
    GEMINI_CLI: '0',
    GEMINI_CLI_SUBAGENTS: 'false',
    CODEX_SHELL: '0',
    CODEX_THREAD_ID: '',
    CODEX_SUBAGENTS: 'false',
    CLAUDE_CLI_ACTIVE: 'false',
    CLAUDECODE: '',
    CLAUDE_SUBAGENTS: 'false',
    DROID_CLI_ACTIVE: 'false',
    CORVUS_HOST_PROVIDER: '',
    AGENT_MODE: 'headless',
    CORVUS_HOST_SESSION_ACTIVE: '0',
});

// Intentionally explicit: prefix-wide CODEX_* deletion could discard sandbox,
// network, or other fail-closed host constraints that the MCP child must retain.
export const KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS = Object.freeze([
    'CODEX_CI',
    'CODEX_INTERNAL_ORIGINATOR_OVERRIDE',
    'CODEX_MANAGED_BY_NPM',
    'CODEX_MANAGED_PACKAGE_ROOT',
    'CODEX_SQLITE_HOME',
]);

export function neutralizeKernelMcpProcessEnv(targetEnv = process.env) {
    for (const key of KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS) {
        delete targetEnv[key];
    }

    Object.assign(targetEnv, KERNEL_MCP_INACTIVE_HOST_ENV, {
        CSTAR_KERNEL_MCP: '1',
        CSTAR_KERNEL_DISABLE_WATCH: '1',
    });

    return targetEnv;
}

export function buildKernelMcpChildEnv(sourceEnv = process.env, overrides = {}) {
    const childEnv = {
        ...sourceEnv,
        ...overrides,
    };

    return neutralizeKernelMcpProcessEnv(childEnv);
}
