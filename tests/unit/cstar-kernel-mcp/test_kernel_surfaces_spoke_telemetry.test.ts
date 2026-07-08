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

    it('cstar_spoke link reports relinked when slug already exists', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spoke-relink-test-'));
        const captured: any[] = [];
        const originalSave = database.saveHallMountedSpoke;
        const originalGet = database.getHallMountedSpoke;
        mock.method(database, 'saveHallMountedSpoke', (record: any) => {
            captured.push(record);
            spokeStore.set(record.slug, record);
        });
        mock.method(database, 'getHallMountedSpoke', (slugOrId: string) => spokeStore.get(slugOrId) ?? null);
        try {
            // First link.
            const first = await handleSpoke({
                action: 'link',
                slug: 'relink-target',
                root_path: tmpRoot,
            });
            const firstParsed = JSON.parse(first.content[0].text);
            assert.strictEqual(firstParsed.status, 'linked');
            const firstCreatedAt = firstParsed.created_at;

            // Re-link the same slug — must report `relinked` and preserve created_at.
            await new Promise((r) => setTimeout(r, 5));
            const second = await handleSpoke({
                action: 'link',
                slug: 'relink-target',
                root_path: tmpRoot,
            });
            const secondParsed = JSON.parse(second.content[0].text);
            assert.strictEqual(secondParsed.status, 'relinked');
            assert.strictEqual(secondParsed.created_at, firstCreatedAt);
            assert.strictEqual(captured.length, 2);
            assert.strictEqual(captured[1].created_at, firstCreatedAt);
            assert.ok(captured[1].updated_at >= firstCreatedAt);
        } finally {
            (database.saveHallMountedSpoke as any) = originalSave;
            (database.getHallMountedSpoke as any) = originalGet;
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
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
        assert.strictEqual(typeof parsed.token_path.advisor_available, 'boolean');
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
    });

    // ── Phase D: cstar_spoke list expansion ─────────────────────
    it('cstar_spoke list exposes accept_beads, last_scan_at, last_health_at, default_branch, remote_url', async () => {
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
        assert.strictEqual(entry.default_branch, 'trunk');
        assert.strictEqual(entry.remote_url, 'https://example.com/repo.git');
        assert.strictEqual(entry.last_scan_at, 1700000000000);
        assert.strictEqual(entry.last_health_at, 1700000005000);
        assert.strictEqual(entry.accept_beads, true);
        assert.strictEqual(entry.hub_repo_id, 'repo:hub');
        assert.strictEqual(entry.spoke_repo_id, 'repo:/tmp/rich-spoke');
        assert.match(entry.repo_id_semantics, /hub-scoped mounted-spoke owner/);
    });

    it('cstar_spoke project refreshes default_branch from spoke git metadata while preserving hub repo scope', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spoke-project-default-'));
        const originalSave = database.saveHallMountedSpoke;
        mock.method(database, 'saveHallMountedSpoke', (record: any) => {
            spokeStore.set(record.slug, record);
        });
        try {
            await import('node:child_process').then(({ execFileSync }) => {
                execFileSync('git', ['-C', tmpRoot, 'init'], { stdio: 'ignore' });
                execFileSync('git', ['-C', tmpRoot, 'config', 'user.email', 'test@example.com'], { stdio: 'ignore' });
                execFileSync('git', ['-C', tmpRoot, 'config', 'user.name', 'Test User'], { stdio: 'ignore' });
                fs.writeFileSync(path.join(tmpRoot, 'README.md'), '# Demo\n');
                execFileSync('git', ['-C', tmpRoot, 'add', 'README.md'], { stdio: 'ignore' });
                execFileSync('git', ['-C', tmpRoot, 'commit', '-m', 'init'], { stdio: 'ignore' });
                execFileSync('git', ['-C', tmpRoot, 'branch', '-M', 'work/demo'], { stdio: 'ignore' });
                execFileSync('git', ['-C', tmpRoot, 'update-ref', 'refs/remotes/origin/master', 'HEAD'], { stdio: 'ignore' });
                execFileSync('git', ['-C', tmpRoot, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/master'], { stdio: 'ignore' });
            });
            spokeStore.set('project-target', makeSpoke({
                slug: 'project-target',
                spoke_id: 'spoke:project-target',
                repo_id: 'repo:hub',
                root_path: tmpRoot,
                default_branch: 'main',
                metadata: { projection: { git_branch: 'old', git_head: 'old' } },
            }));

            const result = await handleSpoke({ action: 'project', slug: 'project-target' });
            const parsed = JSON.parse(result.content[0].text);
            assert.strictEqual(parsed.status, 'projected');
            const stored = spokeStore.get('project-target');
            assert.ok(stored);
            assert.strictEqual(stored.repo_id, 'repo:hub');
            assert.strictEqual(stored.default_branch, 'master');
            assert.strictEqual((stored.metadata?.projection as any).git_branch, 'work/demo');
            assert.match((stored.metadata?.projection as any).git_head, /^[0-9a-f]{40}$/);
        } finally {
            (database.saveHallMountedSpoke as any) = originalSave;
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
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
        assert.strictEqual(entry.default_branch, null);
        assert.strictEqual(entry.remote_url, null);
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

    // ── Phase C: registry-aligned in-code grammar ───────────────
    it('cstar_intent_route resolves the registry-only triggers (study/harvest/navigate)', async () => {
        // These triggers were missing from the in-code fallback before Phase C
        // and would have failed in registry-unreadable environments.
        const study = JSON.parse((await handleIntentRoute({ prompt: 'study the last engram' })).content[0].text);
        assert.strictEqual(study.status, 'matched');
        assert.strictEqual(study.intent_category, 'DOCUMENT');

        const navigate = JSON.parse((await handleIntentRoute({ prompt: 'navigate to the dashboard' })).content[0].text);
        assert.strictEqual(navigate.status, 'matched');
        assert.strictEqual(navigate.intent_category, 'OBSERVE');
    });
});
