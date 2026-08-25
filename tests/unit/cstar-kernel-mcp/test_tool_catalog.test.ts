import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CSTAR_KERNEL_TOOL_CATALOG,
    CSTAR_KERNEL_TOOL_NAMES,
    getCstarKernelToolCatalogEntry,
} from '../../../src/tools/cstar-kernel-mcp/contracts/tool_catalog.js';
import { mcpToolDescription } from '../../../src/tools/cstar-kernel-mcp/contracts/tool_classes.js';
import { registerCoreTools } from '../../../src/tools/cstar-kernel-mcp/register_core_tools.js';

describe('CStar MCP canonical tool catalog', () => {
    it('contains exactly 30 unique public tools and excludes AutoBot', () => {
        const toolNameSet = new Set<string>(CSTAR_KERNEL_TOOL_NAMES);

        assert.equal(CSTAR_KERNEL_TOOL_CATALOG.length, 30);
        assert.deepEqual(
            CSTAR_KERNEL_TOOL_NAMES,
            CSTAR_KERNEL_TOOL_CATALOG.map(({ name }) => name),
        );
        assert.equal(toolNameSet.size, CSTAR_KERNEL_TOOL_NAMES.length);
        assert.ok(CSTAR_KERNEL_TOOL_NAMES.every((name) => /^cstar_[a-z0-9_]+$/.test(name)));
        assert.equal(toolNameSet.has('cstar_autobot'), false);
        assert.equal(toolNameSet.has('cstar_forge_authorize'), true);
        assert.equal(toolNameSet.has('cstar_mission'), true);
        assert.equal(toolNameSet.has('cstar_forge_host_complete'), true);
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
            /machine challenge material stays hidden/i,
        );
        assert.match(
            getCstarKernelToolCatalogEntry('cstar_forge_authorize').description,
            /explicit root-user build instruction or immutable CStar goal-continuation receipt/i,
        );
        assert.match(
            getCstarKernelToolCatalogEntry('cstar_mission').description,
            /ordinary bounded mission coordinator.*never launches workers/i,
        );
        assert.match(
            getCstarKernelToolCatalogEntry('cstar_forge_host_complete').description,
            /without treating delivery as independent validation/i,
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
            CSTAR_KERNEL_TOOL_CATALOG.map((entry) => ({
                name: entry.name,
                description: mcpToolDescription(entry.toolClass, entry.description),
            })),
        );
        assert.deepEqual(instrumentedNames, CSTAR_KERNEL_TOOL_NAMES);
        assert.ok(registrations.every(([, , schema, handler]) => schema && typeof handler === 'function'));

        const mongoRegistration = registrations.find(([name]) => name === 'cstar_mongo_mailbox');
        assert.ok(mongoRegistration);
        const mongoSchema = mongoRegistration[2] as Record<string, any>;
        assert.match(mongoSchema.action.description, /retired compatibility.*fails closed/i);
        assert.match(mongoSchema.operator_authorization_ref.description, /grants no authority.*cannot enable writes/i);

        const personaRegistration = registrations.find(([name]) => name === 'cstar_persona_set');
        assert.ok(personaRegistration);
        const personaSchema = personaRegistration[2] as Record<string, any>;
        assert.deepEqual(Object.keys(personaSchema).sort(), ['expected_current', 'persona']);
        assert.equal(personaSchema.persona.parse('O.D.I.N.'), 'O.D.I.N.');
        assert.equal(personaSchema.expected_current.parse(undefined), undefined);
        assert.equal(personaSchema.expected_current.parse('A.L.F.R.E.D.'), 'A.L.F.R.E.D.');
        assert.throws(() => personaSchema.expected_current.parse('ODIN'), /Invalid (enum value|option)/);

        const missionRegistration = registrations.find(([name]) => name === 'cstar_mission');
        assert.ok(missionRegistration);
        const missionSchema = missionRegistration[2] as Record<string, any>;
        assert.equal(missionSchema.action.parse(undefined), 'materialize');
        assert.equal(missionSchema.queue_dispatch.parse(undefined), false);
        assert.equal(missionSchema.compatibility_profile.parse(undefined), 'cstar_mission_v1');
        assert.equal(Object.hasOwn(missionSchema, 'mission_id'), false);
        assert.equal(Object.hasOwn(missionSchema, 'request_sha256'), false);

        const hostCompleteRegistration = registrations.find(
            ([name]) => name === 'cstar_forge_host_complete',
        );
        assert.ok(hostCompleteRegistration);
    });

    it('publishes the bounded goal-resume-id grammar on Forge authorization', () => {
        const registrations: any[][] = [];
        registerCoreTools(
            { tool: (...args: any[]) => registrations.push(args) },
            (_name, handler) => handler,
        );

        const authorizeRegistration = registrations.find(([name]) => name === 'cstar_forge_authorize');
        assert.ok(authorizeRegistration);
        const authorizeSchema = authorizeRegistration[2] as Record<string, any>;
        const v2 = `goal-resume-v2:${'a'.repeat(64)}`;
        const v1 = `goal-resume:${'b'.repeat(64)}`;

        assert.equal(authorizeSchema.goal_resume_id.parse(v2), v2);
        assert.equal(authorizeSchema.goal_resume_id.parse(v1), v1);
        assert.throws(() => authorizeSchema.goal_resume_id.parse(`goal-resume-v3:${'a'.repeat(64)}`));
        assert.throws(() => authorizeSchema.goal_resume_id.parse(`goal-resume-v2:${'A'.repeat(64)}`));
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
            'forge_request_receipt_id',
            'host_goal_projection',
            'request_sha256',
        ]);
    });
});
