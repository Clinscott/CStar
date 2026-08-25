import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    CSTAR_KERNEL_ADVANCED_TOOL_NAMES,
    CSTAR_KERNEL_COMPATIBILITY_DISCOVERY_TOOL_NAMES,
    CSTAR_KERNEL_COMPATIBILITY_TOOL_NAMES,
    CSTAR_KERNEL_DEFAULT_OPERATOR_TOOL_NAMES,
    CSTAR_KERNEL_TOOL_CATALOG,
    CSTAR_KERNEL_TOOL_NAMES,
    getCstarKernelToolCatalogEntry,
} from '../../../src/tools/cstar-kernel-mcp/contracts/tool_catalog.js';
import { auguryMissionBoundarySchema } from '../../../src/tools/cstar-kernel-mcp/contracts/augury_mission_schema.js';
import { mcpToolDescription } from '../../../src/tools/cstar-kernel-mcp/contracts/tool_classes.js';
import { registerCoreTools } from '../../../src/tools/cstar-kernel-mcp/register_core_tools.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const DEFAULT_TOOL_NAMES = [
    'cstar_handoff',
    'cstar_hall_search',
    'cstar_augury',
    'cstar_doctor',
    'cstar_verify_plan',
    'cstar_bead',
    'cstar_goal_resume',
    'cstar_record_result',
    'cstar_manifest',
    'cstar_skill_info',
    'cstar_status',
    'cstar_persona_set',
    'cstar_researcher_request',
    'cstar_forge_request',
    'cstar_forge_authorize',
    'cstar_forge_execute',
] as const;

