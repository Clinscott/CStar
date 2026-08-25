export const MCP_TOOL_CLASS_PREFIXES = ['READ', 'MUTATION', 'REQUEST', 'EXECUTION', 'LEGACY'] as const;

export type McpToolClassPrefix = typeof MCP_TOOL_CLASS_PREFIXES[number];

export const CSTAR_KERNEL_TOOL_VISIBILITIES = [
    'default',
    'advanced',
    'compatibility',
] as const;

export type CstarKernelToolVisibility =
    typeof CSTAR_KERNEL_TOOL_VISIBILITIES[number];

export const CSTAR_KERNEL_TOOL_PROFILES = [
    'default_operator',
    'advanced',
    'compatibility',
] as const;

export type CstarKernelToolProfile = typeof CSTAR_KERNEL_TOOL_PROFILES[number];

interface CstarKernelToolCatalogShape {
    readonly name: string;
    readonly toolClass: McpToolClassPrefix;
    readonly description: string;
    readonly visibility: CstarKernelToolVisibility;
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
        visibility: 'compatibility',
    },
    {
        name: 'cstar_handoff',
        toolClass: 'READ',
        description: 'Return compact active state from Augury/handoff logic.',
        visibility: 'default',
    },
    {
        name: 'cstar_hall_search',
        toolClass: 'READ',
        description: 'Bounded Hall search across code/docs/engrams/beads/sessions/lessons.',
        visibility: 'default',
    },
    {
        name: 'cstar_augury',
        toolClass: 'MUTATION',
        description: 'Resolve a mission route and optionally materialize one strict v1/v2 exact-SET design boundary; omission of mission_boundary is read-only.',
        visibility: 'default',
    },
    {
        name: 'cstar_doctor',
        toolClass: 'READ',
        description: 'Diagnose base kernel health and active Augury health.',
        visibility: 'default',
    },
    {
        name: 'cstar_verify_plan',
        toolClass: 'READ',
        description: 'Recommend focused checks; do not run them.',
        visibility: 'default',
    },
    {
        name: 'cstar_bead',
        toolClass: 'MUTATION',
        description: 'Create, inspect, claim, block, resolve, and list bounded Hall beads. RESOLVED requires fresh contained Lore/Isolation artifacts bound to an exact independent Hall validation receipt; no scalar, cached, force, or exemption bypass exists.',
        visibility: 'default',
    },
    {
        name: 'cstar_goal_resume',
        toolClass: 'MUTATION',
        description: 'Append immutable continuity evidence for an explicitly resumed blocked host goal. It does not change host state or grant spend, source, Git, restart, deployment, or production authority.',
        visibility: 'default',
    },
    {
        name: 'cstar_spoke_bead_import',
        toolClass: 'MUTATION',
        description: 'Import a spoke-originated bead into the Hall through a bounded, validated handoff payload.',
        visibility: 'advanced',
    },
    {
        name: 'cstar_record_result',
        toolClass: 'MUTATION',
        description: 'Record independent validation for a Hall bead and optionally finalize a delivered Forge receipt.',
        visibility: 'default',
    },
    {
        name: 'cstar_engram_record',
        toolClass: 'MUTATION',
        description: 'Publish an Engram to the Hall episodic memory table and fire war-game scoring when applicable.',
        visibility: 'advanced',
    },
    {
        name: 'cstar_war_game_score',
        toolClass: 'MUTATION',
        description: 'War-game scoring: register_contest, tally, recent, by_scenario, get_score, list_contests.',
        visibility: 'advanced',
    },
    {
        name: 'cstar_manifest',
        toolClass: 'READ',
        description: 'Capability discovery. Returns the kernel registry merged with spoke-local skill manifests.',
        visibility: 'default',
    },
    {
        name: 'cstar_skill_info',
        toolClass: 'READ',
        description: 'Per-capability contract view for hub and namespaced spoke skills.',
        visibility: 'default',
    },
    {
        name: 'cstar_spoke_journal',
        toolClass: 'READ',
        description: 'Four-file journal state for a registered spoke.',
        visibility: 'advanced',
    },
    {
        name: 'cstar_pennyone_context',
        toolClass: 'READ',
        description: 'Bounded PennyOne/Hall state summaries. No arbitrary SQL is accepted.',
        visibility: 'advanced',
    },
    {
        name: 'cstar_mongo_mailbox',
        toolClass: 'LEGACY',
        description: 'Decommissioned Mongo mirror/intent compatibility surface; always fails closed without secret, network, or write activity.',
        visibility: 'compatibility',
    },
    {
        name: 'cstar_status',
        toolClass: 'READ',
        description: 'Deterministic kernel state snapshot with optional exact Forge execution lifecycle status.',
        visibility: 'default',
    },
    {
        name: 'cstar_persona_set',
        toolClass: 'MUTATION',
        description: 'Explicitly select O.D.I.N. or A.L.F.R.E.D. for the next workflow boundary; style-only and never expands authority or bypasses gates.',
        visibility: 'default',
    },
    {
        name: 'cstar_evolve',
        toolClass: 'READ',
        description: 'Read-only inspection of Karpathy-loop artifacts: list_proposals, get_proposal, list_sprt_history.',
        visibility: 'advanced',
    },
    {
        name: 'cstar_spoke',
        toolClass: 'READ',
        description: 'Redacted mounted-spoke inspection and exact-match prune preview; link, unlink, project, and destructive prune fail closed until a request-scoped operator-attestation contract exists.',
        visibility: 'advanced',
    },
    {
        name: 'cstar_intent_route',
        toolClass: 'READ',
        description: 'Legacy grammar-only compatibility projection; active routing uses cstar_augury.',
        visibility: 'compatibility',
    },
    {
        name: 'cstar_warden',
        toolClass: 'EXECUTION',
        description: 'On-demand local Sentinel Warden execution. list and bounties are read-only; scan starts a constrained project-venv process and performs no LLM inference.',
        visibility: 'advanced',
    },
    {
        name: 'cstar_telemetry',
        toolClass: 'READ',
        description: 'Read-only MCP telemetry summaries over the last 24h.',
        visibility: 'advanced',
    },
    {
        name: 'cstar_researcher_request',
        toolClass: 'REQUEST',
        description: 'Create a CStar-native no-spend Researcher request receipt.',
        visibility: 'default',
    },
    {
        name: 'cstar_forge_request',
        toolClass: 'REQUEST',
        description: 'Persist an immutable Forge request and derive a request-scoped receipt from an active exact-SET mission grant when eligible.',
        visibility: 'default',
    },
    {
        name: 'cstar_forge_authorize',
        toolClass: 'MUTATION',
        description: 'Bind one explicit root-user build instruction or immutable SET authority to an unchanged pending Forge request; performs no provider call.',
        visibility: 'default',
    },
    {
        name: 'cstar_forge_execute',
        toolClass: 'EXECUTION',
        description: 'Atomically run one provider attempt through the private Hermes/MiniMax adapter, with durable replay, independently validated pre-provider continuity, and delivered-pending-validation semantics.',
        visibility: 'default',
    },
] as const satisfies readonly CstarKernelToolCatalogShape[];

