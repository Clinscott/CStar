import { z } from 'zod';
import type { HallBeadStatus, HallBeadTargetKind } from '../../types/hall.js';
import { recordResultInputSchema } from './contracts/record_result_input.js';
import { auguryMissionBoundaryTransportSchema } from './contracts/augury_mission_schema.js';
import {
    getCstarKernelToolCatalogEntry,
    type CstarKernelToolName,
} from './contracts/tool_catalog.js';
import { mcpToolDescription } from './contracts/tool_classes.js';
import type { McpRequestContext } from './contracts/request_context.js';
import { handleAugury } from './tools/augury.js';
import { handleBead } from './tools/bead.js';
import { handleManifest, handleSkillInfo, handleSpokeJournal } from './tools/capability.js';
import { handleEvolve } from './tools/evolve.js';
import { handleGoalResume } from './tools/goal_resume.js';
import { handleDoctor, handleHallMaintenance, handleHallSearch, handleHandoff, handleVerifyPlan } from './tools/hall.js';
import { handleEngramRecord, handleWarGameScore } from './tools/war_game.js';
import { handleIntentRoute } from './tools/intent_route.js';
import { handleMongoMailbox } from './tools/mongo_mailbox.js';
import { handlePennyOneContext } from './tools/pennyone_context.js';
import { handlePersonaSet } from './tools/persona_set.js';
import { handleRecordResult } from './tools/result.js';
import { HALL_BEAD_STATUSES, HALL_BEAD_TARGET_KINDS } from './tools/shared.js';
import { handleSpoke } from './tools/spoke.js';
import { handleSpokeBeadImport } from './tools/spoke_bead_import.js';
import { handleStatus } from './tools/status.js';
import { handleTelemetry } from './tools/telemetry.js';
import { handleWarden } from './tools/warden.js';
import { registerWorkflowTools } from './register_workflow_tools.js';

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

