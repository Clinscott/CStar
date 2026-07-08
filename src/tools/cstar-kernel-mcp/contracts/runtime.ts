import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
export const HUB_KERNEL_VERSION = '1.0.0';
export const MCP_ERROR_MESSAGE_MAX = 512;
export const MCP_PROPOSAL_MAX_BYTES = 512 * 1024;
export const MCP_SAFE_PROPOSAL_ID = /^[a-zA-Z0-9._-]+$/;
export const MCP_LOG_DIR = path.join(PROJECT_ROOT, 'logs', 'mcp');
export const MCP_LOG_PATH = path.join(MCP_LOG_DIR, 'mcp_bootstrap_error.log');

export function isPathInside(child: string, parent: string): boolean {
    const resolvedChild = path.resolve(child);
    const resolvedParent = path.resolve(parent);
    if (resolvedChild === resolvedParent) {
        return true;
    }
    const rel = path.relative(resolvedParent, resolvedChild);
    return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function logBootstrapError(error: unknown): void {
    try {
        fs.mkdirSync(MCP_LOG_DIR, { recursive: true });
        const stack = error instanceof Error ? error.stack ?? error.message : String(error);
        fs.appendFileSync(MCP_LOG_PATH, `[${new Date().toISOString()}] ${stack}\n`, 'utf-8');
    } catch {
        // Diagnostics must never break the MCP surface.
    }
}
