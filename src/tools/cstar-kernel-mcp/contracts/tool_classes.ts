import {
    CSTAR_KERNEL_TOOL_CATALOG,
    MCP_TOOL_CLASS_PREFIXES,
    type CstarKernelToolName,
    type McpToolClassPrefix,
} from './tool_catalog.js';

export { MCP_TOOL_CLASS_PREFIXES, type McpToolClassPrefix } from './tool_catalog.js';

export const CSTAR_KERNEL_TOOL_CLASSES = Object.freeze(Object.fromEntries(
    CSTAR_KERNEL_TOOL_CATALOG.map(({ name, toolClass }) => [name, toolClass]),
)) as Readonly<Record<CstarKernelToolName, McpToolClassPrefix>>;

export function mcpToolDescription(toolClass: McpToolClassPrefix, description: string): string {
    return `${toolClass}: ${description}`;
}
