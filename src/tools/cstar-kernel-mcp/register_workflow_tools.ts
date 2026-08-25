import {
    cstarMissionCoordinatorToolSchema,
    dispatchRequestSchema,
    forgeAuthorizeSchema,
    forgeExecuteSchema,
    forgeRequestSchema,
} from './contracts/schemas.js';
import { forgeHostCompleteSchema } from './contracts/forge_host_completion.js';
import { handleForgeSwarmPlan } from './tools/forge_swarm_plan.js';
import { handleForgeSwarmStatus } from './tools/forge_swarm_status.js';
import { handleForgeSwarmUpdate } from './tools/forge_swarm_update.js';
import { handleForgeSwarmComplete } from './tools/forge_swarm_complete.js';
import { handleForgeSwarmCancel } from './tools/forge_swarm_cancel.js';
import { forgeNativePlanToolSchema } from './tools/forge_swarm_plan.js';
import { forgeNativeStatusSchema } from './tools/forge_swarm_status.js';
import { forgeNativeUpdateSchema } from './tools/forge_swarm_update.js';
import { forgeNativeCompleteSchema } from './tools/forge_swarm_complete.js';
import { forgeNativeCancelSchema } from './tools/forge_swarm_cancel.js';
import {
    getCstarKernelToolCatalogEntry,
    type CstarKernelToolName,
} from './contracts/tool_catalog.js';
import { mcpToolDescription } from './contracts/tool_classes.js';
import type { McpRequestContext } from './contracts/request_context.js';
import { handleForgeHostComplete } from './tools/forge_host_complete.js';
import { handleForgeExecute } from './tools/forge_execute.js';
import { handleForgeAuthorize } from './tools/forge_authorize.js';
import { handleResearcherRequest } from './tools/dispatch_request.js';
import { handleForgeRequest } from './tools/forge_request.js';
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
        'cstar_forge_request',
        forgeRequestSchema,
        handleForgeRequest,
    );

    registerWorkflowTool(
        server,
        instrumentTool,
        'cstar_forge_authorize',
        forgeAuthorizeSchema,
        handleForgeAuthorize,
    );

    registerWorkflowTool(
        server,
        instrumentTool,
        'cstar_forge_execute',
        forgeExecuteSchema,
        handleForgeExecute,
    );

    registerWorkflowTool(
        server,
        instrumentTool,
        'cstar_mission',
        cstarMissionCoordinatorToolSchema,
        handleCstarMission,
    );

    registerWorkflowTool(
        server,
        instrumentTool,
        'cstar_forge_host_complete',
        forgeHostCompleteSchema.shape,
        handleForgeHostComplete,
    );

    registerWorkflowTool(
        server,
        instrumentTool,
        'cstar_forge_swarm_plan',
        forgeNativePlanToolSchema,
        handleForgeSwarmPlan,
    );

    registerWorkflowTool(
        server,
        instrumentTool,
        'cstar_forge_swarm_status',
        forgeNativeStatusSchema,
        handleForgeSwarmStatus,
    );

    registerWorkflowTool(
        server,
        instrumentTool,
        'cstar_forge_swarm_update',
        forgeNativeUpdateSchema,
        handleForgeSwarmUpdate,
    );

    registerWorkflowTool(
        server,
        instrumentTool,
        'cstar_forge_swarm_complete',
        forgeNativeCompleteSchema,
        handleForgeSwarmComplete,
    );

    registerWorkflowTool(
        server,
        instrumentTool,
        'cstar_forge_swarm_cancel',
        forgeNativeCancelSchema,
        handleForgeSwarmCancel,
    );
}
