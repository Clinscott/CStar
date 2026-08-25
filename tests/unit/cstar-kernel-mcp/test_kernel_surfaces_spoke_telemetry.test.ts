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

describe("CStar MCP promoted spoke and telemetry surfaces", () => {
    it('cstar_status reports hall_reachable and uptime_seconds', async () => {
        const result = await handleStatus();
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(typeof parsed.hall_reachable, 'boolean');
        assert.ok(parsed.framework);
        // uptime_seconds is null when last_awakening is 0; otherwise a number.
        const uptime = parsed.framework.uptime_seconds;
        assert.ok(uptime === null || typeof uptime === 'number');
    });

    it('cstar_evolve get_proposal rejects path-traversal proposal_id', async () => {
        const result = await handleEvolve({
            action: 'get_proposal',
            proposal_id: '../../../etc/passwd',
        });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /must match.*no path components/);
    });

    it('cstar_evolve get_proposal rejects slash in proposal_id', async () => {
        const result = await handleEvolve({
            action: 'get_proposal',
            proposal_id: 'foo/bar',
        });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /no path components/);
    });

    it('cstar_intent_route rejects an empty prompt', async () => {
        const result = await handleIntentRoute({ prompt: '' });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /non-empty string/);
    });

    it('cstar_intent_route rejects a whitespace-only prompt', async () => {
        const result = await handleIntentRoute({ prompt: '   \n\t  ' });
        assert.strictEqual(result.isError, true);
    });

    it('cstar_intent_route rejects an oversized prompt', async () => {
        const huge = 'a '.repeat(5000); // > 4096 chars
        const result = await handleIntentRoute({ prompt: huge });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /exceeds .* chars/);
    });

    it('cstar_warden scan rejects a target outside the project root', async () => {
        const result = await handleWarden({
            action: 'scan',
            warden: 'ghost',
            target: '/etc/passwd',
        });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /inside the project root/);
    });

    it('cstar_warden scan rejects a non-existent target', async () => {
        const result = await handleWarden({
            action: 'scan',
            warden: 'ghost',
            target: 'definitely/not/a/real/path/anywhere',
        });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /target does not exist/);
    });

    it('cstar_spoke link stays fail-closed even when a matching row already exists', async () => {
        spokeStore.set('relink-target', makeSpoke({ slug: 'relink-target' }));
        const result = await handleSpoke({
            action: 'link',
            slug: 'relink-target',
            root_path: '/home/synthetic/.hermes/private',
        });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(result.isError, true);
        assert.strictEqual(parsed.error, 'spoke_mutation_requires_verified_request_scoped_operator_attestation');
        assert.strictEqual(spokeStore.has('relink-target'), true);
    });

    // ── Phase A: cstar_telemetry ────────────────────────────────
    it('cstar_telemetry returns all three summary sections by default', async () => {
        const result = await handleTelemetry({});
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'ok');
        assert.strictEqual(parsed.section, 'all');
        assert.ok(parsed.usage);
        assert.strictEqual(typeof parsed.usage.total_calls_24h, 'number');
        assert.ok(parsed.usefulness);
        assert.strictEqual(typeof parsed.usefulness.total_calls_24h, 'number');
        assert.ok(parsed.token_path);
        assert.strictEqual(parsed.token_path.status, 'quarantined');
        assert.strictEqual(parsed.token_path.advisor_available, false);
        assert.strictEqual(parsed.token_path.actionable, false);
    });

    it('cstar_telemetry section=usage returns only the usage block', async () => {
        const result = await handleTelemetry({ section: 'usage' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.section, 'usage');
        assert.ok(parsed.usage);
        assert.strictEqual(parsed.usefulness, undefined);
        assert.strictEqual(parsed.token_path, undefined);
    });

    it('cstar_telemetry section=usefulness returns only the usefulness block', async () => {
        const result = await handleTelemetry({ section: 'usefulness' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.section, 'usefulness');
        assert.strictEqual(parsed.usage, undefined);
        assert.ok(parsed.usefulness);
        assert.strictEqual(parsed.token_path, undefined);
    });

    it('cstar_telemetry section=token_path returns only the token-path block', async () => {
        const result = await handleTelemetry({ section: 'token_path' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.section, 'token_path');
        assert.strictEqual(parsed.usage, undefined);
        assert.strictEqual(parsed.usefulness, undefined);
        assert.ok(parsed.token_path);
        assert.strictEqual(parsed.token_path.status, 'quarantined');
        assert.strictEqual(parsed.token_path.advisor_available, false);
        assert.strictEqual(parsed.token_path.external_root_consulted, false);
    });

    // ── Phase D: cstar_spoke list expansion ─────────────────────
    it('cstar_spoke list exposes bounded state while redacting branch, remote, roots, and metadata', async () => {
        spokeStore.set('rich-spoke', makeSpoke({
            slug: 'rich-spoke',
            spoke_id: 'spoke:rich-spoke',
            repo_id: 'repo:hub',
            root_path: '/tmp/rich-spoke',
            default_branch: 'trunk',
            remote_url: 'https://example.com/repo.git',
            last_scan_at: 1700000000000,
            last_health_at: 1700000005000,
            metadata: { accept_beads: true },
        }));
        const result = await handleSpoke({ action: 'list' });
        const parsed = JSON.parse(result.content[0].text);
        const entry = parsed.spokes.find((s: any) => s.slug === 'rich-spoke');
        assert.ok(entry);
        assert.strictEqual(entry.default_branch_configured, true);
        assert.strictEqual(entry.remote_configured, true);
        assert.strictEqual(entry.last_scan_at, 1700000000000);
        assert.strictEqual(entry.last_health_at, 1700000005000);
        assert.strictEqual(entry.accept_beads, true);
        assert.match(entry.root_sha256, /^[a-f0-9]{64}$/);
        assert.match(entry.repository_binding_sha256, /^[a-f0-9]{64}$/);
        assert.strictEqual(entry.default_branch, undefined);
        assert.strictEqual(entry.remote_url, undefined);
        assert.strictEqual(entry.root_path, undefined);
        assert.strictEqual(entry.metadata, undefined);
    });

    it('cstar_spoke project does not inspect Git or modify the mounted row', async () => {
        const original = makeSpoke({ slug: 'project-target', default_branch: 'main' });
        spokeStore.set('project-target', original);
        const result = await handleSpoke({ action: 'project', slug: 'project-target' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(result.isError, true);
        assert.strictEqual(parsed.error, 'spoke_mutation_requires_verified_request_scoped_operator_attestation');
        assert.strictEqual(spokeStore.get('project-target'), original);
    });

    it('cstar_spoke list synthesizes accept_beads from write_policy when metadata is absent', async () => {
        spokeStore.set('legacy-spoke', makeSpoke({
            slug: 'legacy-spoke',
            spoke_id: 'spoke:legacy-spoke',
            write_policy: 'read_only',
            metadata: {},
        }));
        const result = await handleSpoke({ action: 'list' });
        const parsed = JSON.parse(result.content[0].text);
        const entry = parsed.spokes.find((s: any) => s.slug === 'legacy-spoke');
        assert.strictEqual(entry.accept_beads, false);
        assert.strictEqual(entry.default_branch_configured, false);
        assert.strictEqual(entry.remote_configured, false);
    });

    // ── Phase E: cstar_intent_route explain action ──────────────
    it('cstar_intent_route explain returns every matching category', async () => {
        // "build a status check" hits BUILD (build), OBSERVE (status, check), VERIFY (check)
        const result = await handleIntentRoute({
            action: 'explain',
            prompt: 'build a status check',
        });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'matched');
        assert.ok(parsed.grammar_source === 'registry' || parsed.grammar_source === 'fallback');
        assert.ok(parsed.match_count >= 2);
        const categories = parsed.matches.map((m: any) => m.intent_category);
        assert.ok(categories.includes('BUILD'));
        assert.ok(categories.includes('OBSERVE'));
    });

    it('cstar_intent_route explain returns unmatched for prompts that hit no triggers', async () => {
        const result = await handleIntentRoute({
            action: 'explain',
            prompt: 'lorem ipsum dolor sit amet',
        });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'unmatched');
        assert.strictEqual(parsed.match_count, 0);
        assert.deepStrictEqual(parsed.matches, []);
    });

    it('cstar_intent_route surfaces grammar_source on match responses', async () => {
        const result = await handleIntentRoute({
            action: 'match',
            prompt: 'please build something',
        });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'matched');
        assert.ok(parsed.grammar_source === 'registry' || parsed.grammar_source === 'fallback');
    });

    // ── Retired learning routes and active observation grammar ─
    it('does not route retired study/harvest triggers but still resolves navigate', async () => {
        const study = JSON.parse((await handleIntentRoute({ prompt: 'study the last engram' })).content[0].text);
        assert.strictEqual(study.status, 'unmatched');

        const navigate = JSON.parse((await handleIntentRoute({ prompt: 'navigate to the dashboard' })).content[0].text);
        assert.strictEqual(navigate.status, 'matched');
        assert.strictEqual(navigate.intent_category, 'OBSERVE');
    });
});
