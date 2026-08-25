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

describe("CStar MCP promoted kernel surfaces core", () => {
    it('cstar_status returns a deterministic framework snapshot', async () => {
        const result = await handleStatus();
        assert.ok(result.content);
        const parsed = JSON.parse(result.content[0].text);
        if (parsed.error) console.error('Status Error:', parsed.error);
        assert.ok(parsed.framework, 'framework block must be present');
        assert.ok(typeof parsed.framework.status === 'string');
        assert.ok(typeof parsed.framework.active_persona === 'string');
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

    it('cstar_spoke inspect returns the full Hall record for a registered slug', async () => {
        spokeStore.set('alpha', makeSpoke({ slug: 'alpha', spoke_id: 'spoke:alpha', root_path: '/tmp/alpha' }));
        const result = await handleSpoke({ action: 'inspect', slug: 'alpha' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'ok');
        assert.strictEqual(parsed.spoke.slug, 'alpha');
        assert.strictEqual(parsed.spoke.spoke_id, 'spoke:alpha');
        assert.strictEqual(parsed.spoke.hub_repo_id, 'repo:test-spoke');
        assert.strictEqual(parsed.spoke.spoke_repo_id, 'repo:/tmp/alpha');
        assert.match(parsed.spoke.repo_id_semantics, /hub-scoped mounted-spoke owner/);
    });

    it('cstar_spoke inspect errors on unknown slug', async () => {
        const result = await handleSpoke({ action: 'inspect', slug: 'ghost' });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /not registered/);
    });

    it('cstar_spoke link rejects a missing root_path', async () => {
        const result = await handleSpoke({
            action: 'link',
            slug: 'beta',
            root_path: '/nonexistent/path/should/not/exist/anywhere',
        });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /does not exist or is not a directory/);
    });

    it('cstar_spoke link normalizes slug and persists the spoke through the database facade', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spoke-link-test-'));
        const captured: any[] = [];
        const originalSave = database.saveHallMountedSpoke;
        // Capture the persisted payload through the same facade the handler uses.
        mock.method(database, 'saveHallMountedSpoke', (record: any) => {
            captured.push(record);
            spokeStore.set(record.slug, record);
        });
        try {
            const result = await handleSpoke({
                action: 'link',
                slug: 'Test Spoke!',
                root_path: tmpRoot,
                accept_beads: true,
            });
            const parsed = JSON.parse(result.content[0].text);
            assert.strictEqual(parsed.status, 'linked');
            assert.strictEqual(parsed.slug, 'test-spoke-');
            assert.strictEqual(parsed.trust_level, 'trusted');
            assert.strictEqual(parsed.write_policy, 'read_write');
            assert.strictEqual(captured.length, 1);
            assert.strictEqual(captured[0].slug, 'test-spoke-');
            assert.strictEqual(captured[0].mount_status, 'active');
            assert.strictEqual(captured[0].metadata.source, 'cstar_spoke_mcp');
        } finally {
            (database.saveHallMountedSpoke as any) = originalSave;
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    it('cstar_spoke unlink returns unlinked on success and errors on missing', async () => {
        spokeStore.set('gamma', makeSpoke({ slug: 'gamma', spoke_id: 'spoke:gamma' }));
        const removed: string[] = [];
        const originalRemove = database.removeHallMountedSpoke;
        mock.method(database, 'removeHallMountedSpoke', (slugOrId: string) => {
            if (spokeStore.has(slugOrId)) {
                removed.push(slugOrId);
                spokeStore.delete(slugOrId);
                return true;
            }
            return false;
        });
        try {
            const ok = await handleSpoke({ action: 'unlink', slug: 'gamma' });
            const okParsed = JSON.parse(ok.content[0].text);
            assert.strictEqual(okParsed.status, 'unlinked');
            assert.strictEqual(okParsed.slug, 'gamma');
            assert.deepStrictEqual(removed, ['gamma']);

            const missing = await handleSpoke({ action: 'unlink', slug: 'gamma' });
            assert.strictEqual(missing.isError, true);
            const missingParsed = JSON.parse(missing.content[0].text);
            assert.match(missingParsed.error, /not registered/);
        } finally {
            (database.removeHallMountedSpoke as any) = originalRemove;
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
        assert.ok(parsed.source === 'driver' || parsed.source === 'fallback');
        assert.ok(Array.isArray(parsed.wardens));
        assert.ok(typeof parsed.count === 'number');
        const slugs = parsed.wardens.map((w: any) => w.slug);
        assert.ok(slugs.includes('norn'));
        assert.ok(slugs.includes('valkyrie'));
        assert.ok(slugs.includes('freya'));
        assert.ok(slugs.includes('ghost'));
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
