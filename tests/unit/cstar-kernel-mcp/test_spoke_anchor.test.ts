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

describe("CStar MCP spoke anchor bead operations", () => {
describe('🜂 Spoke-anchored bead operations', () => {
    it('resolveSpokeAnchor returns kernel repo when no spoke is named', () => {
        const anchor = resolveSpokeAnchor(undefined);
        assert.strictEqual(anchor.repoId, 'test-repo');
        assert.strictEqual(anchor.spoke, null);
        assert.strictEqual(anchor.metadata, null);
    });

    it('resolveSpokeAnchor anchors to the spoke repo when registered and trusted', () => {
        spokeStore.set('test-spoke', makeSpoke());
        const anchor = resolveSpokeAnchor('test-spoke');
        assert.strictEqual(anchor.repoId, 'repo:test-spoke');
        assert.ok(anchor.spoke);
        assert.strictEqual(anchor.metadata?.spoke_slug, 'test-spoke');
        assert.strictEqual(anchor.metadata?.spoke_trust_level, 'trusted');
    });

    it('resolveSpokeAnchor rejects an unregistered spoke', () => {
        assert.throws(
            () => resolveSpokeAnchor('not-a-real-spoke'),
            /not registered in the Hall estate/,
        );
    });

    it('resolveSpokeAnchor rejects a disconnected spoke', () => {
        spokeStore.set('test-spoke', makeSpoke({ mount_status: 'disconnected' }));
        assert.throws(
            () => resolveSpokeAnchor('test-spoke'),
            /is not active/,
        );
    });

    it('resolveSpokeAnchor rejects a quarantined spoke', () => {
        spokeStore.set('test-spoke', makeSpoke({ trust_level: 'quarantined' }));
        assert.throws(
            () => resolveSpokeAnchor('test-spoke'),
            /quarantined/,
        );
    });

    it('resolveSpokeAnchor rejects a read_only spoke', () => {
        spokeStore.set('test-spoke', makeSpoke({ write_policy: 'read_only' }));
        assert.throws(
            () => resolveSpokeAnchor('test-spoke'),
            /write_policy='read_only'/,
        );
    });

    it('cstar_bead create with spoke anchors the bead to the spoke repo', async () => {
        spokeStore.set('test-spoke', makeSpoke());

        const result = await handleBead({
            action: 'create',
            bead_id: 'bead:spoke:anchor-1',
            spoke: 'test-spoke',
            rationale: 'Bead from a registered spoke.',
            target_path: 'src/feature.rs',
        });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'created');
        assert.strictEqual(parsed.spoke, 'test-spoke');
        assert.strictEqual(parsed.repo_id, 'repo:test-spoke');

        const stored = beadStore.get('bead:spoke:anchor-1');
        assert.strictEqual(stored.repo_id, 'repo:test-spoke');
        assert.strictEqual(stored.metadata.spoke_slug, 'test-spoke');
        assert.strictEqual(stored.metadata.spoke_trust_level, 'trusted');
    });

    it('cstar_bead create with unregistered spoke errors out', async () => {
        const result = await handleBead({
            action: 'create',
            bead_id: 'bead:spoke:should-fail',
            spoke: 'ghost-spoke',
            rationale: 'Should never land.',
        });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /'ghost-spoke' is not registered/);
        assert.strictEqual(beadStore.has('bead:spoke:should-fail'), false);
    });

    it('cstar_bead create with no spoke arg keeps kernel-anchored behavior', async () => {
        const result = await handleBead({
            action: 'create',
            bead_id: 'bead:kernel-anchored',
            rationale: 'Kernel-side bead.',
        });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'created');
        assert.strictEqual(parsed.spoke, undefined);
        assert.strictEqual(beadStore.get('bead:kernel-anchored').repo_id, 'test-repo');
    });
});
});
