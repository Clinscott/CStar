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

describe("CStar MCP Augury, bead, telemetry, and result tools", () => {
it('cstar_augury tool handler should return routing advice', async () => {
    // Prompt with the 'test' trigger word should resolve VERIFY via the
    // deterministic grammar resolver (no session active), not the legacy
    // blind ORCHESTRATE fallback.
    const result = await handleAugury({ prompt: 'test mission' });
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    if (parsed.error) console.error('Augury Error:', parsed.error);
    assert.strictEqual(parsed.intent_category, 'VERIFY');
    assert.ok(typeof parsed.expert === 'string');
    assert.ok(typeof parsed.expert_label === 'string');
    assert.ok(typeof parsed.expert_lens === 'string');
    assert.ok(typeof parsed.expert_signature_question === 'string');
    assert.ok(Array.isArray(parsed.expert_guardrails));

    // routing_provenance exposes both the deterministic match and the
    // (absent) session selection so callers can detect divergence.
    assert.ok(parsed.routing_provenance);
    assert.strictEqual(parsed.routing_provenance.source, 'deterministic');
    assert.ok(parsed.routing_provenance.deterministic);
    assert.strictEqual(parsed.routing_provenance.deterministic.intent_category, 'VERIFY');
    assert.strictEqual(parsed.routing_provenance.session, null);
    assert.strictEqual(parsed.routing_provenance.diverged, false);

    // persona_advice carries the active CStar persona's direction.
    assert.ok(parsed.persona_advice);
    assert.ok(['ODIN', 'ALFRED'].includes(parsed.persona_advice.persona));
    assert.strictEqual(parsed.persona_advice.intent_category, 'VERIFY');
    assert.ok(typeof parsed.persona_advice.direction === 'string');
    assert.ok(parsed.persona_advice.direction.length > 0);
    assert.ok(typeof parsed.persona_advice.tone_directive === 'string');
    assert.ok(['low', 'medium', 'high'].includes(parsed.persona_advice.risk_tolerance));
});

it('cstar_augury falls back to ORCHESTRATE when no grammar trigger and no session exist', async () => {
    // 'xyzzy noise' contains no grammar trigger word, so the deterministic
    // resolver returns null and the handler should use the ORCHESTRATE
    // fallback path (source='fallback', confidence=0.6).
    const result = await handleAugury({ prompt: 'xyzzy noise' });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.intent_category, 'ORCHESTRATE');
    assert.strictEqual(parsed.routing_provenance.source, 'fallback');
    assert.strictEqual(parsed.routing_provenance.deterministic, null);
    assert.strictEqual(parsed.routing_provenance.session, null);
    assert.ok(parsed.persona_advice);
});

it('detects stale Augury session target divergence', () => {
    const divergence = detectAuguryTargetDivergence(
        ['/home/morderith/Corvus/cstar-console', '/home/morderith/Corvus/Moonshot'],
        ['.agents/skill_registry.json', 'src/packaging/distributions.ts'],
        '/home/morderith/Corvus/CStar',
    );

    assert.strictEqual(divergence.diverged, true);
    assert.match(divergence.reason ?? '', /not fully covered/);
    assert.ok(divergence.requested_target_paths.some((targetPath) => targetPath.endsWith('/Corvus/cstar-console')));

    const overlap = detectAuguryTargetDivergence(
        ['/home/morderith/Corvus/CStar/src/tools/cstar-kernel-mcp.ts'],
        ['src/tools'],
        '/home/morderith/Corvus/CStar',
    );
    assert.strictEqual(overlap.diverged, false);
});

it('routes explicit prompt targets instead of stale active session context', () => {
    const grammar = {
        SCORE: { triggers: ['audit'], default_path: 'calculus', tier: 'PRIME' },
        HARDEN: { triggers: ['harden'], default_path: 'contract_hardening', tier: 'WEAVE' },
    };
    const currentRoute = resolveAuguryCurrentIntentCategory(
        [
            'Run',
            'Corvus',
            'Forge',
            'hardening',
            'cycle:',
            'audit',
            'SwarmForge',
            'harden',
            'gates/dispatch/review',
        ],
        grammar,
    );

    assert.strictEqual(currentRoute?.category, 'HARDEN');
    assert.deepStrictEqual(currentRoute?.matched_triggers, ['harden']);

    const decision = decideAugurySessionRouting({
        hasSessionRoute: true,
        hasExplicitTargetPaths: true,
        targetDiverged: true,
        deterministicAvailable: true,
    });

    assert.strictEqual(decision.source, 'deterministic');
    assert.strictEqual(decision.use_session_as_primary, false);
    assert.strictEqual(decision.stale_session_demoted, true);
    assert.strictEqual(decision.stale_session_divergence_blocker, false);
    assert.deepStrictEqual(decision.divergence_warnings, ['stale_session_target_divergence']);
});

it('routes deterministic prompt intent instead of unrelated active session without target paths', () => {
    const decision = decideAugurySessionRouting({
        hasSessionRoute: true,
        hasExplicitTargetPaths: false,
        targetDiverged: false,
        deterministicAvailable: true,
        currentRouteDiverged: true,
    });

    assert.strictEqual(decision.source, 'deterministic');
    assert.strictEqual(decision.use_session_as_primary, false);
    assert.strictEqual(decision.stale_session_demoted, true);
    assert.strictEqual(decision.stale_session_divergence_blocker, false);
    assert.deepStrictEqual(decision.divergence_warnings, ['stale_session_intent_divergence']);
});

it('blocks active-session continuity when deterministic prompt intent diverges', () => {
    const decision = decideAugurySessionRouting({
        hasSessionRoute: true,
        hasExplicitTargetPaths: false,
        targetDiverged: false,
        deterministicAvailable: true,
        currentRouteDiverged: true,
        activeSessionContinuityRequested: true,
    });

    assert.strictEqual(decision.source, 'blocked');
    assert.strictEqual(decision.use_session_as_primary, false);
    assert.strictEqual(decision.stale_session_demoted, false);
    assert.strictEqual(decision.stale_session_divergence_blocker, true);
    assert.deepStrictEqual(decision.divergence_warnings, ['stale_session_intent_divergence']);
    assert.match(decision.required_operator_decision ?? '', /active session intent diverges/);
});

it('does not treat active-session bug descriptions as continuity requests', () => {
    assert.strictEqual(
        callerRequestedActiveSessionContinuity(
            'Repair CStar Augury stale active-session routing so unrelated active sessions cannot override deterministic prompt intent.',
        ),
        false,
    );

    assert.strictEqual(
        callerRequestedActiveSessionContinuity('Use the active session for this continuation.'),
        true,
    );
    assert.strictEqual(
        callerRequestedActiveSessionContinuity('Resume active handoff.'),
        true,
    );
});

it('blocks stale session divergence only when no safe current route exists', () => {
    const decision = decideAugurySessionRouting({
        hasSessionRoute: true,
        hasExplicitTargetPaths: true,
        targetDiverged: true,
        deterministicAvailable: false,
    });

    assert.strictEqual(decision.source, 'blocked');
    assert.strictEqual(decision.use_session_as_primary, false);
    assert.strictEqual(decision.stale_session_demoted, false);
    assert.strictEqual(decision.stale_session_divergence_blocker, true);
    assert.match(decision.required_operator_decision ?? '', /Clarify/);
});

it('cstar_doctor tool handler should return health status', async () => {
    const result = await handleDoctor();
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    if (parsed.error) console.error('Doctor Error:', parsed.error);
    assert.ok(parsed.status === 'healthy' || parsed.status === 'degraded');
    assert.ok(parsed.checks);
    assert.ok(parsed.usefulness);
    assert.strictEqual(typeof parsed.usefulness.total_calls_24h, 'number');
    assert.ok(parsed.token_path);
    assert.strictEqual(typeof parsed.token_path.advisor_available, 'boolean');
    assert.strictEqual(typeof parsed.token_path.advice_count_24h, 'number');
});

it('cstar_verify_plan tool handler should return verification advice', async () => {
    const result = await handleVerifyPlan();
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    if (parsed.error) console.error('Verify Plan Error:', parsed.error);
    assert.ok(parsed.recommended_commands || parsed.error === undefined);
});

it('cstar_bead creates and lists compact Hall beads', async () => {
    const result = await handleBead({
        action: 'create',
        bead_id: 'bead:mcp:test-create',
        target_path: 'src/tools/cstar-kernel-mcp.ts',
        rationale: 'Expose bounded bead operations through the MCP.',
        acceptance_criteria: 'Host can create and inspect a bead without shelling out.',
        checker_shell: 'node scripts/run-tsx.mjs --test tests/unit/test_cstar_kernel_mcp.test.ts',
        contract_refs: ['file:src/tools/cstar-kernel-mcp.ts'],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'created');
    assert.strictEqual(parsed.bead.bead_id, 'bead:mcp:test-create');
    assert.strictEqual(parsed.bead.status, 'OPEN');
    assert.strictEqual(parsed.bead.target_kind, 'FILE');
    assert.strictEqual(parsed.mutation.kind, 'hall_bead_create');
    assert.strictEqual(parsed.mutation.persisted, true);
    assert.strictEqual(parsed.mutation.guardrail.verdict, 'allow');

    const listResult = await handleBead({ action: 'list', statuses: ['OPEN'] });
    const listParsed = JSON.parse(listResult.content[0].text);
    assert.strictEqual(listParsed.status, 'ok');
    assert.strictEqual(listParsed.count, 1);
    assert.strictEqual(listParsed.beads[0].bead_id, 'bead:mcp:test-create');
});

it('cstar_bead claims, blocks, and resolves existing beads', async () => {
    await handleBead({
        action: 'create',
        bead_id: 'bead:mcp:test-transition',
        rationale: 'Exercise bounded status transitions.',
    });

    const claimResult = await handleBead({
        action: 'claim',
        bead_id: 'bead:mcp:test-transition',
        assigned_agent: 'codex',
    });
    const claimParsed = JSON.parse(claimResult.content[0].text);
    assert.strictEqual(claimParsed.status, 'claimed');
    assert.strictEqual(claimParsed.bead.status, 'IN_PROGRESS');
    assert.strictEqual(claimParsed.bead.assigned_agent, 'codex');

    const blockResult = await handleBead({
        action: 'block',
        bead_id: 'bead:mcp:test-transition',
        triage_reason: 'Need user decision.',
    });
    const blockParsed = JSON.parse(blockResult.content[0].text);
    assert.strictEqual(blockParsed.status, 'blocked');
    assert.strictEqual(blockParsed.bead.status, 'BLOCKED');
    assert.strictEqual(blockParsed.bead.triage_reason, 'Need user decision.');

    const resolveResult = await handleBead({
        action: 'resolve',
        bead_id: 'bead:mcp:test-transition',
        resolution_note: 'Accepted after focused verification.',
        resolved_validation_id: 'validation-1',
        mandate_evidence: {
            mandate_exempt: true,
            exemption_reason: 'integration test (mandate exercised separately in sterling_mandate.test.ts)',
        },
    });
    const resolveParsed = JSON.parse(resolveResult.content[0].text);
    assert.strictEqual(resolveParsed.status, 'resolved');
    assert.strictEqual(resolveParsed.bead.status, 'RESOLVED');
    assert.strictEqual(resolveParsed.bead.resolved_validation_id, 'validation-1');
    assert.strictEqual(resolveParsed.sterling_mandate.verdict, 'EXEMPT');
    assert.strictEqual(resolveParsed.mutation.kind, 'hall_bead_resolve');
    assert.strictEqual(resolveParsed.mutation.persisted, true);
});

it('cstar_bead rejects missing beads and invalid create payloads', async () => {
    const missing = await handleBead({ action: 'get', bead_id: 'missing-bead' });
    assert.strictEqual(missing.isError, true);
    assert.match(JSON.parse(missing.content[0].text).error, /not found/i);

    const invalidCreate = await handleBead({ action: 'create' });
    assert.strictEqual(invalidCreate.isError, true);
    assert.match(JSON.parse(invalidCreate.content[0].text).error, /rationale is required/i);
});

it('derives usefulness data for all MCP tool families', () => {
    const searchEvent = deriveMcpUsefulnessEvent(
        { ts: new Date().toISOString(), tool: 'cstar_hall_search', ok: true, duration_ms: 3, root: '/tmp/cstar' },
        { query: 'bead' },
        { content: [{ type: 'text', text: JSON.stringify({ status: 'matched', results: [{ type: 'CODE' }] }) }] },
    );
    assert.strictEqual(searchEvent.outcome_kind, 'search_hit');
    assert.strictEqual(searchEvent.result_count, 1);

    const beadEvent = deriveMcpUsefulnessEvent(
        { ts: new Date().toISOString(), tool: 'cstar_bead', ok: true, duration_ms: 4, root: '/tmp/cstar' },
        { action: 'resolve', bead_id: 'bead:mcp:1' },
        { content: [{ type: 'text', text: JSON.stringify({ status: 'resolved', action: 'resolve', bead: { bead_id: 'bead:mcp:1' } }) }] },
    );
    assert.strictEqual(beadEvent.outcome_kind, 'bead_resolve');
    assert.strictEqual(beadEvent.bead_id, 'bead:mcp:1');

    const validationEvent = deriveMcpUsefulnessEvent(
        { ts: new Date().toISOString(), tool: 'cstar_record_result', ok: true, duration_ms: 5, root: '/tmp/cstar' },
        { bead_id: 'bead:mcp:1' },
        { content: [{ type: 'text', text: JSON.stringify({ status: 'recorded', bead_id: 'bead:mcp:1', verdict: 'SUCCESS' }) }] },
    );
    assert.strictEqual(validationEvent.validation_recorded, true);
    assert.strictEqual(validationEvent.verdict, 'SUCCESS');
});

it('summarizes usefulness data and flags low-outcome search patterns', () => {
    const ts = new Date().toISOString();
    const summary = summarizeUsefulnessEvents([
        { ts, tool: 'cstar_hall_search', ok: true, duration_ms: 1, root: '/tmp/cstar', outcome_kind: 'search_hit', has_results: true },
        { ts, tool: 'cstar_hall_search', ok: true, duration_ms: 1, root: '/tmp/cstar', outcome_kind: 'search_hit', has_results: true },
        { ts, tool: 'cstar_hall_search', ok: true, duration_ms: 1, root: '/tmp/cstar', outcome_kind: 'search_hit', has_results: true },
        { ts, tool: 'cstar_hall_search', ok: true, duration_ms: 1, root: '/tmp/cstar', outcome_kind: 'search_hit', has_results: true },
        { ts, tool: 'cstar_hall_search', ok: true, duration_ms: 1, root: '/tmp/cstar', outcome_kind: 'search_miss', has_results: false },
        { ts, tool: 'cstar_record_result', ok: true, duration_ms: 1, root: '/tmp/cstar', outcome_kind: 'validation_recorded', bead_id: 'bead:mcp:1', validation_recorded: true },
    ]);

    assert.strictEqual(summary.total_calls_24h, 6);
    assert.strictEqual(summary.search_hit_rate, 0.8);
    assert.strictEqual(summary.validations_recorded_24h, 1);
    assert.strictEqual(summary.token_path_advice_count_24h, 0);
    assert.strictEqual(summary.token_path_observation_count_24h, 0);
    assert.ok(summary.usefulness_warnings.some((warning) => /no bead transitions/i.test(warning)));
});

it('cstar_record_result tool handler should record a result', async () => {
    const result = await handleRecordResult({ bead_id: 'test-bead', verdict: 'SUCCESS' });
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    if (parsed.error) console.error('Record Result Error:', parsed.error);
    assert.strictEqual(parsed.status, 'recorded');
    assert.strictEqual(parsed.token_path_observation_id, undefined,
        'no observation_id when token_path_observation is absent');
    assert.strictEqual(parsed.mutation.kind, 'validation_result_record');
    assert.strictEqual(parsed.mutation.persisted, true);
});

it('cstar_augury includes a token_path block when the sidecar is reachable', async () => {
    const result = await handleAugury({
        prompt: 'Add a quiet flag to the simulation runner.',
        inferred_intent: 'BUILD',
        target_paths: ['scripts/run_augury_token_path_simulation.ts'],
    });
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.token_path, 'token_path should be present when the sidecar is reachable');
    assert.strictEqual(parsed.token_path.advisor, 'augury-token-path');
    assert.strictEqual(parsed.token_path.schema_version, 1);
    assert.ok(typeof parsed.token_path.scenario_class === 'string');
    assert.ok(typeof parsed.token_path.mode === 'string');
    assert.ok(typeof parsed.token_path.selected_policy === 'string');
    assert.ok(typeof parsed.token_path.expected_billable_tokens === 'number');
    assert.ok(typeof parsed.token_path.expected_raw_tokens === 'number');
    assert.ok(parsed.token_path.budget && typeof parsed.token_path.budget === 'object');
    assert.ok(parsed.token_path.context_strategy && typeof parsed.token_path.context_strategy === 'object');
    assert.ok(typeof parsed.token_path.episode_id === 'string');
    assert.match(parsed.token_path.episode_id, /^mcp-tp-/);
});

it('cstar_augury escalates ambiguous prompts toward ask-first or defer-escalate', async () => {
    const result = await handleAugury({
        prompt: 'Maybe figure out something better here?',
        inferred_intent: 'REPAIR',
    });
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.token_path, 'token_path should be present');
    assert.ok(
        parsed.token_path.mode === 'ask-first' || parsed.token_path.mode === 'defer-escalate',
        `expected ask-first/defer-escalate for ambiguous prompt, got ${parsed.token_path.mode}`
    );
});

