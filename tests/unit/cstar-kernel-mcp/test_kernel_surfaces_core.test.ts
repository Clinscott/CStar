import { describe, it } from 'node:test';
import {
    assert,
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

describe("CStar MCP promoted kernel surfaces core", () => {
    it('cstar_status returns a deterministic framework snapshot', async () => {
        const result = await handleStatus();
        assert.ok(result.content);
        const parsed = JSON.parse(result.content[0].text);
        if (parsed.error) console.error('Status Error:', parsed.error);
        assert.ok(parsed.framework, 'framework block must be present');
        assert.ok(typeof parsed.framework.status === 'string');
        assert.ok(parsed.persona === null || parsed.persona === 'O.D.I.N.' || parsed.persona === 'A.L.F.R.E.D.');
        assert.ok(['bounded_config_projection', 'bounded_config_invalid',
            'bounded_config_reader_unavailable', 'self_consistent_unverified',
            'legacy_self_consistent_unverified', 'unavailable']
            .includes(parsed.persona_projection_status));
        assert.equal(parsed.framework.active_persona, undefined);
        assert.ok(typeof parsed.workspace === 'string');
        assert.ok(Array.isArray(parsed.managed_spokes));
        assert.ok(Array.isArray(parsed.agents));
    });

    it('cstar_evolve list_proposals tolerates a missing proposals directory', async () => {
        // Real .agents/proposals/evolve may or may not exist depending on workspace state.
        // The handler must always return a structured response either way.
        const result = await handleEvolve({ action: 'list_proposals', limit: 5 });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'ok');
        assert.ok(typeof parsed.count === 'number');
        assert.ok(Array.isArray(parsed.proposals));
    });

    it('cstar_evolve get_proposal requires proposal_id', async () => {
        const result = await handleEvolve({ action: 'get_proposal' });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /requires proposal_id/);
    });

    it('cstar_evolve get_proposal returns 404-style error for unknown id', async () => {
        const result = await handleEvolve({ action: 'get_proposal', proposal_id: 'no_such_proposal_xyz' });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /not found/);
    });

    it('cstar_evolve list_sprt_history returns a bounded history slice', async () => {
        const result = await handleEvolve({ action: 'list_sprt_history', limit: 5 });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'ok');
        assert.ok(Array.isArray(parsed.history));
        assert.ok(parsed.history.length <= 5);
    });

    it('cstar_evolve rejects invalid actions', async () => {
        const result = await handleEvolve({ action: 'frobnicate' as any });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /invalid evolve action/);
    });

    it('cstar_spoke list returns the mounted spokes from the Hall', async () => {
        spokeStore.set('spoke-a', makeSpoke({ slug: 'spoke-a', spoke_id: 'spoke:spoke-a', root_path: '/tmp/a' }));
        spokeStore.set('spoke-b', makeSpoke({ slug: 'spoke-b', spoke_id: 'spoke:spoke-b', root_path: '/tmp/b' }));
        const result = await handleSpoke({ action: 'list' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'ok');
        assert.strictEqual(parsed.count, 2);
        assert.ok(parsed.spokes.find((s: any) => s.slug === 'spoke-a'));
        assert.ok(parsed.spokes.find((s: any) => s.slug === 'spoke-b'));
    });

    it('cstar_spoke inspect returns a redacted Hall view for a registered slug', async () => {
        spokeStore.set('alpha', makeSpoke({ slug: 'alpha', spoke_id: 'spoke:alpha', root_path: '/tmp/alpha' }));
        const result = await handleSpoke({ action: 'inspect', slug: 'alpha' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'ok');
        assert.strictEqual(parsed.spoke.slug, 'alpha');
        assert.strictEqual(parsed.spoke.spoke_id, 'spoke:alpha');
        assert.match(parsed.spoke.root_sha256, /^[a-f0-9]{64}$/);
        assert.match(parsed.spoke.repository_binding_sha256, /^[a-f0-9]{64}$/);
        assert.strictEqual(parsed.spoke.root_path, undefined);
        assert.strictEqual(parsed.spoke.remote_url, undefined);
        assert.strictEqual(parsed.spoke.metadata, undefined);
    });

    it('cstar_spoke inspect errors on unknown slug', async () => {
        const result = await handleSpoke({ action: 'inspect', slug: 'ghost' });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.error, 'spoke_not_registered');
    });

    it('cstar_spoke mutation actions fail before inspecting their inputs or Hall rows', async () => {
        for (const action of ['link', 'unlink', 'project'] as const) {
            const result = await handleSpoke({
                action,
                slug: 'secret-bearing-caller-value',
                root_path: '/home/synthetic/.hermes/private',
                remote_url: 'https://user:password@example.invalid/repo.git',
            });
            const parsed = JSON.parse(result.content[0].text);
            assert.strictEqual(result.isError, true);
            assert.strictEqual(parsed.error, 'spoke_mutation_requires_verified_request_scoped_operator_attestation');
            assert.doesNotMatch(JSON.stringify(parsed), /password|\.hermes|secret-bearing/);
        }
    });

    it('cstar_intent_route matches a BUILD trigger word', async () => {
        const result = await handleIntentRoute({ prompt: 'please build a feature flag for the gateway' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'matched');
        assert.strictEqual(parsed.intent_category, 'BUILD');
        assert.strictEqual(parsed.tier, 'SKILL');
        assert.strictEqual(parsed.default_path, 'cstar_forge_request');
        assert.strictEqual(parsed.matched_trigger, 'build');
    });

    it('cstar_intent_route returns unmatched for unrelated prompts', async () => {
        const result = await handleIntentRoute({ prompt: 'lorem ipsum dolor sit amet' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'unmatched');
        assert.ok(Array.isArray(parsed.tokens));
        assert.ok(Array.isArray(parsed.available_categories));
    });

    it('cstar_warden list returns the warden inventory and tags its source', async () => {
        const result = await handleWarden({ action: 'list' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'ok');
        assert.strictEqual(parsed.source, 'static_deterministic');
        assert.ok(Array.isArray(parsed.wardens));
        assert.ok(typeof parsed.count === 'number');
        const slugs = parsed.wardens.map((w: any) => w.slug);
        assert.ok(slugs.includes('norn'));
        assert.ok(slugs.includes('valkyrie'));
        assert.ok(slugs.includes('freya'));
        assert.ok(slugs.includes('ghost'));
        assert.ok(slugs.includes('huginn'));
        assert.ok(!slugs.includes('shadow_forge'));
    });

    it('cstar_warden bounties tolerates a missing tech_debt_ledger.json', async () => {
        const result = await handleWarden({ action: 'bounties' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'ok');
        assert.ok(typeof parsed.count === 'number');
        assert.ok(Array.isArray(parsed.top_targets));
    });

    it('cstar_warden scan rejects a malformed warden slug at the gate', async () => {
        // Use chars that violate /^[a-z0-9_]+$/ so we never spawn python in tests.
        const result = await handleWarden({ action: 'scan', warden: 'bad-slug!' });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /warden slug must match/);
    });

    it('cstar_warden scan requires the warden argument', async () => {
        const result = await handleWarden({ action: 'scan' });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /requires warden name/);
    });

});
