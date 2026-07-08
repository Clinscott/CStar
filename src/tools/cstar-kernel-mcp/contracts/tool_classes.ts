export const MCP_TOOL_CLASS_PREFIXES = ['READ', 'MUTATION', 'REQUEST', 'EXECUTION', 'LEGACY'] as const;

export type McpToolClassPrefix = typeof MCP_TOOL_CLASS_PREFIXES[number];

export const CSTAR_KERNEL_TOOL_CLASSES = {
    cstar_augury: 'READ',
    cstar_autobot: 'LEGACY',
    cstar_bead: 'MUTATION',
    cstar_doctor: 'READ',
    cstar_engram_record: 'MUTATION',
    cstar_evolve: 'READ',
    cstar_forge_execute: 'EXECUTION',
    cstar_forge_request: 'REQUEST',
    cstar_hall_maintenance: 'READ',
    cstar_hall_search: 'READ',
    cstar_handoff: 'READ',
    cstar_intent_route: 'READ',
    cstar_manifest: 'READ',
    cstar_record_result: 'MUTATION',
    cstar_researcher_request: 'REQUEST',
    cstar_skill_info: 'READ',
    cstar_spoke: 'MUTATION',
    cstar_spoke_bead_import: 'MUTATION',
    cstar_spoke_journal: 'READ',
    cstar_status: 'READ',
    cstar_telemetry: 'READ',
    cstar_verify_plan: 'READ',
    cstar_war_game_score: 'MUTATION',
    cstar_warden: 'READ',
} as const satisfies Record<string, McpToolClassPrefix>;

export function mcpToolDescription(toolClass: McpToolClassPrefix, description: string): string {
    return `${toolClass}: ${description}`;
}
