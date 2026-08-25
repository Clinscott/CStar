export const MCP_BOOTSTRAP_LOG_MAX_BYTES: number;
export function formatBootstrapErrorRecord(error: unknown, timestamp?: Date): string;
export function logBootstrapError(projectRoot: string, error: unknown): void;
