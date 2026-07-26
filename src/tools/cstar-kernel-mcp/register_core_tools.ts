import { z } from 'zod';
import type { HallBeadStatus, HallBeadTargetKind } from '../../types/hall.js';
import { dispatchRequestSchema, forgeExecuteSchema } from './contracts/schemas.js';
import { mcpToolDescription } from './contracts/tool_classes.js';
import { handleAutobot, isAutobotMcpEnabled } from './tools/autobot.js';
import { handleAugury } from './tools/augury.js';
import { handleBead } from './tools/bead.js';
import { handleManifest, handleSkillInfo, handleSpokeJournal } from './tools/capability.js';
import { handleEvolve } from './tools/evolve.js';
import { handleForgeExecute } from './tools/forge_execute.js';
import { handleForgeRequest, handleResearcherRequest } from './tools/dispatch_request.js';
import { handleDoctor, handleHallMaintenance, handleHallSearch, handleHandoff, handleVerifyPlan } from './tools/hall.js';
import { handleEngramRecord, handleWarGameScore } from './tools/war_game.js';
import { handleIntentRoute } from './tools/intent_route.js';
import { handleMongoMailbox } from './tools/mongo_mailbox.js';
import { handlePennyOneContext } from './tools/pennyone_context.js';
import { handleRecordResult } from './tools/result.js';
import { HALL_BEAD_STATUSES, HALL_BEAD_TARGET_KINDS } from './tools/shared.js';
import { handleSpoke } from './tools/spoke.js';
import { handleSpokeBeadImport } from './tools/spoke_bead_import.js';
import { handleStatus } from './tools/status.js';
import { handleTelemetry } from './tools/telemetry.js';
import { handleWarden } from './tools/warden.js';

type ServerWithTool = { tool: (...args: any[]) => unknown };
type InstrumentTool = (name: string, handler: (args: any) => Promise<any>) => any;

