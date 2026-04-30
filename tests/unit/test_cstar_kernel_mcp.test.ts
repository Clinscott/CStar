import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { database } from '../../src/tools/pennyone/intel/database.js';

const beadStore = new Map<string, any>();

// Mock database methods before importing tools that use them
mock.method(database, 'getHallRepository', () => ({ repo_id: 'test-repo' }));
mock.method(database, 'saveValidationRun', () => {});
mock.method(database, 'upsertHallBead', (record: any) => {
    const existing = beadStore.get(record.bead_id);
    beadStore.set(record.bead_id, {
        id: record.bead_id,
        repo_id: record.repo_id,
        scan_id: record.scan_id ?? existing?.scan_id ?? '',
        target_kind: record.target_kind ?? existing?.target_kind ?? 'OTHER',
        target_ref: record.target_ref ?? existing?.target_ref,
        target_path: record.target_path ?? existing?.target_path,
        rationale: record.rationale ?? existing?.rationale ?? '',
        contract_refs: record.contract_refs ?? existing?.contract_refs ?? [],
        baseline_scores: record.baseline_scores ?? existing?.baseline_scores ?? {},
        acceptance_criteria: record.acceptance_criteria ?? existing?.acceptance_criteria,
        checker_shell: record.checker_shell ?? existing?.checker_shell,
        status: record.status,
        assigned_agent: record.assigned_agent ?? existing?.assigned_agent,
        source_kind: record.source_kind ?? existing?.source_kind,
        triage_reason: record.triage_reason ?? existing?.triage_reason,
        resolution_note: record.resolution_note ?? existing?.resolution_note,
        resolved_validation_id: record.resolved_validation_id ?? existing?.resolved_validation_id,
        superseded_by: record.superseded_by ?? existing?.superseded_by,
        architect_opinion: record.architect_opinion ?? existing?.architect_opinion,
        critique_payload: record.critique_payload ?? existing?.critique_payload,
        metadata: record.metadata ?? existing?.metadata,
        created_at: record.created_at ?? existing?.created_at ?? Date.now(),
        updated_at: record.updated_at ?? Date.now(),
    });
});
mock.method(database, 'getHallBead', (beadId: string) => beadStore.get(beadId) ?? null);
mock.method(database, 'getHallBeads', (_root: string, statuses?: string[]) => {
    const beads = [...beadStore.values()];
    if (!statuses || statuses.length === 0) {
        return beads;
    }
    const statusSet = new Set(statuses);
    return beads.filter((bead) => statusSet.has(bead.status));
});
mock.method(database, 'searchIntents', () => [
    { type: 'CODE', path: 'src/main.ts', intent: 'Main entry point', rank: 1.0 },
    { type: 'DOC', path: 'docs/README.md', intent: 'Project documentation', rank: 2.0 },
    { type: 'ENGRAM', path: 'engram-123', intent: 'Past interaction memory', rank: 3.0 }
]);
mock.method(database, 'getDb', () => ({
    prepare: () => ({
        all: () => [],
        get: () => null,
        run: () => ({ changes: 0 })
    })
}));

import { 
    handleHandoff, 
    handleHallSearch, 
    handleAugury, 
    handleDoctor, 
    handleVerifyPlan, 
    handleBead,
    handleRecordResult,
    deriveMcpUsefulnessEvent,
    summarizeUsefulnessEvents,
} from '../../src/tools/cstar-kernel-mcp.js';

describe('🔱 CStar Kernel MCP Tools', () => {
    beforeEach(() => {
        beadStore.clear();
    });

    it('cstar_handoff tool handler should return a valid MCP response', async () => {
        const result = await handleHandoff();
        assert.ok(result.content);
        const parsed = JSON.parse(result.content[0].text);
        if (parsed.error) console.error('Handoff Error:', parsed.error);
        assert.ok(parsed.status === 'idle' || parsed.execution_gate || parsed.error === undefined);
    });

    it('cstar_hall_search tool handler should return a list of results and filter by type', async () => {
        // Test base search
        const result = await handleHallSearch({ query: 'test' });
        assert.ok(result.content);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.length, 3);
        assert.strictEqual(parsed[0].type, 'CODE');

        // Test filtering
        const filteredResult = await handleHallSearch({ query: 'test', types: ['DOC'] });
        const filteredParsed = JSON.parse(filteredResult.content[0].text);
        assert.strictEqual(filteredParsed.length, 1);
        assert.strictEqual(filteredParsed[0].type, 'DOC');
    });

    it('cstar_augury tool handler should return routing advice', async () => {
        const result = await handleAugury({ prompt: 'test mission' });
        assert.ok(result.content);
        const parsed = JSON.parse(result.content[0].text);
        if (parsed.error) console.error('Augury Error:', parsed.error);
        assert.strictEqual(parsed.intent_category, 'ORCHESTRATE');
        assert.ok(typeof parsed.expert === 'string');
        assert.ok(typeof parsed.expert_label === 'string');
        assert.ok(typeof parsed.expert_lens === 'string');
        assert.ok(typeof parsed.expert_signature_question === 'string');
        assert.ok(Array.isArray(parsed.expert_guardrails));
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
        });
        const resolveParsed = JSON.parse(resolveResult.content[0].text);
        assert.strictEqual(resolveParsed.status, 'resolved');
        assert.strictEqual(resolveParsed.bead.status, 'RESOLVED');
        assert.strictEqual(resolveParsed.bead.resolved_validation_id, 'validation-1');
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
            { content: [{ type: 'text', text: JSON.stringify([{ type: 'CODE' }]) }] },
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
    });

    it('cstar_augury includes a token_path block when the sidecar is reachable', async () => {
        const result = await handleAugury({
            prompt: 'Add a quiet flag to the simulation runner.',
            inferred_intent: 'BUILD',
            target_paths: ['scripts/run_augury_token_path_simulation.ts'],
        });
        assert.ok(result.content);
        const parsed = JSON.parse(result.content[0].text);
        // Token-path advice is best-effort; absent means sidecar isn't checked
        // out next to CStar. When present, validate the contract.
        if (parsed.token_path) {
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
        }
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
