import { z } from 'zod';

import {
    AUGURY_MISSION_MAX_ITEMS,
    type AnyAuguryMissionBoundaryInput,
} from './augury_mission.js';
import {
    FORGE_CHILD_REQUEST_TEMPLATE_SCHEMA,
    type ForgeChildRequestTemplateV1,
} from './forge_child_request_template.js';

const REFERENCE = /^[^\u0000-\u001f\u007f]{1,1024}$/u;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY_ID = /^repo:[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/;
const DECISION_ID = /^decision:[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/;
const BEAD_ID = /^bead:[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)*$/;
const SPOKE_ID = /^[a-z][a-z0-9-]{0,63}$/;

const referenceSchema = z.string().regex(REFERENCE);
const sha256Schema = z.string().regex(SHA256);
const pathListSchema = z.array(referenceSchema).min(1).max(AUGURY_MISSION_MAX_ITEMS);
const obligationListSchema = z.array(referenceSchema).min(1).max(AUGURY_MISSION_MAX_ITEMS);

const repositorySchema = z.object({
    schema: z.literal('cstar.repository_root_identity.v1'),
    repository_id: z.string().regex(REPOSITORY_ID),
    root_path: referenceSchema,
}).strict();

const designSchema = z.object({
    revision: z.number().int().min(1).max(AUGURY_MISSION_MAX_ITEMS),
    sha256: sha256Schema,
}).strict();

const scopeSchema = z.union([
    z.object({
        schema: z.literal('cstar.mission_scope.v1'),
        domain: z.literal('brain'),
        subject: z.literal('CStar'),
    }).strict(),
    z.object({
        schema: z.literal('cstar.mission_scope.v1'),
        domain: z.literal('estate'),
        subject: z.literal('Corvus'),
    }).strict(),
    z.object({
        schema: z.literal('cstar.mission_scope.v1'),
        domain: z.literal('spoke'),
        subject: z.string().regex(SPOKE_ID),
    }).strict(),
]);

const planItemShape = {
    bead_id: z.string().regex(BEAD_ID),
    dependencies: z.array(z.string().regex(BEAD_ID)).max(AUGURY_MISSION_MAX_ITEMS),
    lane: z.enum(['cos', 'forge', 'researcher', 'corvus_eye']),
    target_paths: pathListSchema,
    acceptance_obligations: obligationListSchema,
    checker_obligations: obligationListSchema,
};

const replayV1Schema = z.object({
    canonical_payload_sha256: sha256Schema,
    receipt_id: referenceSchema,
    ordered_plan_count: z.number().int().min(0).max(AUGURY_MISSION_MAX_ITEMS),
    ordered_plan_sha256: sha256Schema,
}).strict();

const metricSchema = z.object({
    name: referenceSchema,
    threshold: referenceSchema,
    acceptance_rule: referenceSchema.nullable(),
    unit: referenceSchema.nullable(),
}).strict();

const packageLockSchema = z.object({
    path: referenceSchema,
    sha256: sha256Schema,
}).strict();

const requestedActionsSchema = z.union([
    z.tuple([z.literal('response_only')]),
    z.tuple([z.literal('response_only'), z.literal('validation_artifacts')]),
    z.tuple([z.literal('project_files')]),
    z.tuple([z.literal('project_files'), z.literal('validation_artifacts')]),
]);

const forgeChildRequestTemplateSchema: z.ZodType<ForgeChildRequestTemplateV1> = z.object({
    schema: z.literal(FORGE_CHILD_REQUEST_TEMPLATE_SCHEMA),
    objective: referenceSchema,
    prompt: referenceSchema.nullable(),
    system_under_test: referenceSchema.nullable(),
    authority_lane: z.enum(['green', 'yellow', 'red']),
    required_metrics: z.array(metricSchema).min(1).max(AUGURY_MISSION_MAX_ITEMS),
    artifact_expectations: obligationListSchema,
    requested_actions: requestedActionsSchema,
    required_output_paths: z.array(referenceSchema).max(AUGURY_MISSION_MAX_ITEMS),
    lore_paths: z.array(referenceSchema).min(1).max(25),
    isolation_paths: z.array(referenceSchema).min(1).max(25),
    callback_expected_packet: referenceSchema,
    package_locks: z.array(packageLockSchema).max(AUGURY_MISSION_MAX_ITEMS),
}).strict();

const v1BoundarySchema = z.object({
    schema: z.literal('cstar.augury_mission_boundary.v1'),
    repository: repositorySchema,
    mission_decision_id: z.string().regex(DECISION_ID),
    proposed_parent_bead_id: z.string().regex(BEAD_ID),
    design: designSchema,
    scope: scopeSchema,
    contained_target_paths: pathListSchema,
    bead_plan: z.array(z.object(planItemShape).strict())
        .min(1).max(AUGURY_MISSION_MAX_ITEMS),
    replay: replayV1Schema.optional(),
}).strict();

const v2TemplateBindingShape = {
    forge_child_request_template: forgeChildRequestTemplateSchema,
    forge_child_request_template_sha256: sha256Schema,
    forge_child_request_template_bytes: z.number().int().positive(),
};

const v2NullBindingShape = {
    forge_child_request_template: z.null(),
    forge_child_request_template_sha256: z.null(),
    forge_child_request_template_bytes: z.null(),
};

const v2PlanItemSchema = z.union([
    z.object({ ...planItemShape, ...v2TemplateBindingShape }).strict(),
    z.object({ ...planItemShape, ...v2NullBindingShape }).strict(),
]);

const replayV2Schema = replayV1Schema.extend({
    forge_request_template_count: z.number().int().min(0).max(AUGURY_MISSION_MAX_ITEMS),
    ordered_forge_request_templates_sha256: sha256Schema,
}).strict();

const v2BoundarySchema = z.object({
    schema: z.literal('cstar.augury_mission_boundary.v2'),
    version: z.literal(2),
    repository: repositorySchema,
    mission_decision_id: z.string().regex(DECISION_ID),
    proposed_parent_bead_id: z.string().regex(BEAD_ID),
    design: designSchema,
    scope: scopeSchema,
    contained_target_paths: pathListSchema,
    bead_plan: z.array(v2PlanItemSchema).min(1).max(AUGURY_MISSION_MAX_ITEMS),
    replay: replayV2Schema.optional(),
}).strict();

export const auguryMissionBoundarySchema: z.ZodType<AnyAuguryMissionBoundaryInput> =
z.discriminatedUnion('schema', [v1BoundarySchema, v2BoundarySchema]).describe(
    'Strict optional mission materialization boundary. Omit for advisory read-only routing; supply canonical v1 or v2 only for a new current exact SET/design.',
);

const transportRecordSchema = z.record(z.string(), z.unknown());

export const auguryMissionBoundaryTransportSchema = z.object({
    schema: z.enum([
        'cstar.augury_mission_boundary.v1',
        'cstar.augury_mission_boundary.v2',
    ]).describe('Boundary identity discriminant; v2 is preferred and requires version 2.'),
    version: z.literal(2).optional()
        .describe('Required by the strict runtime contract for v2; forbidden for v1.'),
    repository: transportRecordSchema
        .describe('Repository identity object; strict fields and values are validated at runtime.'),
    mission_decision_id: z.string()
        .describe('Canonical decision:<...> identity; strict grammar is validated at runtime.'),
    proposed_parent_bead_id: z.string()
        .describe('Canonical bead:<...> parent identity; strict grammar is validated at runtime.'),
    design: transportRecordSchema
        .describe('Design revision and sha256 binding; strict shape is validated at runtime.'),
    scope: transportRecordSchema
        .describe('Structured brain, estate, or spoke scope; strict shape is validated at runtime.'),
    contained_target_paths: z.array(z.string())
        .describe('Exact contained mission targets; limits and containment are validated at runtime.'),
    bead_plan: z.array(transportRecordSchema).min(1)
        .describe('Ordered plan. V1 uses strict plan items; v2 also requires complete nullable or non-null Forge child-template bindings.'),
    replay: transportRecordSchema.optional()
        .describe('Optional replay binding. V2 additionally binds ordered Forge template count and sha256.'),
}).passthrough().describe(
    'Compact MCP discovery schema only. The handler reparses the complete value with the strict canonical v1/v2 runtime schema before any preparation or materialization.',
);
