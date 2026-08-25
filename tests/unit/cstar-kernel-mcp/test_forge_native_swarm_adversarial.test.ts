import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    forgeSwarmCancelSchema,
    forgeSwarmCompleteSchema,
    forgeSwarmPlanSchema,
    forgeSwarmStatusSchema,
    forgeSwarmUpdateSchema,
} from '../../../src/tools/cstar-kernel-mcp/contracts/schemas.js';
import {
    CSTAR_KERNEL_TOOL_CATALOG,
    CSTAR_KERNEL_TOOL_NAMES,
    getCstarKernelToolCatalogEntry,
} from '../../../src/tools/cstar-kernel-mcp/contracts/tool_catalog.js';
import { retiredForgeHostCompletionResponse }
    from '../../../src/tools/cstar-kernel-mcp/contracts/responses.js';
import { registerWorkflowTools } from '../../../src/tools/cstar-kernel-mcp/register_workflow_tools.js';

const NATIVE_NAMES = [
    'cstar_forge_swarm_plan',
    'cstar_forge_swarm_status',
    'cstar_forge_swarm_update',
    'cstar_forge_swarm_complete',
    'cstar_forge_swarm_cancel',
] as const;

function control() {
    return {
        schema: 'cstar.forge_native_control_receipt.v1', run_id: 'native-run-adversarial',
        request_id: 'request-adversarial', lease_id: 'lease-adversarial', lease_expires_at: 10_000,
        cancellation_secret_sha256: 'a'.repeat(64),
    };
}

function plan() {
    return {
        schema: 'cstar.forge_native_swarm_plan.v1', run_id: 'native-run-adversarial',
        parent_task_id: 'root-task-adversarial', work_items: [{
            work_item_id: 'work-adversarial', idempotency_key: 'key-adversarial', objective: 'bounded',
            write_paths: ['/tmp/cstar-adversarial/result.ts'],
            test_paths: ['/tmp/cstar-adversarial/result.test.ts'], output_paths: [], useful: true,
            leaf_index: 0,
        }], integration_paths: [], expected_outputs: ['/tmp/cstar-adversarial/result.ts'],
        plan_sha256: 'b'.repeat(64),
    };
}

test('public native lifecycle schemas are closed and carry no caller authority or host attestation', () => {
    assert.equal(forgeSwarmStatusSchema.safeParse({ run_id: 'native-run-adversarial' }).success, true);
    assert.equal(forgeSwarmStatusSchema.safeParse({ run_id: 'native-run-adversarial', authority_chain: {} }).success, false);
    assert.equal(forgeSwarmPlanSchema.safeParse({ run_id: 'native-run-adversarial',
        control_receipt: control(), plan: plan() }).success, true);
    assert.equal(forgeSwarmPlanSchema.safeParse({ run_id: 'native-run-adversarial',
        control_receipt: control(), plan: plan(), native_context: {} }).success, false);
    assert.equal(forgeSwarmCancelSchema.safeParse({ action: 'request', run_id: 'native-run-adversarial',
        control_receipt: control() }).success, true);
    assert.equal(forgeSwarmCancelSchema.safeParse({ action: 'request', run_id: 'native-run-adversarial',
        control_receipt: control(), host_actual_identity: 'claimed' }).success, false);
    for (const schema of [forgeSwarmUpdateSchema, forgeSwarmCompleteSchema]) {
        assert.equal(schema.safeParse({ run_id: 'native-run-adversarial', control_receipt: control(),
            plan: plan(), actual_identity_attested: true }).success, false);
    }
});

test('catalog exposes five unique native lifecycle tools with exact effect classes', () => {
    assert.equal(new Set(CSTAR_KERNEL_TOOL_NAMES).size, CSTAR_KERNEL_TOOL_NAMES.length);
    const expected = new Map([
        ['cstar_forge_swarm_plan', 'MUTATION'], ['cstar_forge_swarm_status', 'READ'],
        ['cstar_forge_swarm_update', 'MUTATION'], ['cstar_forge_swarm_complete', 'MUTATION'],
        ['cstar_forge_swarm_cancel', 'MUTATION'],
    ]);
    for (const name of NATIVE_NAMES) {
        const entry = getCstarKernelToolCatalogEntry(name);
        assert.equal(entry.toolClass, expected.get(name));
        assert.match(entry.description, /native|direct|DELIVERED_UNVERIFIED|cancellation/i);
    }
    assert.equal(getCstarKernelToolCatalogEntry('cstar_forge_host_complete').toolClass, 'LEGACY');
});

test('workflow registration is catalog-ordered and old host completion is a non-mutating tombstone', async () => {
    const registered: Array<{ name: string; handler: (args: unknown) => Promise<unknown> }> = [];
    const server = { tool: (name: string, _description: string, _schema: unknown,
        handler: (args: unknown) => Promise<unknown>) => { registered.push({ name, handler }); } };
    registerWorkflowTools(server, (_name, handler) => handler);
    const workflowNames = new Set([
        'cstar_researcher_request', 'cstar_forge_request', 'cstar_forge_authorize',
        'cstar_forge_execute', ...NATIVE_NAMES, 'cstar_mission', 'cstar_forge_host_complete',
    ]);
    assert.deepEqual(registered.map((entry) => entry.name),
        CSTAR_KERNEL_TOOL_CATALOG.map((entry) => entry.name).filter((name) => workflowNames.has(name)));
    for (const name of NATIVE_NAMES) assert.equal(registered.filter((entry) => entry.name === name).length, 1);
    const retired = registered.find((entry) => entry.name === 'cstar_forge_host_complete')!;
    const response = await retired.handler({ forged: 'old payload' }) as { content: Array<{ text: string }> };
    const payload = JSON.parse(response.content[0].text);
    assert.equal(payload.outcome, 'domain_terminal'); assert.equal(payload.state_changed, false);
    assert.equal(payload.error_code, 'forge_host_completion_retired');
    assert.deepEqual(retiredForgeHostCompletionResponse(), response);
});

test('public seam contains no old completion mutation or provider fallback', () => {
    const registration = fs.readFileSync('src/tools/cstar-kernel-mcp/register_workflow_tools.ts', 'utf8');
    const handlers = NATIVE_NAMES.map((name) => fs.readFileSync(
        `src/tools/cstar-kernel-mcp/tools/${name.replace('cstar_', '')}.ts`, 'utf8',
    )).join('\n');
    assert.doesNotMatch(registration, /handleForgeHostComplete/);
    assert.doesNotMatch(handlers, /Hermes|MiniMax|AutoBot|codex exec|child_process|spawnSync/);
    assert.match(registration, /retiredForgeHostCompletionResponse/);
});
