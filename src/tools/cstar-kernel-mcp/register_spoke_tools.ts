import { z } from 'zod';

import {
    getCstarKernelToolCatalogEntry,
    type CstarKernelToolName,
} from './contracts/tool_catalog.js';
import { mcpToolDescription } from './contracts/tool_classes.js';
import type { McpRequestContext } from './contracts/request_context.js';
import { handleSpokeAttachment } from './tools/spoke_attachment.js';

type ServerWithTool = { tool: (...args: any[]) => unknown };
type ToolHandler = (args: any, context?: McpRequestContext) => Promise<any>;
type InstrumentTool = (name: CstarKernelToolName, handler: ToolHandler) => any;

function registerCatalogTool(
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

export function registerSpokeTools(server: ServerWithTool, instrumentTool: InstrumentTool): void {
    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_spoke_attachment',
        {
            action: z.enum(['link', 'project', 'unlink']).describe('Hall-owned attachment action'),
            slug: z.string().min(1).max(64).describe('Canonical lowercase spoke slug'),
            root_path: z.string().min(1).describe('Canonical absolute spoke repository root under Corvus'),
            authority_source: z.union([
                z.object({ kind: z.literal('current_root_turn') }).strict(),
                z.object({
                    kind: z.literal('cstar_mission_set_grant'),
                    mission_id: z.string().min(1).max(512),
                    grant_id: z.string().min(1).max(512),
                }).strict(),
            ]).optional().describe('Link-only authority source; omission binds the current root-user turn'),
        },
        handleSpokeAttachment,
    );
}