export function registerCoreTools(server: ServerWithTool, instrumentTool: InstrumentTool): void {
    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_hall_maintenance',
        {
            action: z.enum(['study', 'harvest']).describe('Retired compatibility action; every invocation fails closed'),
            limit: z.number().min(1).max(20).optional().default(5).describe('Ignored legacy batch size'),
            memory_id: z.string().optional().describe('Ignored legacy Engram id'),
        },
        handleHallMaintenance,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_handoff',
        {
            prompt: z.string().optional().describe('Optional current mission prompt used to label target-aware handoff checks'),
            scope: z.string().optional().describe('Optional current mission scope used to label target-aware handoff checks'),
            target_paths: z.array(z.string()).optional().describe('Optional current mission targets; diverging active sessions are demoted to background'),
        },
        handleHandoff,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_hall_search',
        {
            query: z.string().describe('The search query'),
            limit: z.number().min(1).max(10).optional().default(5).describe('Result limit, max 10'),
            types: z.array(z.enum(['CODE', 'DOC', 'ENGRAM', 'BEAD', 'SESSION', 'LESSON'])).optional().describe('Filter by types'),
        },
        handleHallSearch,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_augury',
        {
            prompt: z.string().describe('The user prompt or mission statement'),
            inferred_intent: z.string().optional().describe('Optional inferred intent'),
            target_paths: z.array(z.string()).optional().describe('Optional target paths'),
            scope: z.string().optional().describe('Optional scope'),
            bead_id: z.string().optional().describe('Optional bead id for route provenance; Augury does not write or link TokenPath advice'),
            mission_boundary: auguryMissionBoundaryTransportSchema.optional(),
        },
        handleAugury,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_doctor',
        {},
        handleDoctor,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_verify_plan',
        {},
        handleVerifyPlan,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_bead',
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
                lore_paths: z.array(z.string()).optional().describe('Safe relative .feature paths; contained bytes must be bound to the validation receipt'),
                isolation_paths: z.array(z.string()).optional().describe('Safe relative focused-test paths; contained bytes must be bound to the validation receipt'),
                audit: z.object({
                    validation_id: z.string().min(1).max(240).optional()
                        .describe('Positive, verified Hall validation receipt bound to this bead'),
                }).strict().optional()
                    .describe('Exact independent validation receipt; caller-provided scores and claimed Warden results are non-authoritative.'),
            }).strict().optional().describe('Sterling Mandate evidence for RESOLVED transitions.'),
            spoke: z.string().optional().describe('Registered Hall spoke slug used to anchor created beads.'),
        },
        handleBead,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_goal_resume',
        {
            forge_request_receipt_id: z.string().regex(/^dispatch-forge-[a-f0-9]{32}$/)
                .describe('Exact immutable Forge request receipt id; request-bound authority is derived by the kernel'),
            request_sha256: z.string().regex(/^[a-f0-9]{64}$/)
                .describe('Exact lowercase SHA-256 of the stored canonical Forge request; no normalization is applied'),
            host_goal_projection: z.object({
                schema: z.literal('cstar.host_get_goal_projection.v1'),
                threadId: z.string().min(1).max(240),
                objective: z.string().min(1).max(65_536)
                    .describe('Exact objective text; SHA-256 covers its UTF-8 bytes without trim or Unicode normalization and raw text is never stored'),
                status: z.literal('blocked'),
                tokensUsed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
                timeUsedSeconds: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
                createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
                updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
                hostResumeCapability: z.literal('unavailable'),
            }).strict().describe('Exact host projection; counters are transient and excluded from canonical receipt material'),
        },
        handleGoalResume,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_spoke_bead_import',
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
        handleSpokeBeadImport,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_record_result',
        recordResultInputSchema,
        handleRecordResult,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_engram_record',
        {
            intent: z.string().describe('Engram intent or tactical summary'),
            bead_id: z.string().describe('Associated bead id'),
            spoke: z.string().optional().describe('Optional mounted spoke slug'),
            metadata: z.record(z.string(), z.unknown()).optional().describe('Small metadata object'),
            memory_id: z.string().optional().describe('Optional explicit memory id'),
        },
        handleEngramRecord,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_war_game_score',
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
        handleWarGameScore,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_manifest',
        {
            scope: z.enum(['hub', 'spoke', 'all']).optional().default('hub').describe('Capability source'),
            spoke: z.string().optional().describe('Optional spoke slug'),
        },
        handleManifest,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_skill_info',
        {
            id: z.string().describe('Capability id; bare for hub, <slug>:<bare> for spoke'),
            spoke: z.string().optional().describe('Optional override of the spoke slug parsed from id'),
        },
        handleSkillInfo,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_spoke_journal',
        {
            spoke: z.string().describe('Slug of a registered spoke'),
        },
        handleSpokeJournal,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_pennyone_context',
        {
            action: z.enum(['status', 'bead_summary', 'validation_summary', 'repository_summary']).optional().default('status').describe('Named read surface'),
            limit: z.number().min(1).max(50).optional().default(10).describe('Returned item cap'),
            statuses: z.array(z.enum(HALL_BEAD_STATUSES as [HallBeadStatus, ...HallBeadStatus[]])).optional().describe('Optional bead status filter'),
            bead_id: z.string().optional().describe('Required for validation_summary'),
        },
        handlePennyOneContext,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_mongo_mailbox',
        {
            action: z.enum(['status', 'mirror_counts', 'enqueue_operator_intent']).optional().default('status').describe('Ignored retired compatibility action; every value fails closed'),
            intent_action: z.enum(['accept', 'decline', 'refine', 'dispatch', 'edit']).optional().describe('Ignored legacy compatibility input'),
            proposal_id: z.string().optional().describe('Ignored legacy compatibility input'),
            payload: z.record(z.string(), z.unknown()).nullable().optional().describe('Ignored legacy compatibility input'),
            actor: z.string().optional().describe('Ignored legacy compatibility input'),
            operator_authorization_ref: z.string().optional().describe('Ignored evidence string; grants no authority and cannot enable writes'),
        },
        handleMongoMailbox,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_status',
        {
            forge_execution_receipt_id: z.string()
                .regex(/^forge-execute-[a-f0-9]{32}$/)
                .optional()
                .describe('Optional exact Forge execution receipt for read-only lifecycle status'),
        },
        handleStatus,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_persona_set',
        {
            persona: z.enum(['O.D.I.N.', 'A.L.F.R.E.D.'])
                .describe('Exact persona state applied only from the next workflow boundary'),
            expected_current: z.enum(['O.D.I.N.', 'A.L.F.R.E.D.']).optional()
                .describe('Optional exact current persona required for compare-and-set'),
        },
        handlePersonaSet,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_evolve',
        {
            action: z.enum(['list_proposals', 'get_proposal', 'list_sprt_history']).describe('Read-only operation'),
            proposal_id: z.string().optional().describe('Required for get_proposal'),
            limit: z.number().min(1).max(100).optional().describe('Returned item cap'),
        },
        handleEvolve,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_spoke',
        {
            action: z.enum(['list', 'link', 'unlink', 'inspect', 'project', 'doctor', 'prune', 'verify', 'health']).describe('Read operation; legacy mutation actions fail closed'),
            slug: z.string().optional().describe('Required for inspect, verify, and health; ignored by retired mutation actions'),
            root_path: z.string().optional().describe('Ignored legacy link input; never read or returned'),
            kind: z.enum(['local', 'git', 'mirror', 'archive']).optional().describe('Ignored legacy link input'),
            remote_url: z.string().optional().describe('Ignored legacy link input; never read or returned'),
            branch: z.string().optional().describe('Ignored legacy link input'),
            trust_level: z.enum(['trusted', 'observe', 'quarantined']).optional().describe('Ignored legacy link input'),
            write_policy: z.enum(['read_write', 'read_only']).optional().describe('Ignored legacy link input'),
            accept_beads: z.boolean().optional().describe('Ignored legacy link input'),
            skip_init: z.boolean().optional().describe('Ignored legacy link input'),
            targets: z.array(z.object({ slug: z.string(), root_path: z.string() })).optional().describe('Exact Hall row/root pairs for read-only prune preview'),
            dry_run: z.boolean().optional().describe('Must be explicitly true for prune preview'),
            cleanup_artifacts: z.boolean().optional().describe('Must remain false; cleanup requires a future verified authority contract'),
        },
        handleSpoke,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_intent_route',
        {
            prompt: z.string().describe('Prompt or mission text to tokenize and match'),
            action: z.enum(['match', 'explain']).optional().default('match').describe('match returns one winner; explain returns all matches'),
        },
        handleIntentRoute,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_warden',
        {
            action: z.enum(['list', 'bounties', 'scan']).describe('list / bounties are read-only; scan is local process execution'),
            warden: z.string().optional().describe('Required for scan'),
            target: z.string().optional().describe('Optional path inside the project root'),
        },
        handleWarden,
    );

    registerCatalogTool(
        server,
        instrumentTool,
        'cstar_telemetry',
        {
            section: z.enum(['all', 'usage', 'usefulness', 'token_path']).optional().default('all').describe('Which summary block(s) to return'),
        },
        handleTelemetry,
    );

    registerWorkflowTools(server, instrumentTool);
}
