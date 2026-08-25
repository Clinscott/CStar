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
        description: 'Create, inspect, claim, block, resolve, and list bounded Hall beads. RESOLVED requires fresh contained Lore/Isolation artifacts bound to an exact independent Hall validation receipt; no scalar, cached, force, or exemption bypass exists.',
    },
    {
        name: 'cstar_goal_resume',
        toolClass: 'MUTATION',
        description: 'Append immutable continuity evidence for an explicitly resumed blocked host goal. It does not change host state or grant spend, source, Git, restart, deployment, or production authority.',
    },
    {
        name: 'cstar_spoke_bead_import',
        toolClass: 'MUTATION',
        description: 'Import a spoke-originated bead into the Hall through a bounded, validated handoff payload.',
    },
    {
        name: 'cstar_record_result',
        toolClass: 'MUTATION',
        description: 'Record independent validation for a Hall bead and optionally finalize a delivered Forge receipt.',
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
        toolClass: 'LEGACY',
        description: 'Decommissioned Mongo mirror/intent compatibility surface; always fails closed without secret, network, or write activity.',
    },
    {
        name: 'cstar_status',
        toolClass: 'READ',
        description: 'Deterministic kernel state snapshot with optional exact Forge execution lifecycle status.',
    },
    {
        name: 'cstar_persona_set',
        toolClass: 'MUTATION',
        description: 'Explicitly select O.D.I.N. or A.L.F.R.E.D. for the next workflow boundary; style-only and never expands authority or bypasses gates.',
    },
    {
        name: 'cstar_evolve',
        toolClass: 'READ',
        description: 'Read-only inspection of Karpathy-loop artifacts: list_proposals, get_proposal, list_sprt_history.',
    },
    {
        name: 'cstar_spoke',
        toolClass: 'READ',
        description: 'Redacted mounted-spoke inspection and exact-match prune preview; link, unlink, project, and destructive prune fail closed until a request-scoped operator-attestation contract exists.',
    },
    {
        name: 'cstar_intent_route',
        toolClass: 'READ',
        description: 'Deterministic grammar-only routing. Prefer cstar_augury when session context is needed.',
    },
    {
        name: 'cstar_warden',
        toolClass: 'EXECUTION',
        description: 'On-demand local Sentinel Warden execution. list and bounties are read-only; scan starts a constrained project-venv process and performs no LLM inference.',
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
        description: 'Persist an immutable no-spend Forge request; machine challenge material stays hidden from the normal operator workflow.',
    },
    {
        name: 'cstar_forge_authorize',
        toolClass: 'MUTATION',
        description: 'Bind one explicit root-user build instruction or immutable CStar goal-continuation receipt to one unchanged pending Forge request; performs no provider call.',
    },
    {
        name: 'cstar_forge_execute',
        toolClass: 'EXECUTION',
        description: 'Atomically persist or replay the current Codex-host state-only Forge handoff with zero CStar provider/cognition launch; explicitly selected legacy Hermes/MiniMax attempts retain durable replay, independently validated continuity, and delivered-pending-validation semantics.',
    },
    {
        name: 'cstar_mission',
        toolClass: 'REQUEST',
        description: 'Compatibility-first ordinary bounded mission coordinator; derives immutable identifiers and hashes, persists host-owned queue intent when authorized, and never launches workers, providers, or Forge authority.',
    },
    {
        name: 'cstar_forge_host_complete',
        toolClass: 'MUTATION',
        description: 'Record a host-reported Forge completion boundary without treating delivery as independent validation or lifecycle success.',
    },
    {
        name: 'cstar_researcher_host_complete',
        toolClass: 'MUTATION',
        description: 'Record one hash-bound native Researcher host completion as DELIVERED_UNVERIFIED; it never accepts the Researcher result.',
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
