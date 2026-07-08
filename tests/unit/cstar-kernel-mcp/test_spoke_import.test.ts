import { beforeEach, describe, it } from 'node:test';
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

describe("CStar MCP rich spoke bead import", () => {
describe('🜂 (rare) cstar_spoke link rejects empty slug after normalization-only', () => {
    it('rejects empty slug after normalization', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spoke-empty-slug-'));
        try {
            const result = await handleSpoke({
                action: 'link',
                slug: '!!!!', // all invalid chars → normalizes to "-" (len 1, still acceptable)
                root_path: tmpRoot,
            });
            // The normalizer collapses to "-" which is 1 char; allowed.
            // To test the empty-after-normalization branch, use only whitespace.
            assert.notStrictEqual(result.isError, true);

            const result2 = await handleSpoke({
                action: 'link',
                slug: '   ',
                root_path: tmpRoot,
            });
            assert.strictEqual(result2.isError, true);
            const parsed = JSON.parse(result2.content[0].text);
            assert.match(parsed.error, /1\.\.64 chars/);
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
});

describe('🜂 cstar_spoke_bead_import — rich spoke handoff payload', () => {
    let tmpSpokeRoot: string;
    let lorePath: string;
    let designPath: string;

    beforeEach(() => {
        tmpSpokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spoke-bead-test-'));
        fs.mkdirSync(path.join(tmpSpokeRoot, 'tests', 'features'), { recursive: true });
        fs.mkdirSync(path.join(tmpSpokeRoot, 'docs', 'design'), { recursive: true });
        lorePath = path.join(tmpSpokeRoot, 'tests', 'features', 'sample.feature');
        designPath = path.join(tmpSpokeRoot, 'docs', 'design', 'SAMPLE.md');
        fs.writeFileSync(lorePath, 'Feature: sample\n');
        fs.writeFileSync(designPath, '# Sample Design\n');
    });

    it('imports a rich bead and stamps lore/design/threat-model metadata', async () => {
        spokeStore.set('test-spoke', makeSpoke({ root_path: tmpSpokeRoot }));

        const result = await handleSpokeBeadImport({
            spoke: 'test-spoke',
            bead_id: 'bead:spoke-import:1',
            intent: 'Wire up the sample subsystem.',
            acceptance_criteria: 'Sample subsystem passes triad.',
            lore_path: 'tests/features/sample.feature',
            design_doc_path: 'docs/design/SAMPLE.md',
            wireframe_ref: 'wireframe.md#sample-pane',
            threat_model_summary: 'In: filesystem payloads. Out: HID injection.',
            target_paths: ['src/services/sample.rs', 'src/services/sample_helpers.rs'],
            augury_block: '◈ Route: BUILD → SKILL: sample ◈',
            checker_shell: 'cargo test --package sample',
        });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'created');
        assert.strictEqual(parsed.spoke, 'test-spoke');
        assert.strictEqual(parsed.repo_id, 'repo:test-spoke');

        const stored = beadStore.get('bead:spoke-import:1');
        assert.strictEqual(stored.repo_id, 'repo:test-spoke');
        assert.strictEqual(stored.target_path, 'src/services/sample.rs');
        assert.deepStrictEqual(
            stored.metadata.extra_target_paths,
            ['src/services/sample_helpers.rs'],
        );
        assert.strictEqual(stored.metadata.lore_path, 'tests/features/sample.feature');
        assert.strictEqual(stored.metadata.design_doc_path, 'docs/design/SAMPLE.md');
        assert.strictEqual(stored.metadata.wireframe_ref, 'wireframe.md#sample-pane');
        assert.match(stored.metadata.threat_model_summary, /filesystem payloads/);
        assert.match(stored.metadata.augury_block, /BUILD → SKILL: sample/);
        assert.ok(stored.contract_refs.includes('lore:tests/features/sample.feature'));
    });

    it('rejects an import when lore_path does not exist on disk', async () => {
        spokeStore.set('test-spoke', makeSpoke({ root_path: tmpSpokeRoot }));
        const result = await handleSpokeBeadImport({
            spoke: 'test-spoke',
            intent: 'Should fail without lore.',
            acceptance_criteria: 'N/A.',
            lore_path: 'tests/features/missing.feature',
        });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /lore_path 'tests\/features\/missing.feature' does not exist/);
    });

    it('rejects an import for an unregistered spoke', async () => {
        const result = await handleSpokeBeadImport({
            spoke: 'ghost-spoke',
            intent: 'No spoke, no bead.',
            acceptance_criteria: 'N/A.',
            lore_path: 'tests/features/sample.feature',
        });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /'ghost-spoke' is not registered/);
    });

    it('rejects an import for a read_only spoke', async () => {
        spokeStore.set('test-spoke', makeSpoke({
            root_path: tmpSpokeRoot,
            write_policy: 'read_only',
        }));
        const result = await handleSpokeBeadImport({
            spoke: 'test-spoke',
            intent: 'Not allowed.',
            acceptance_criteria: 'N/A.',
            lore_path: 'tests/features/sample.feature',
        });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /write_policy='read_only'/);
    });

    it('rejects an import when required fields are missing', async () => {
        spokeStore.set('test-spoke', makeSpoke({ root_path: tmpSpokeRoot }));
        const result = await handleSpokeBeadImport({
            spoke: 'test-spoke',
            intent: '',
            acceptance_criteria: 'set',
            lore_path: 'tests/features/sample.feature',
        });
        assert.strictEqual(result.isError, true);
        const parsed = JSON.parse(result.content[0].text);
        assert.match(parsed.error, /intent is required/);
    });
});
});
