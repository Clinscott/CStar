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

it('cstar_handoff never treats planning, review, input, release, or failure gates as execution allow', () => {
    const expected = {
        planning_active: ['caution', 'verify'],
        review_required: ['caution', 'verify'],
        worker_review_required: ['caution', 'verify'],
        input_required: ['block', 'recover'],
        operator_release_required: ['block', 'refuse'],
        execution_guarded: ['caution', 'verify'],
        failure_recovery: ['block', 'repair'],
    } as const;

    for (const [executionGate, [verdict, action]] of Object.entries(expected)) {
        const payload = buildHandoffMcpPayload({
            execution_gate: executionGate,
            phase: 'TEST',
            next_action: 'Honor the current gate.',
            target_paths: ['src/current.ts'],
            checker_shells: [],
            work_items: [],
        }, '/home/morderith/Corvus/CStar');
        assert.strictEqual(payload.guardrail.verdict, verdict, executionGate);
        assert.strictEqual(payload.guardrail.action, action, executionGate);
    }
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
    assert.strictEqual(parsed.legacy_owner_pmt_thread_id_accepted, false);
    assert.strictEqual(parsed.callback_contract.expected_packet, 'TEST_DISPATCH_PACKET');
    assert.strictEqual(parsed.callback_contract.callback_thread_id, '019e9063-56e8-7831-a7ee-9241badce6c5');
    assert.strictEqual(parsed.dispatch_execution.attempted, false);
    assert.strictEqual(parsed.dispatch_execution.live_spend, false);
    assert.strictEqual(parsed.dispatch_execution.codex_worker_fallback_allowed, false);
    assert.strictEqual(parsed.authorized_dispatch_surface.found, true);
    assert.strictEqual(parsed.required_metrics[0].name, 'artifact_integrity');
});

it('treats project information repositories as optional context rather than authority', async () => {
    const withoutRepository = await handleResearcherRequest(validDispatchRequest({
        state_update_thread_id: undefined,
        dispatch_surface_ref: 'docs/integrations/cstar-kernel-mcp.md',
    }));
    const withoutParsed = JSON.parse(withoutRepository.content[0].text);
    assert.strictEqual(withoutParsed.status, 'dry_run_no_spend');
    assert.strictEqual(withoutParsed.state_update_thread_id, null);
    assert.strictEqual(withoutParsed.legacy_owner_pmt_thread_id_accepted, false);

    const legacyAlias = await handleResearcherRequest(validDispatchRequest({
        state_update_thread_id: undefined,
        owner_pmt_thread_id: 'legacy-project-context-thread',
        dispatch_surface_ref: 'docs/integrations/cstar-kernel-mcp.md',
    }));
    const legacyParsed = JSON.parse(legacyAlias.content[0].text);
    assert.strictEqual(legacyParsed.status, 'dry_run_no_spend');
    assert.strictEqual(legacyParsed.state_update_thread_id, 'legacy-project-context-thread');
    assert.strictEqual(legacyParsed.legacy_owner_pmt_thread_id_accepted, true);
    assert.strictEqual('owner_pmt_thread_id' in legacyParsed, false);
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
    assert.strictEqual(parsed.authorized_dispatch_surface.found, false);
    assert.strictEqual(parsed.error, 'missing_authorized_dispatch_surface');
});

it('cstar_forge_request requires an explicit durable decision id', async () => {
    const result = await handleForgeRequest(validDispatchRequest());
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'rejected');
    assert.strictEqual(parsed.dispatch_kind, 'forge');
    assert.match(parsed.error, /decision_id/);
});

it('cstar_forge_request requires an exact delivery manifest for file-writing adapters', async () => {
    const result = await handleForgeRequest(validDispatchRequest({
        spend_policy: {
            mode: 'live_authorized',
            max_retries: 0,
            live_source_allowed: false,
            operator_authorization_ref: 'operator-unreached-required-output-test',
        },
        decision_id: 'decision-required-output-test',
        execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
        required_output_paths: [],
    }));
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'blocked');
    assert.strictEqual(parsed.error, 'project_files_adapter_requires_required_output_paths');
});

it('cstar_forge_request blocks implementation work on the production response-only adapter path', async () => {
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeFakeForgeAdapter();
    const result = await handleForgeRequest(validDispatchRequest({
        decision_id: 'decision-response-only-implementation-block',
        objective: 'Implement and patch the bounded target',
        requested_actions: ['write the source patch'],
        spend_policy: {
            mode: 'live_authorized',
            max_retries: 0,
            live_source_allowed: false,
            operator_authorization_ref: 'operator-must-not-be-consulted',
        },
        execution_adapter_ref: 'cstar-forge-report-only',
    }));
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'blocked');
    assert.strictEqual(parsed.error, 'adapter_lacks_implementation_write_capability');
});

it('cstar_forge_request rejects required outputs outside explicit targets before authorization', async () => {
    const result = await handleForgeRequest(validDispatchRequest({
        decision_id: 'decision-output-containment-block',
        objective: 'Build one bounded file',
        target_paths: ['src/tools/cstar-kernel-mcp.ts'],
        required_output_paths: ['src/tools/undeclared-sibling.ts'],
        requested_actions: ['write one bounded output'],
        spend_policy: {
            mode: 'live_authorized',
            max_retries: 0,
            live_source_allowed: false,
            operator_authorization_ref: 'operator-must-not-be-consulted',
        },
        execution_adapter_ref: 'cstar-forge-edit-files',
    }));
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'blocked');
    assert.match(parsed.error, /forge_required_output_outside_targets/);
});

for (const fixture of [
    {
        name: 'control text',
        outputs: ['src/tools/cstar-kernel-mcp/tools/PATH_CANARY\nforge_request_contract.ts'],
        code: 'forge_required_output_path_unsafe_text',
    },
    {
        name: 'dot alias',
        outputs: ['src/tools/cstar-kernel-mcp/tools/./forge_request_contract.ts'],
        code: 'forge_required_output_path_alias_forbidden',
    },
    {
        name: 'canonical duplicate',
        outputs: [
            'src/tools/cstar-kernel-mcp/tools/forge_request_contract.ts',
            path.resolve('src/tools/cstar-kernel-mcp/tools/forge_request_contract.ts'),
        ],
        code: 'forge_required_output_duplicate_canonical_path',
    },
]) {
    it(`cstar_forge_request rejects ${fixture.name} before authorization`, async () => {
        const result = await handleForgeRequest(validDispatchRequest({
            decision_id: `decision-required-path-${fixture.name.replace(/\s/g, '-')}`,
            target_paths: ['src/tools/cstar-kernel-mcp/tools/forge_request_contract.ts'],
            required_output_paths: fixture.outputs,
            spend_policy: {
                mode: 'live_authorized', max_retries: 0, live_source_allowed: false,
                operator_authorization_ref: 'operator-must-not-be-consulted',
            },
            execution_adapter_ref: 'cstar-forge-edit-files',
        }));
        const serialized = result.content[0].text;
        assert.match(serialized, new RegExp(fixture.code));
        assert.doesNotMatch(serialized, /PATH_CANARY/);
    });
}

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
    assert.match(parsed.error, /prohibited|red-gated/);
});

it('dispatch requests require live authorization before live spend or live source collection', async () => {
    const result = await handleForgeRequest(validDispatchRequest({
        spend_policy: { mode: 'live_authorized', max_retries: 1, live_source_allowed: true },
        live_source_policy: 'live source collection requested',
    }));
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'rejected');
    assert.match(parsed.error, /operator_authorization_ref/);
});

});
