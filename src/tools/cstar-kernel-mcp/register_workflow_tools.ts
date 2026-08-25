import {
    cstarMissionCoordinatorToolSchema,
    dispatchRequestSchema,
} from './contracts/schemas.js';
import {
    getCstarKernelToolCatalogEntry,
    type CstarKernelToolName,
} from './contracts/tool_catalog.js';
import { mcpToolDescription } from './contracts/tool_classes.js';
import type { McpRequestContext } from './contracts/request_context.js';
import { handleResearcherRequest } from './tools/dispatch_request.js';
import { handleCstarMission } from './tools/automatic_mission_coordinator.js';

type ServerWithTool = { tool: (...args: any[]) => unknown };
type ToolHandler = (args: any, context?: McpRequestContext) => Promise<any>;
type InstrumentTool = (name: CstarKernelToolName, handler: ToolHandler) => any;

function registerWorkflowTool(
    server: ServerWithTool,
    instrumentTool: InstrumentTool,
    name: CstarKernelToolName,
    schema: any,
    handler: ToolHandler,
): void {
    const entry = getCstarKernelToolCatalogEntry(name);
    server.tool(
        entry.name,
        mcpToolDescription(entry.toolClass, entry.description),
        schema,
        instrumentTool(entry.name, handler),
    );
}

export function registerWorkflowTools(
    server: ServerWithTool,
    instrumentTool: InstrumentTool,
): void {
    registerWorkflowTool(
        server,
        instrumentTool,
        'cstar_researcher_request',
        dispatchRequestSchema,
        handleResearcherRequest,
    );

    registerWorkflowTool(
        server,
        instrumentTool,
        'cstar_mission',
        cstarMissionCoordinatorToolSchema,
        handleCstarMission,
    );
}
