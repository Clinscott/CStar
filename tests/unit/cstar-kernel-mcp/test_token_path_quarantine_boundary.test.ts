import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
    appendTokenPathAdvice,
    appendTokenPathObservation,
    buildTokenPathQuarantineStatus,
    runTokenPathAdvisor,
    summarizeRecentTokenPathIntegration,
    type TokenPathRecommendation,
} from '../../../src/tools/cstar-kernel-mcp/telemetry/token_path.js';
import { handleAugury } from './shared_test_setup.js';

const ROOT = process.cwd();
const HOSTILE_ROOT = '/synthetic-hostile-token-path-root';

function recommendation(): TokenPathRecommendation {
    return {
        advisor: 'augury-token-path',
        schema_version: 1,
        mode: 'lite-only',
        selected_policy: 'hostile-policy',
        scenario_class: 'synthetic',
        context_strategy: {},
        budget: {},
        decision_reason: 'must never be attached',
        confidence: 1,
        rationale: ['must never be attached'],
        expected_billable_tokens: 1,
        expected_raw_tokens: 1,
        requires_followup: false,
        execution_deferred: false,
    };
}

describe('TokenPath quarantine boundary', () => {
    it('returns only a static non-actionable status and ignores a hostile root override', async () => {
        const previous = process.env.AUGURY_TOKEN_PATH_ROOT;
        const originalExistsSync = fs.existsSync;
        const probedPaths: string[] = [];
        fs.existsSync = ((candidate: fs.PathLike) => {
            probedPaths.push(String(candidate));
            return originalExistsSync(candidate);
        }) as typeof fs.existsSync;
        process.env.AUGURY_TOKEN_PATH_ROOT = HOSTILE_ROOT;

        try {
            const result = await handleAugury({
                prompt: 'Repair a bounded CStar routing contract.',
                inferred_intent: 'REPAIR',
                target_paths: ['src/tools/cstar-kernel-mcp/tools/augury.ts'],
            });
            const parsed = JSON.parse(result.content[0].text);

            assert.deepStrictEqual(parsed.token_path, buildTokenPathQuarantineStatus());
            assert.strictEqual(parsed.token_path.actionable, false);
            assert.strictEqual(parsed.token_path.advice_attached, false);
            assert.strictEqual(parsed.token_path.episode_id, undefined);
            assert.strictEqual(parsed.token_path.selected_policy, undefined);
            assert.strictEqual(parsed.token_path.confidence, undefined);
            assert.ok(!probedPaths.some((candidate) => candidate.startsWith(HOSTILE_ROOT)));
        } finally {
            fs.existsSync = originalExistsSync;
            if (previous === undefined) delete process.env.AUGURY_TOKEN_PATH_ROOT;
            else process.env.AUGURY_TOKEN_PATH_ROOT = previous;
        }
    });

    it('keeps advisor and append compatibility entrypoints fail closed without receipts', async () => {
        const candidate = recommendation();
        const originalCandidate = structuredClone(candidate);
        const originalAppendFileSync = fs.appendFileSync;
        const originalMkdirSync = fs.mkdirSync;
        let filesystemWrites = 0;
        fs.appendFileSync = (() => { filesystemWrites += 1; }) as typeof fs.appendFileSync;
        fs.mkdirSync = (() => {
            filesystemWrites += 1;
            return undefined;
        }) as typeof fs.mkdirSync;

        try {
            assert.strictEqual(await runTokenPathAdvisor({ prompt: 'synthetic' }), null);
            assert.strictEqual(appendTokenPathAdvice({ prompt: 'synthetic' }, candidate), null);
            assert.strictEqual(appendTokenPathObservation('bead:synthetic', {
                scenario_class: 'synthetic',
                selected_policy: 'hostile-policy',
                advised_mode: 'lite-only',
            }), null);
            assert.deepStrictEqual(candidate, originalCandidate);
            assert.strictEqual(filesystemWrites, 0);
        } finally {
            fs.appendFileSync = originalAppendFileSync;
            fs.mkdirSync = originalMkdirSync;
        }
    });

    it('reads only project-local historical telemetry and never restores the sidecar loader', () => {
        const tokenPathSource = fs.readFileSync(path.join(
            ROOT,
            'src/tools/cstar-kernel-mcp/telemetry/token_path.ts',
        ), 'utf8');
        const augurySource = fs.readFileSync(path.join(
            ROOT,
            'src/tools/cstar-kernel-mcp/tools/augury.ts',
        ), 'utf8');
        const summary = summarizeRecentTokenPathIntegration();

        assert.strictEqual(summary.status, 'quarantined');
        assert.strictEqual(summary.advisor_available, false);
        assert.strictEqual(summary.external_root_consulted, false);
        assert.strictEqual(typeof summary.advice_count_24h, 'number');
        assert.strictEqual(typeof summary.observation_count_24h, 'number');
        assert.doesNotMatch(tokenPathSource, /AUGURY_TOKEN_PATH_ROOT|pathToFileURL|appendFileSync|mkdirSync|\/tmp/);
        assert.doesNotMatch(tokenPathSource, /await\s+import\s*\(/);
        assert.doesNotMatch(augurySource, /runTokenPathAdvisor|appendTokenPathAdvice/);
    });
});