export type CstarKernelToolCatalogEntry = typeof CSTAR_KERNEL_TOOL_CATALOG[number];
export type CstarKernelToolName = CstarKernelToolCatalogEntry['name'];

export const CSTAR_KERNEL_TOOL_NAMES = Object.freeze(
    CSTAR_KERNEL_TOOL_CATALOG.map(({ name }) => name),
) as readonly CstarKernelToolName[];

export const CSTAR_KERNEL_DEFAULT_OPERATOR_TOOL_NAMES = Object.freeze(
    CSTAR_KERNEL_TOOL_CATALOG
        .filter(({ visibility }) => visibility === 'default')
        .map(({ name }) => name),
) as readonly CstarKernelToolName[];

export const CSTAR_KERNEL_ADVANCED_TOOL_NAMES = Object.freeze(
    CSTAR_KERNEL_TOOL_CATALOG
        .filter(({ visibility }) => visibility === 'advanced')
        .map(({ name }) => name),
) as readonly CstarKernelToolName[];

export const CSTAR_KERNEL_COMPATIBILITY_TOOL_NAMES = Object.freeze(
    CSTAR_KERNEL_TOOL_CATALOG
        .filter(({ visibility }) => visibility === 'compatibility')
        .map(({ name }) => name),
) as readonly CstarKernelToolName[];

export const CSTAR_KERNEL_COMPATIBILITY_DISCOVERY_TOOL_NAMES = Object.freeze(
    CSTAR_KERNEL_TOOL_CATALOG
        .filter(({ visibility }) => visibility !== 'default')
        .map(({ name }) => name),
) as readonly CstarKernelToolName[];

export function isCstarKernelToolVisibleInProfile(
    name: CstarKernelToolName,
    profile: CstarKernelToolProfile,
): boolean {
    const visibility = getCstarKernelToolCatalogEntry(name).visibility;
    return profile === 'compatibility'
        || visibility === 'default'
        || (profile === 'advanced' && visibility === 'advanced');
}

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
