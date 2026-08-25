import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    CSTAR_KERNEL_TOOL_CATALOG,
    CSTAR_KERNEL_TOOL_NAMES,
    getCstarKernelToolCatalogEntry,
} from '../../../src/tools/cstar-kernel-mcp/contracts/tool_catalog.js';
import { mcpToolDescription } from '../../../src/tools/cstar-kernel-mcp/contracts/tool_classes.js';
import { registerCoreTools } from '../../../src/tools/cstar-kernel-mcp/register_core_tools.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

describe('CStar MCP canonical tool catalog', () => {
    it('contains exactly 27 unique public tools and excludes AutoBot', () => {
        const toolNameSet = new Set<string>(CSTAR_KERNEL_TOOL_NAMES);

        assert.equal(CSTAR_KERNEL_TOOL_CATALOG.length, 27);
        assert.deepEqual(
            CSTAR_KERNEL_TOOL_NAMES,
            CSTAR_KERNEL_TOOL_CATALOG.map(({ name }) => name),
        );
        assert.equal(toolNameSet.size, CSTAR_KERNEL_TOOL_NAMES.length);
        assert.ok(CSTAR_KERNEL_TOOL_NAMES.every((name) => /^cstar_[a-z0-9_]+$/.test(name)));
        assert.equal(toolNameSet.has('cstar_autobot'), false);
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
            new RegExp(`^## Tool Inventory \\(${CSTAR_KERNEL_TOOL_NAMES.length}\\)$`, 'm'),
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
