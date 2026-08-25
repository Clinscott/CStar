import { describe, it } from 'node:test';
import {
    assert,
    fs,
    os,
    path,
    mock,
    database,
    spokeStore,
    beadStore,
    makeSpoke,
    validDispatchRequest,
    validForgeExecuteRequest,
    writeFakeForgeAdapter,
    writeMissingClaimForgeAdapter,
    writeAdvisoryOnlyForgeAdapter,
    writeInspectingForgeWorkerDelegate,
    handleHandoff,
    buildHandoffMcpPayload,
    handleHallSearch,
    handleAugury,
    handleDoctor,
    handleVerifyPlan,
    handleBead,
    handleRecordResult,
    handleSpokeBeadImport,
    resolveSpokeAnchor,
    deriveMcpUsefulnessEvent,
    summarizeUsefulnessEvents,
    handleStatus,
    handleEvolve,
    handleSpoke,
    handleIntentRoute,
    handleWarden,
    handleTelemetry,
    handleResearcherRequest,
    handleForgeRequest,
    handleForgeExecute,
    detectAuguryTargetDivergence,
    decideAugurySessionRouting,
    callerRequestedActiveSessionContinuity,
    resolveAuguryCurrentIntentCategory
} from './shared_test_setup.js';

describe("CStar MCP dispatch request tools", () => {
it('cstar_handoff tool handler should return a valid MCP response', async () => {
    const result = await handleHandoff();
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    if (parsed.error) console.error('Handoff Error:', parsed.error);
    assert.ok(parsed.status === 'idle' || parsed.execution_gate || parsed.error === undefined);
    assert.ok(parsed.guardrail);
    assert.ok(['allow', 'caution', 'block'].includes(parsed.guardrail.verdict));
    assert.ok(['continue', 'recover', 'repair', 'verify', 'refuse'].includes(parsed.guardrail.action));
});

it('cstar_handoff demotes stale active sessions when caller targets diverge', () => {
    const payload = buildHandoffMcpPayload({
        execution_gate: 'execution_guarded',
        phase: 'FORGE_EXECUTION',
        next_action: 'Continue stale registry work',
        designation: {
            intent_category: 'ORCHESTRATE',
            selection_tier: 'WEAVE',
            selection_name: 'orchestrate',
        },
        lead_bead_id: 'registry-separation-rule',
        target_paths: ['.agents/skill_registry.json', 'src/packaging/distributions.ts'],
        checker_shells: [],
        work_items: [
            { bead_id: 'registry-separation-rule', status: 'OPEN', target_path: '.agents/skill_registry.json' },
        ],
    }, '/home/morderith/Corvus/CStar', {
        prompt: 'Repair Researcher CorvusEye malformed output pipeline',
        scope: 'spoke:cstar-console',
        target_paths: ['/home/morderith/Corvus/CorvusEye/tests/truth-verification-red-team'],
    });

    assert.strictEqual(payload.status, 'background_active_session');
    assert.strictEqual(payload.authoritative, false);
    assert.strictEqual(payload.stale_session_demoted, true);
    assert.strictEqual(payload.active_session_authority, 'background');
    assert.strictEqual(payload.guardrail.verdict, 'caution');
    assert.deepStrictEqual(payload.guardrail.warning_checks, ['stale_session_target_divergence']);
    assert.strictEqual(payload.active_session_suggestion.lead_bead_id, 'registry-separation-rule');
    assert.ok(!('lead_bead_id' in payload), 'stale active bead must not be top-level current mission truth');
});

it('cstar_hall_search tool handler should return a guarded result envelope and filter by type', async () => {
    // Test base search
    const result = await handleHallSearch({ query: 'test' });
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'matched');
    assert.strictEqual(parsed.count, 3);
    assert.strictEqual(parsed.results.length, 3);
    assert.strictEqual(parsed.results[0].type, 'CODE');
    assert.strictEqual(parsed.guardrail.verdict, 'allow');

    // Test filtering
    const filteredResult = await handleHallSearch({ query: 'test', types: ['DOC'] });
    const filteredParsed = JSON.parse(filteredResult.content[0].text);
    assert.strictEqual(filteredParsed.status, 'matched');
    assert.strictEqual(filteredParsed.count, 1);
    assert.strictEqual(filteredParsed.results.length, 1);
    assert.strictEqual(filteredParsed.results[0].type, 'DOC');
});

it('cstar_researcher_request returns a no-spend receipt with callback and metric metadata', async () => {
    const result = await handleResearcherRequest(validDispatchRequest({
        dispatch_surface_ref: 'docs/integrations/cstar-kernel-mcp.md',
    }));
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'dry_run_no_spend');
    assert.strictEqual(parsed.dispatch_kind, 'researcher');
    assert.strictEqual(parsed.bead_id, 'bead-test-dispatch');
    assert.ok(parsed.decision_id.startsWith('decision-researcher-'));
    assert.strictEqual(parsed.state_update_thread_id, '019e92ea-f551-7d50-928e-f67f6253ee36');
    assert.strictEqual(parsed.action_authority.primary_action, 'request_receipt');
    assert.strictEqual(parsed.callback_contract.expected_packet, 'TEST_DISPATCH_PACKET');
    assert.strictEqual(parsed.callback_contract.callback_thread_id, '019e9063-56e8-7831-a7ee-9241badce6c5');
    assert.strictEqual(parsed.dispatch_execution.attempted, false);
    assert.strictEqual(parsed.dispatch_execution.live_spend, false);
    assert.strictEqual(parsed.dispatch_execution.codex_worker_fallback_allowed, false);
    assert.strictEqual(parsed.authorized_dispatch_surface.found, true);
    assert.strictEqual(parsed.required_metrics[0].name, 'artifact_integrity');
});