it('cstar_record_result can auto-link a token_path_episode_id from recent advice', async () => {
    const auguryResult = await handleAugury({
        prompt: 'Patch one MCP tool and run a focused unit test.',
        inferred_intent: 'BUILD',
        target_paths: ['src/tools/cstar-kernel-mcp.ts'],
    });
    const auguryParsed = JSON.parse(auguryResult.content[0].text);
    if (!auguryParsed.token_path?.episode_id) {
        return;
    }

    const result = await handleRecordResult({
        bead_id: 'test-bead-auto-tp',
        verdict: 'SUCCESS',
        token_path_episode_id: auguryParsed.token_path.episode_id,
        notes: 'Auto-linked from recent cstar_augury advice.',
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'recorded');
    assert.strictEqual(parsed.token_path_episode_id, auguryParsed.token_path.episode_id);
    assert.ok(typeof parsed.token_path_observation_id === 'string');
    assert.match(parsed.token_path_observation_id, /^mcp-obs-/);
});

it('cstar_record_result accepts an optional token_path_observation payload', async () => {
    const result = await handleRecordResult({
        bead_id: 'test-bead-with-tp',
        verdict: 'SUCCESS',
        token_path_observation: {
            scenario_class: 'BUILD|ambiguity:low|context:medium|targets:single|verification:yes|route:complete|recovery:no|external-research:no|memory:none',
            selected_policy: 'lite-only',
            advised_mode: 'lite',
            token_path_episode_id: 'mcp-tp-test-explicit',
            observed_raw_tokens_episode: 1480,
            observed_billable_tokens_episode: 1340,
            rounds: 1,
            verification_result: 'verified-success',
            terminal_outcome: 'verified-success',
        },
    });
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    if (parsed.error) console.error('Record Result+Observation Error:', parsed.error);
    assert.strictEqual(parsed.status, 'recorded');
    assert.ok(typeof parsed.token_path_observation_id === 'string',
        `expected token_path_observation_id string, got ${parsed.token_path_observation_id}`);
    assert.match(parsed.token_path_observation_id, /^mcp-obs-/);
    assert.strictEqual(parsed.token_path_episode_id, 'mcp-tp-test-explicit');
});

it('cstar_record_result ignores malformed token_path_observation without failing the verdict', async () => {
    const result = await handleRecordResult({
        bead_id: 'test-bead-bad-tp',
        verdict: 'SUCCESS',
        token_path_observation: { scenario_class: 'partial' } as any,
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.status, 'recorded');
    assert.strictEqual(parsed.token_path_observation_id, undefined,
        'malformed observation must be skipped, verdict still recorded');
});
});