describe('CStar MCP canonical tool catalog', () => {
    it('contains 28 unique tools split into exact 16/9/3 visibility classes', () => {
        const toolNameSet = new Set<string>(CSTAR_KERNEL_TOOL_NAMES);

        assert.equal(CSTAR_KERNEL_TOOL_CATALOG.length, 28);
        assert.deepEqual(
            CSTAR_KERNEL_TOOL_NAMES,
            CSTAR_KERNEL_TOOL_CATALOG.map(({ name }) => name),
        );
        assert.equal(toolNameSet.size, CSTAR_KERNEL_TOOL_NAMES.length);
        assert.ok(CSTAR_KERNEL_TOOL_NAMES.every((name) => /^cstar_[a-z0-9_]+$/.test(name)));
        assert.equal(toolNameSet.has('cstar_autobot'), false);
        assert.deepEqual(CSTAR_KERNEL_DEFAULT_OPERATOR_TOOL_NAMES, DEFAULT_TOOL_NAMES);
        assert.equal(CSTAR_KERNEL_ADVANCED_TOOL_NAMES.length, 9);
        assert.equal(CSTAR_KERNEL_COMPATIBILITY_TOOL_NAMES.length, 3);
        assert.equal(CSTAR_KERNEL_COMPATIBILITY_DISCOVERY_TOOL_NAMES.length, 12);
        assert.deepEqual(
            new Set(CSTAR_KERNEL_COMPATIBILITY_DISCOVERY_TOOL_NAMES),
            new Set([
                ...CSTAR_KERNEL_ADVANCED_TOOL_NAMES,
                ...CSTAR_KERNEL_COMPATIBILITY_TOOL_NAMES,
            ]),
        );
        assert.ok(CSTAR_KERNEL_COMPATIBILITY_TOOL_NAMES.includes('cstar_intent_route'));
        assert.equal(CSTAR_KERNEL_COMPATIBILITY_TOOL_NAMES.includes('cstar_forge_authorize'), false);
        assert.ok(CSTAR_KERNEL_DEFAULT_OPERATOR_TOOL_NAMES.includes('cstar_forge_authorize'));
    });

    it('resolves known metadata and fails closed for unknown or decommissioned tools', () => {
        for (const entry of CSTAR_KERNEL_TOOL_CATALOG) {
            assert.strictEqual(getCstarKernelToolCatalogEntry(entry.name), entry);
            assert.ok(entry.description.length > 0);
            assert.ok(!entry.description.startsWith(`${entry.toolClass}:`));
        }

        assert.throws(
            () => getCstarKernelToolCatalogEntry('cstar_autobot'),
            /Unknown CStar kernel MCP tool: cstar_autobot/,
        );
        assert.throws(
            () => getCstarKernelToolCatalogEntry('not-a-cstar-tool'),
            /Unknown CStar kernel MCP tool: not-a-cstar-tool/,
        );
        assert.match(
            getCstarKernelToolCatalogEntry('cstar_forge_request').description,
            /request-scoped receipt from an active exact-SET mission grant/i,
        );
        assert.match(
            getCstarKernelToolCatalogEntry('cstar_forge_authorize').description,
            /explicit root-user build instruction or immutable SET authority/i,
        );
        assert.equal(getCstarKernelToolCatalogEntry('cstar_augury').toolClass, 'MUTATION');
        assert.match(
            getCstarKernelToolCatalogEntry('cstar_augury').description,
            /omission of mission_boundary is read-only/i,
        );
    });

    it('keeps runtime registration names, order, classes, and descriptions catalog-backed', () => {
        const registrations: any[][] = [];
        const instrumentedNames: string[] = [];

        registerCoreTools(
            {
                tool: (...args: any[]) => {
                    registrations.push(args);
                },
            },
            (name, handler) => {
                instrumentedNames.push(name);
                return handler;
            },
        );

        assert.deepEqual(
            registrations.map(([name, description]) => ({ name, description })),
            CSTAR_KERNEL_TOOL_CATALOG
                .filter((entry) => entry.visibility === 'default')
                .map((entry) => ({
                name: entry.name,
                description: mcpToolDescription(entry.toolClass, entry.description),
                })),
        );
        assert.deepEqual(instrumentedNames, CSTAR_KERNEL_DEFAULT_OPERATOR_TOOL_NAMES);
        assert.ok(registrations.every(([, , schema, handler]) => schema && typeof handler === 'function'));
    });

    it('filters every registration from catalog visibility for all profiles', () => {
        const namesFor = (profile: 'default_operator' | 'advanced' | 'compatibility') => {
            const names: string[] = [];
            registerCoreTools(
                { tool: (name: string) => names.push(name) },
                (_name, handler) => handler,
                { profile },
            );
            return names;
        };
        assert.deepEqual(namesFor('default_operator'), DEFAULT_TOOL_NAMES);
        assert.deepEqual(
            namesFor('advanced'),
            CSTAR_KERNEL_TOOL_CATALOG
                .filter(({ visibility }) => visibility !== 'compatibility')
                .map(({ name }) => name),
        );
        const compatibilityNames = namesFor('compatibility');
        assert.deepEqual(compatibilityNames, CSTAR_KERNEL_TOOL_NAMES);
        assert.ok(namesFor('default_operator').includes('cstar_forge_authorize'));
        assert.ok(compatibilityNames.includes('cstar_intent_route'));
    });

    it('splits compact Augury transport discovery from strict v1/v2 runtime authority', () => {
        const registrations: any[][] = [];
        registerCoreTools({ tool: (...args: any[]) => registrations.push(args) }, (_name, handler) => handler);
        const auguryRegistration = registrations.find(([name]) => name === 'cstar_augury');
        assert.ok(auguryRegistration);
        const registeredMissionSchema = auguryRegistration[2].mission_boundary;
        assert.equal(registeredMissionSchema.safeParse(undefined).success, true);

        const planItem = {
            bead_id: 'bead:cstar:host-surface:child',
            dependencies: ['bead:cstar:host-surface:parent'],
            lane: 'forge',
            target_paths: ['src/example.ts'],
            acceptance_obligations: ['Host schema remains exact.'],
            checker_obligations: ['npm run typecheck'],
        };
        const base = {
            repository: { schema: 'cstar.repository_root_identity.v1', repository_id: 'repo:cstar:host-surface', root_path: '/tmp/cstar-host-surface' },
            mission_decision_id: 'decision:cstar:host-surface',
            proposed_parent_bead_id: 'bead:cstar:host-surface:parent',
            design: { revision: 2, sha256: 'a'.repeat(64) },
            scope: { schema: 'cstar.mission_scope.v1', domain: 'brain', subject: 'CStar' },
            contained_target_paths: ['src/example.ts'],
        };
        const replayV1 = { canonical_payload_sha256: 'b'.repeat(64), receipt_id: 'augury-mission:test',
            ordered_plan_count: 1, ordered_plan_sha256: 'c'.repeat(64) };
        const v1 = { schema: 'cstar.augury_mission_boundary.v1', ...base,
            bead_plan: [planItem], replay: replayV1 };

        const template = {
            schema: 'cstar.forge_child_request_template.v1',
            objective: 'Implement exact host surface.',
            prompt: null,
            system_under_test: 'cstar-kernel MCP',
            authority_lane: 'green',
            required_metrics: [{ name: 'focused_tests', threshold: 'all pass',
                acceptance_rule: null, unit: null }],
            artifact_expectations: ['Source and validation evidence.'],
            requested_actions: ['project_files', 'validation_artifacts'],
            required_output_paths: ['src/example.ts'],
            lore_paths: ['tests/features/example.feature'],
            isolation_paths: ['tests/unit/example.test.ts'],
            callback_expected_packet: 'Return exact files and hashes.',
            package_locks: [],
        };
        const v2 = {
            schema: 'cstar.augury_mission_boundary.v2',
            version: 2,
            ...base,
            bead_plan: [{
                ...planItem,
                forge_child_request_template: template,
                forge_child_request_template_sha256: 'd'.repeat(64),
                forge_child_request_template_bytes: 512,
            }],
            replay: {
                ...replayV1,
                forge_request_template_count: 1,
                ordered_forge_request_templates_sha256: 'e'.repeat(64),
            },
        };

        for (const fixture of [v1, v2]) {
            assert.equal(registeredMissionSchema.safeParse(fixture).success, true);
            assert.equal(auguryMissionBoundarySchema.safeParse(fixture).success, true);
        }
        const serializedRegisteredSchema = JSON.stringify(registeredMissionSchema);
        assert.ok(Buffer.byteLength(serializedRegisteredSchema) < 4096);
        for (const identity of [v1.schema, v2.schema]) {
            assert.ok(serializedRegisteredSchema.includes(identity));
        }
        for (const childField of [
            'forge_child_request_template',
            ...Object.keys(template).filter((field) => field !== 'schema'),
        ]) {
            assert.equal(serializedRegisteredSchema.includes(childField), false);
        }

        assert.equal(auguryMissionBoundarySchema.safeParse({ ...v1, extra: true }).success, false);
        assert.equal(auguryMissionBoundarySchema.safeParse({
            ...v2,
            bead_plan: [{ ...v2.bead_plan[0], extra: true }],
        }).success, false);
        assert.equal(auguryMissionBoundarySchema.safeParse({
            ...v2,
            bead_plan: [{
                ...v2.bead_plan[0],
                forge_child_request_template: { ...template, extra: true },
            }],
        }).success, false);
    });

    it('keeps compatibility tombstones fail-closed in the full profile', () => {
        const registrations: any[][] = [];
        registerCoreTools(
            { tool: (...args: any[]) => registrations.push(args) },
            (_name, handler) => handler,
            { profile: 'compatibility' },
        );
        const mongoRegistration = registrations.find(([name]) => name === 'cstar_mongo_mailbox');
        assert.ok(mongoRegistration);
        const mongoSchema = mongoRegistration[2] as Record<string, any>;
        assert.match(mongoSchema.action.description, /retired compatibility.*fails closed/i);
        assert.match(mongoSchema.operator_authorization_ref.description, /grants no authority.*cannot enable writes/i);
    });

    it('rejects scalar Gungnir mandate claims and accepts only receipt-backed audit shapes', () => {
        const registrations: any[][] = [];
        registerCoreTools(
            { tool: (...args: any[]) => registrations.push(args) },
            (_name, handler) => handler,
        );
        const beadRegistration = registrations.find(([name]) => name === 'cstar_bead');
        assert.ok(beadRegistration);
        const beadSchema = beadRegistration[2] as Record<string, any>;

        assert.throws(
            () => beadSchema.mandate_evidence.parse({
                lore_paths: ['tests/features/example.feature'],
                isolation_paths: ['tests/unit/example.test.ts'],
                audit: { gungnir_score: 100 },
            }),
            /unrecognized/i,
        );

        const parsed = beadSchema.mandate_evidence.parse({
            lore_paths: ['tests/features/example.feature'],
            isolation_paths: ['tests/unit/example.test.ts'],
            audit: { validation_id: 'validation:verified:1' },
        });
        assert.equal(parsed.audit.validation_id, 'validation:verified:1');
    });

    it('keeps host-goal continuity separate from bead lifecycle', () => {
        const registrations: any[][] = [];
        registerCoreTools(
            { tool: (...args: any[]) => registrations.push(args) },
            (_name, handler) => handler,
        );

        const beadRegistration = registrations.find(([name]) => name === 'cstar_bead');
        const goalRegistration = registrations.find(([name]) => name === 'cstar_goal_resume');
        assert.ok(beadRegistration);
        assert.ok(goalRegistration);

        const beadSchema = beadRegistration[2] as Record<string, any>;
        const goalSchema = goalRegistration[2] as Record<string, any>;
        assert.equal(Object.hasOwn(beadSchema, 'host_goal_objective_sha256'), false);
        assert.deepEqual(Object.keys(goalSchema).sort(), [
            'continued_bead_id',
            'decision_id',
            'host_goal_objective_sha256',
            'host_goal_snapshot_sha256',
            'host_resume_capability',
            'observed_host_status',
            'repair_bead_id',
        ]);
    });

    it('keeps the reader-facing API table complete against the catalog', () => {
        const apiReference = fs.readFileSync(
            path.join(PROJECT_ROOT, 'docs', 'integrations', 'cstar-kernel-mcp.md'),
            'utf-8',
        );
        assert.match(
            apiReference,
            new RegExp(`^## Tool Inventory \\(${CSTAR_KERNEL_TOOL_NAMES.length}(?:;[^)]*)?\\)$`, 'm'),
        );
        const documentedNames = [...apiReference.matchAll(/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|/gm)]
            .map((match) => match[1]);

        assert.equal(documentedNames.length, CSTAR_KERNEL_TOOL_NAMES.length);
        assert.deepEqual(
            [...documentedNames].sort((left, right) => left.localeCompare(right)),
            [...CSTAR_KERNEL_TOOL_NAMES].sort((left, right) => left.localeCompare(right)),
        );
    });
});