it('cstar_researcher_request proves the default authorized surface but blocks live dispatch without operator authorization', async () => {
    const result = await handleResearcherRequest(validDispatchRequest());
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'dry_run_no_spend');
    assert.strictEqual(parsed.dispatch_kind, 'researcher');
    assert.strictEqual(parsed.authorized_dispatch_surface.found, true);
    assert.strictEqual(
        parsed.authorized_dispatch_surface.selected.ref,
        '.agents/skills/researcher/SKILL.md',
    );
    assert.strictEqual(parsed.dispatch_execution.attempted, false);
    assert.strictEqual(parsed.dispatch_execution.live_spend, false);
    assert.strictEqual(parsed.dispatch_execution.live_source_collection, false);
    assert.strictEqual(parsed.dispatch_execution.codex_worker_fallback_allowed, false);
    assert.strictEqual(parsed.dispatch_execution.fail_closed_reason, 'no_live_dispatch_authority');
});

it('cstar_researcher_request marks complete live-authorized receipts as ready without executing', async () => {
    const result = await handleResearcherRequest(validDispatchRequest({
        spend_policy: {
            mode: 'live_authorized',
            max_retries: 1,
            live_source_allowed: false,
            operator_authorization_ref: 'operator-test-live-researcher',
        },
        retry_policy: { budget: 1, spent: 0 },
    }));
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'ready_for_authorized_dispatch');
    assert.strictEqual(parsed.dispatch_kind, 'researcher');
    assert.strictEqual(parsed.authorized_dispatch_surface.found, true);
    assert.strictEqual(
        parsed.authorized_dispatch_surface.selected.ref,
        '.agents/skills/researcher/SKILL.md',
    );
    assert.strictEqual(parsed.dispatch_execution.attempted, false);
    assert.strictEqual(parsed.dispatch_execution.live_spend, false);
    assert.strictEqual(parsed.dispatch_execution.live_source_collection, false);
    assert.strictEqual(parsed.dispatch_execution.codex_worker_fallback_allowed, false);
    assert.strictEqual(parsed.dispatch_execution.fail_closed_reason, null);
});

it('cstar_forge_request honors explicit decision ids and fails closed on missing dispatch surface', async () => {
    const result = await handleForgeRequest(validDispatchRequest({
        decision_id: 'decision-explicit-forge-test',
        dispatch_surface_ref: 'missing/forge/surface.md',
    }));
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'blocked');
    assert.strictEqual(parsed.dispatch_kind, 'forge');
    assert.strictEqual(parsed.decision_id, 'decision-explicit-forge-test');
    assert.strictEqual(parsed.bead_id, 'bead-test-dispatch');
    assert.strictEqual(parsed.error, 'missing_authorized_dispatch_surface');
});

it('cstar_forge_request proves the default surface and blocks adapter/action capability mismatch before persistence', async () => {
    const result = await handleForgeRequest(validDispatchRequest({
        decision_id: 'decision-forge-action-mismatch-test',
        requested_actions: ['response_only'],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
    }));
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'blocked');
    assert.strictEqual(parsed.dispatch_kind, 'forge');
    assert.strictEqual(parsed.error, 'dispatch_action_adapter_capability_mismatch');
});

it('dispatch requests reject missing required metrics', async () => {
    const result = await handleResearcherRequest(validDispatchRequest({ required_metrics: [] }));
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'rejected');
    assert.match(parsed.error, /required_metrics/);
});

it('dispatch requests reject prohibited or red-gated requested actions', async () => {
    const result = await handleForgeRequest(validDispatchRequest({
        requested_actions: ['merge to master'],
    }));
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'rejected');
    assert.strictEqual(parsed.error, 'dispatch_requested_action_red_gated');
});

it('Forge requests reject live source collection before issuing an exact authorization challenge', async () => {
    const result = await handleForgeRequest(validDispatchRequest({
        decision_id: 'decision-forge-live-source-rejected-test',
        execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        spend_policy: { mode: 'live_authorized', max_retries: 0, live_source_allowed: true },
        retry_policy: { budget: 0, spent: 0 },
        requested_actions: ['response_only', 'authorized_source_collection'],
        live_source_policy: 'live source collection requested',
    }));
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'rejected');
    assert.match(parsed.error, /does not permit live source collection/);
});

});
