export const KERNEL_MCP_INACTIVE_HOST_ENV: Readonly<Record<string, string>>;
export const KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS: readonly string[];

export function neutralizeKernelMcpProcessEnv(
    targetEnv?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;

export function buildKernelMcpChildEnv(
    sourceEnv?: NodeJS.ProcessEnv,
    overrides?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;
