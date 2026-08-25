export const KERNEL_MCP_ALLOWED_PARENT_ENV_KEYS: readonly string[];
export const KERNEL_MCP_ALLOWED_OVERRIDE_KEYS: readonly string[];
export const KERNEL_MCP_INACTIVE_HOST_ENV: Readonly<Record<string, string>>;

export interface KernelMcpLaunchRoots {
    codeRoot: string;
    controlRoot: string;
    hallPath: string;
}

export function resolveKernelMcpLaunchRoots(args: {
    codeRoot: string;
    controlRoot: string | undefined;
}): KernelMcpLaunchRoots;

export function neutralizeKernelMcpProcessEnv(
    targetEnv?: NodeJS.ProcessEnv,
    overrides?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;

export function buildKernelMcpChildEnv(
    sourceEnv?: NodeJS.ProcessEnv,
    overrides?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;
