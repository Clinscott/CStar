export const MCP_TOOL_CLASS_PREFIXES = ['READ', 'MUTATION', 'REQUEST', 'EXECUTION', 'LEGACY'] as const;

export type McpToolClassPrefix = typeof MCP_TOOL_CLASS_PREFIXES[number];

interface CstarKernelToolCatalogShape {
    readonly name: string;
    readonly toolClass: McpToolClassPrefix;
    readonly description: string;
}

/**
 * Canonical metadata for every public CStar kernel MCP tool.
 *
 * Schemas and handlers deliberately remain in the registration layer. This
 * catalog is safe for packaging, documentation, and parity checks to consume
 * without importing the MCP runtime or its stateful dependencies.
 */
export const CSTAR_KERNEL_TOOL_CATALOG = [
    {
        name: 'cstar_hall_maintenance',
        toolClass: 'LEGACY',
        description: 'Decommissioned lesson study/harvest compatibility surface; always fails closed without reading or writing Hall state.',
    },
    {
        name: 'cstar_handoff',
        toolClass: 'READ',
        description: 'Return compact active state from Augury/handoff logic.',
    },
    {
        name: 'cstar_hall_search',
        toolClass: 'READ',
        description: 'Bounded Hall search across code/docs/engrams/beads/sessions/lessons.',
    },
    {
        name: 'cstar_augury',
        toolClass: 'READ',
        description: 'Resolve a mission to a route with deterministic grammar, active session context, council expert, Mimir targets, and persona advice.',
    },
    {
        name: 'cstar_doctor',
        toolClass: 'READ',
        description: 'Diagnose base kernel health and active Augury health.',
    },
    {
        name: 'cstar_verify_plan',
        toolClass: 'READ',
        description: 'Recommend focused checks; do not run them.',
    },
    {
        name: 'cstar_bead',
        toolClass: 'MUTATION',
        description: 'Create, inspect, claim, block, resolve, and list bounded Hall beads. RESOLVED transitions are gated by the Sterling Mandate unless force/exemption evidence is supplied.',
    },
    {
        name: 'cstar_spoke_bead_import',
        toolClass: 'MUTATION',
        description: 'Import a spoke-originated bead into the Hall through a bounded, validated handoff payload.',
    },
    {
        name: 'cstar_record_result',
        toolClass: 'MUTATION',
        description: 'Record independent validation for a Hall bead and optionally finalize a delivered Forge receipt; TokenPath observation input remains quarantined.',
    },
    {
        name: 'cstar_engram_record',
        toolClass: 'MUTATION',
        description: 'Publish an Engram to the Hall episodic memory table and fire war-game scoring when applicable.',
    },
    {
        name: 'cstar_war_game_score',
        toolClass: 'MUTATION',
        description: 'War-game scoring: register_contest, tally, recent, by_scenario, get_score, list_contests.',
    },
    {
        name: 'cstar_manifest',
        toolClass: 'READ',
        description: 'Capability discovery. Returns the kernel registry merged with spoke-local skill manifests.',
    },
    {
        name: 'cstar_skill_info',
        toolClass: 'READ',
        description: 'Per-capability contract view for hub and namespaced spoke skills.',
    },
    {
        name: 'cstar_spoke_journal',
        toolClass: 'READ',
        description: 'Four-file journal state for a registered spoke.',
    },
    {
        name: 'cstar_pennyone_context',
        toolClass: 'READ',
        description: 'Bounded PennyOne/Hall state summaries. No arbitrary SQL is accepted.',
    },
    {
        name: 'cstar_mongo_mailbox',
        toolClass: 'MUTATION',
        description: 'Mongo mailbox status/counts. Durable operator-intent enqueue authority is unavailable and fails closed; no arbitrary Mongo query is accepted.',
    },
    {
        name: 'cstar_status',
        toolClass: 'READ',
        description: 'Deterministic kernel state snapshot.',
    },
    {
        name: 'cstar_evolve',
        toolClass: 'READ',
        description: 'Read-only inspection of Karpathy-loop artifacts: list_proposals, get_proposal, list_sprt_history.',
    },
    {
        name: 'cstar_spoke',
        toolClass: 'MUTATION',
        description: 'Mounted-spoke lifecycle: list / link / unlink / inspect / project / doctor / prune / verify / health.',
    },
    {
        name: 'cstar_intent_route',
        toolClass: 'READ',
        description: 'Deterministic grammar-only routing. Prefer cstar_augury when session context is needed.',
    },
    {
        name: 'cstar_warden',
        toolClass: 'READ',
        description: 'On-demand Sentinel Warden invocation. Deterministic scanners only; no LLM inference.',
    },
    {
        name: 'cstar_telemetry',
        toolClass: 'READ',
        description: 'Read-only MCP telemetry summaries over the last 24h.',
    },
    {
        name: 'cstar_researcher_request',
        toolClass: 'REQUEST',
        description: 'Create a CStar-native no-spend Researcher request receipt.',
    },
    {
        name: 'cstar_forge_request',
        toolClass: 'REQUEST',
        description: 'Persist an immutable no-spend Forge request; live authorization binds a one-shot operator attestation and exact output contract.',
    },
    {
        name: 'cstar_forge_execute',
        toolClass: 'EXECUTION',
        description: 'Atomically reserve and invoke the private Hermes/MiniMax adapter once, with durable replay and delivered-pending-validation semantics.',
    },
] as const satisfies readonly CstarKernelToolCatalogShape[];

export type CstarKernelToolCatalogEntry = typeof CSTAR_KERNEL_TOOL_CATALOG[number];
export type CstarKernelToolName = CstarKernelToolCatalogEntry['name'];

export const CSTAR_KERNEL_TOOL_NAMES = Object.freeze(
    CSTAR_KERNEL_TOOL_CATALOG.map(({ name }) => name),
) as readonly CstarKernelToolName[];

const TOOL_CATALOG_BY_NAME = new Map<string, CstarKernelToolCatalogEntry>();

for (const entry of CSTAR_KERNEL_TOOL_CATALOG) {
    if (TOOL_CATALOG_BY_NAME.has(entry.name)) {
        throw new Error(`Duplicate CStar kernel MCP tool catalog entry: ${entry.name}`);
    }
    TOOL_CATALOG_BY_NAME.set(entry.name, entry);
}

/** Resolve catalog metadata without allowing unknown or decommissioned tools. */
export function getCstarKernelToolCatalogEntry(name: string): CstarKernelToolCatalogEntry {
    const entry = TOOL_CATALOG_BY_NAME.get(name);
    if (!entry) {
        throw new Error(`Unknown CStar kernel MCP tool: ${name}`);
    }
    return entry;
}