export function registerCoreTools(server: ServerWithTool, instrumentTool: InstrumentTool): void {
    server.tool(
        'cstar_hall_maintenance',
        mcpToolDescription('READ', 'Maintenance operations for the Hall of Records: study one Engram or harvest recent lessons.'),
        {
            action: z.enum(['study', 'harvest']).describe('The maintenance action to perform'),
            limit: z.number().min(1).max(20).optional().default(5).describe('Batch size for harvest'),
            memory_id: z.string().optional().describe('Target engram for study'),
        },
        instrumentTool('cstar_hall_maintenance', handleHallMaintenance),
    );

    server.tool(
        'cstar_handoff',
        mcpToolDescription('READ', 'Return compact active state from Augury/handoff logic.'),
        {
            prompt: z.string().optional().describe('Optional current mission prompt used to label target-aware handoff checks'),
            scope: z.string().optional().describe('Optional current mission scope used to label target-aware handoff checks'),
            target_paths: z.array(z.string()).optional().describe('Optional current mission targets; diverging active sessions are demoted to background'),
        },
        instrumentTool('cstar_handoff', handleHandoff),
    );

    server.tool(
        'cstar_hall_search',
        mcpToolDescription('READ', 'Bounded Hall search across code/docs/engrams/beads/sessions/lessons.'),
        {
            query: z.string().describe('The search query'),
            limit: z.number().min(1).max(10).optional().default(5).describe('Result limit, max 10'),
            types: z.array(z.enum(['CODE', 'DOC', 'ENGRAM', 'BEAD', 'SESSION', 'LESSON'])).optional().describe('Filter by types'),
        },
        instrumentTool('cstar_hall_search', handleHallSearch),
    );

    server.tool(
        'cstar_augury',
        mcpToolDescription('READ', 'Resolve a mission to a route with deterministic grammar, active session context, council expert, Mimir targets, and persona advice.'),
        {
            prompt: z.string().describe('The user prompt or mission statement'),
            inferred_intent: z.string().optional().describe('Optional inferred intent'),
            target_paths: z.array(z.string()).optional().describe('Optional target paths'),
            scope: z.string().optional().describe('Optional scope'),
            bead_id: z.string().optional().describe('Optional bead id used to link token-path advice to later validation observations'),
        },
        instrumentTool('cstar_augury', handleAugury),
    );

    server.tool(
        'cstar_doctor',
        mcpToolDescription('READ', 'Diagnose base kernel health and active Augury health.'),
        {},
        instrumentTool('cstar_doctor', handleDoctor),
    );

    server.tool(
        'cstar_verify_plan',
        mcpToolDescription('READ', 'Recommend focused checks; do not run them.'),
        {},
        instrumentTool('cstar_verify_plan', handleVerifyPlan),
    );

    server.tool(
        'cstar_bead',
        mcpToolDescription('MUTATION', 'Create, inspect, claim, block, resolve, and list bounded Hall beads. RESOLVED transitions are gated by the Sterling Mandate.'),
        {
            action: z.enum(['get', 'list', 'create', 'update_status', 'claim', 'resolve', 'block']).describe('Bounded bead action'),
            bead_id: z.string().optional().describe('Hall bead id'),
            limit: z.number().min(1).max(10).optional().default(5).describe('Result limit for list'),
            statuses: z.array(z.enum(HALL_BEAD_STATUSES as [HallBeadStatus, ...HallBeadStatus[]])).optional().describe('Optional list status filter'),
            target_kind: z.enum(HALL_BEAD_TARGET_KINDS as [HallBeadTargetKind, ...HallBeadTargetKind[]]).optional().describe('Target kind for create'),
            target_path: z.string().optional().describe('Target file/path'),
            target_ref: z.string().optional().describe('Target reference'),
            rationale: z.string().optional().describe('Bead rationale, required for create'),
            acceptance_criteria: z.string().optional().describe('Acceptance criteria'),
            checker_shell: z.string().optional().describe('Focused checker command'),
            contract_refs: z.array(z.string()).optional().describe('Contract references'),
            status: z.enum(HALL_BEAD_STATUSES as [HallBeadStatus, ...HallBeadStatus[]]).optional().describe('Status for create/update/claim'),
            assigned_agent: z.string().optional().describe('Assigned agent for claim/create'),
            resolution_note: z.string().optional().describe('Resolution or blocker note'),
            resolved_validation_id: z.string().optional().describe('Validation id used for resolution'),
            validation_id: z.string().optional().describe('Short alias for resolved_validation_id; accepted for bridge compatibility on resolve/update_status=RESOLVED'),
            triage_reason: z.string().optional().describe('Reason for blocked/triage status'),
            metadata: z.record(z.string(), z.unknown()).optional().describe('Small metadata object'),
            mandate_evidence: z.object({
                lore_paths: z.array(z.string()).optional().describe('.feature Gherkin paths; existence-checked'),
                isolation_paths: z.array(z.string()).optional().describe('Unit-test paths; existence-checked'),
                audit: z.object({
                    gungnir_score: z.number().optional().describe('Numeric Gungnir score'),
                    warden_results: z.array(z.object({
                        name: z.string(),
                        verdict: z.enum(['ACCEPTED', 'REJECTED', 'INCONCLUSIVE']),
                        ran_at: z.number(),
                        notes: z.string().optional(),
                    })).optional().describe('Warden run results'),
                    validation_id: z.string().optional().describe('Accepted/success validation id'),
                }).optional().describe('Audit proof. Any sub-field satisfies this leg.'),
            }).optional().describe('Sterling Mandate evidence for RESOLVED transitions.'),
            spoke: z.string().optional().describe('Registered Hall spoke slug used to anchor created beads.'),
        },
        instrumentTool('cstar_bead', handleBead),
    );

    server.tool(
        'cstar_spoke_bead_import',
        mcpToolDescription('MUTATION', 'Import a spoke-originated bead into the Hall through a bounded, validated handoff payload.'),
        {
            spoke: z.string().describe('Registered spoke slug anchoring the imported bead'),
            bead_id: z.string().optional().describe('Optional explicit bead id'),
            intent: z.string().describe('Work intent/rationale'),
            acceptance_criteria: z.string().describe('Acceptance criteria'),
            lore_path: z.string().describe('Required spoke-local lore/feature path'),
            design_doc_path: z.string().optional().describe('Optional spoke-local design doc path'),
            wireframe_ref: z.string().optional().describe('Optional wireframe reference'),
            threat_model_summary: z.string().optional().describe('Optional threat model summary'),
            contract_refs: z.array(z.string()).optional().describe('Contract references'),
            checker_shell: z.string().optional().describe('Focused checker command'),
            target_paths: z.array(z.string()).optional().describe('Spoke-local target paths'),
            target_kind: z.enum(HALL_BEAD_TARGET_KINDS as [HallBeadTargetKind, ...HallBeadTargetKind[]]).optional().describe('Override target kind; defaults to FILE if target_paths given, else SPOKE.'),
            target_ref: z.string().optional().describe('Optional target reference'),
            augury_block: z.string().optional().describe('Optional Augury route block'),
            assigned_agent: z.string().optional().describe('Assigned agent'),
            status: z.enum(HALL_BEAD_STATUSES as [HallBeadStatus, ...HallBeadStatus[]]).optional().describe('Initial status; defaults to OPEN.'),
            metadata: z.record(z.string(), z.unknown()).optional().describe('Small metadata object'),
        },
        instrumentTool('cstar_spoke_bead_import', handleSpokeBeadImport),
    );

    server.tool(
        'cstar_record_result',
        mcpToolDescription('MUTATION', 'Record validation results for a Hall bead, optionally linking token-path observation evidence.'),
        {
            bead_id: z.string().describe('Target bead id'),
            verdict: z.string().describe('Validation verdict'),
            notes: z.string().optional().describe('Compact validation notes'),
            token_path_episode_id: z.string().optional().describe('Episode id from a prior cstar_augury token-path response'),
            token_path_observation: z.record(z.string(), z.unknown()).optional().describe('Structured token-path observation payload'),
        },
        instrumentTool('cstar_record_result', handleRecordResult),
    );

    server.tool(
        'cstar_engram_record',
        mcpToolDescription('MUTATION', 'Publish an Engram to the Hall episodic memory table and fire war-game scoring when applicable.'),
        {
            intent: z.string().describe('Engram intent or tactical summary'),
            bead_id: z.string().describe('Associated bead id'),
            spoke: z.string().optional().describe('Optional mounted spoke slug'),
            metadata: z.record(z.string(), z.unknown()).optional().describe('Small metadata object'),
            memory_id: z.string().optional().describe('Optional explicit memory id'),
        },
        instrumentTool('cstar_engram_record', handleEngramRecord),
    );

    server.tool(
        'cstar_war_game_score',
        mcpToolDescription('MUTATION', 'War-game scoring: register_contest, tally, recent, by_scenario, get_score, list_contests.'),
        {
            action: z.enum(['register_contest', 'tally', 'recent', 'by_scenario', 'get_score', 'list_contests']).describe('War-game scoring action'),
            contest_id: z.string().optional(),
            shot_id: z.string().optional(),
            limit: z.number().min(1).max(100).optional(),
            contest_name: z.string().optional(),
            attacker_label: z.string().optional(),
            defender_label: z.string().optional(),
            attacker_bead_id: z.string().optional(),
            defender_bead_id: z.string().optional(),
            attacker_intent_prefix: z.string().optional(),
            defender_intent_prefix: z.string().optional(),
            shot_id_path: z.string().optional(),
            expected_path: z.string().optional(),
            terminal_event_path: z.string().optional(),
            terminal_event_class_map: z.object({
                block: z.array(z.string()),
                complete: z.array(z.string()),
                inconclusive: z.array(z.string()),
            }).optional(),
            scenario_compatibility_map: z.record(z.string(), z.array(z.string())).optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
        },
        instrumentTool('cstar_war_game_score', handleWarGameScore),
    );

    server.tool(
        'cstar_manifest',
        mcpToolDescription('READ', 'Capability discovery. Returns the kernel registry merged with spoke-local skill manifests.'),
        {
            scope: z.enum(['hub', 'spoke', 'all']).optional().default('hub').describe('Capability source'),
            spoke: z.string().optional().describe('Optional spoke slug'),
        },
        instrumentTool('cstar_manifest', handleManifest),
    );

    server.tool(
        'cstar_skill_info',
        mcpToolDescription('READ', 'Per-capability contract view for hub and namespaced spoke skills.'),
        {
            id: z.string().describe('Capability id; bare for hub, <slug>:<bare> for spoke'),
            spoke: z.string().optional().describe('Optional override of the spoke slug parsed from id'),
        },
        instrumentTool('cstar_skill_info', handleSkillInfo),
    );

    server.tool(
        'cstar_spoke_journal',
        mcpToolDescription('READ', 'Four-file journal state for a registered spoke.'),
        {
            spoke: z.string().describe('Slug of a registered spoke'),
        },
        instrumentTool('cstar_spoke_journal', handleSpokeJournal),
    );

    server.tool(
        'cstar_pennyone_context',
        mcpToolDescription('READ', 'Bounded PennyOne/Hall state summaries. No arbitrary SQL is accepted.'),
        {
            action: z.enum(['status', 'bead_summary', 'validation_summary', 'repository_summary']).optional().default('status').describe('Named read surface'),
            limit: z.number().min(1).max(50).optional().default(10).describe('Returned item cap'),
            statuses: z.array(z.enum(HALL_BEAD_STATUSES as [HallBeadStatus, ...HallBeadStatus[]])).optional().describe('Optional bead status filter'),
            bead_id: z.string().optional().describe('Required for validation_summary'),
        },
        instrumentTool('cstar_pennyone_context', handlePennyOneContext),
    );

    server.tool(
        'cstar_mongo_mailbox',
        mcpToolDescription('MUTATION', 'Mongo mailbox status/counts and bounded operator-intent enqueue. No arbitrary Mongo query is accepted.'),
        {
            action: z.enum(['status', 'mirror_counts', 'enqueue_operator_intent']).optional().default('status').describe('Named Mongo mailbox operation'),
            intent_action: z.enum(['accept', 'decline', 'refine', 'dispatch', 'edit']).optional().describe('Required for enqueue_operator_intent'),
            proposal_id: z.string().optional().describe('Required for enqueue_operator_intent'),
            payload: z.record(z.string(), z.unknown()).nullable().optional().describe('Optional bounded intent payload'),
            actor: z.string().optional().describe('Operator or system actor label'),
        },
        instrumentTool('cstar_mongo_mailbox', handleMongoMailbox),
    );

    server.tool(
        'cstar_status',
        mcpToolDescription('READ', 'Deterministic kernel state snapshot.'),
        {},
        instrumentTool('cstar_status', handleStatus),
    );

    server.tool(
        'cstar_evolve',
        mcpToolDescription('READ', 'Read-only inspection of Karpathy-loop artifacts: list_proposals, get_proposal, list_sprt_history.'),
        {
            action: z.enum(['list_proposals', 'get_proposal', 'list_sprt_history']).describe('Read-only operation'),
            proposal_id: z.string().optional().describe('Required for get_proposal'),
            limit: z.number().min(1).max(100).optional().describe('Returned item cap'),
        },
        instrumentTool('cstar_evolve', handleEvolve),
    );

    server.tool(
        'cstar_spoke',
        mcpToolDescription('MUTATION', 'Mounted-spoke lifecycle: list / link / unlink / inspect / project / doctor / prune / verify / health.'),
        {
            action: z.enum(['list', 'link', 'unlink', 'inspect', 'project', 'doctor', 'prune', 'verify', 'health']).describe('Lifecycle operation'),
            slug: z.string().optional().describe('Required for link, unlink, inspect, project, verify, health'),
            root_path: z.string().optional().describe('Required for link'),
            kind: z.enum(['local', 'git', 'mirror', 'archive']).optional().describe('Spoke kind'),
            remote_url: z.string().optional().describe('Optional remote URL'),
            branch: z.string().optional().describe('Default branch'),
            trust_level: z.enum(['trusted', 'observe', 'quarantined']).optional().describe('Trust policy'),
            write_policy: z.enum(['read_write', 'read_only']).optional().describe('Whether spoke may submit beads'),
            accept_beads: z.boolean().optional().describe('Forces trust=trusted and write_policy=read_write'),
            skip_init: z.boolean().optional().describe('Skip deterministic projection on link'),
            targets: z.array(z.object({ slug: z.string(), root_path: z.string() })).optional().describe('Prune targets'),
            dry_run: z.boolean().optional().describe('Prune dry run flag'),
            cleanup_artifacts: z.boolean().optional().describe('Prune cleanup flag'),
        },
        instrumentTool('cstar_spoke', handleSpoke),
    );

    server.tool(
        'cstar_intent_route',
        mcpToolDescription('READ', 'Deterministic grammar-only routing. Prefer cstar_augury when session context is needed.'),
        {
            prompt: z.string().describe('Prompt or mission text to tokenize and match'),
            action: z.enum(['match', 'explain']).optional().default('match').describe('match returns one winner; explain returns all matches'),
        },
        instrumentTool('cstar_intent_route', handleIntentRoute),
    );

    server.tool(
        'cstar_warden',
        mcpToolDescription('READ', 'On-demand Sentinel Warden invocation. Deterministic scanners only; no LLM inference.'),
        {
            action: z.enum(['list', 'bounties', 'scan']).describe('list / bounties / scan'),
            warden: z.string().optional().describe('Required for scan'),
            target: z.string().optional().describe('Optional path inside the project root'),
        },
        instrumentTool('cstar_warden', handleWarden),
    );

    server.tool(
        'cstar_telemetry',
        mcpToolDescription('READ', 'Read-only MCP telemetry summaries over the last 24h.'),
        {
            section: z.enum(['all', 'usage', 'usefulness', 'token_path']).optional().default('all').describe('Which summary block(s) to return'),
        },
        instrumentTool('cstar_telemetry', handleTelemetry),
    );

    server.tool(
        'cstar_researcher_request',
        mcpToolDescription('REQUEST', 'Create a CStar-native no-spend Researcher request receipt.'),
        dispatchRequestSchema,
        instrumentTool('cstar_researcher_request', handleResearcherRequest),
    );

    server.tool(
        'cstar_forge_request',
        mcpToolDescription('REQUEST', 'Create a CStar-native no-spend Corvus Forge/Hermes MiniMax request receipt.'),
        dispatchRequestSchema,
        instrumentTool('cstar_forge_request', handleForgeRequest),
    );

    server.tool(
        'cstar_forge_execute',
        mcpToolDescription('EXECUTION', 'Execute a CStar-native Corvus Forge contract linked to a cstar_forge_request receipt.'),
        forgeExecuteSchema,
        instrumentTool('cstar_forge_execute', handleForgeExecute),
    );

    if (isAutobotMcpEnabled()) {
        server.tool(
            'cstar_autobot',
            mcpToolDescription('LEGACY', 'Delegate a bounded task to a Hermes-managed sub-agent. Legacy compatibility surface only.'),
            {
                intent: z.string().min(1).describe('One-sentence task statement'),
                project_root: z.string().optional().describe('Anchors relative target_paths'),
                target_paths: z.array(z.string()).optional().describe('Files to read into the prompt'),
                payload: z.object({
                    hermes_profile: z.string().optional(),
                    model: z.string().optional(),
                    expected_output: z.enum(['markdown', 'json', 'plain']).optional(),
                    max_chars: z.number().int().positive().optional(),
                    session_name: z.string().nullable().optional(),
                    write_to: z.string().nullable().optional(),
                    append_with_separator: z.string().nullable().optional(),
                    tags: z.array(z.string()).optional(),
                    timeout_seconds: z.number().int().positive().optional(),
                }).optional(),
            },
            instrumentTool('cstar_autobot', handleAutobot),
        );
    }
}
