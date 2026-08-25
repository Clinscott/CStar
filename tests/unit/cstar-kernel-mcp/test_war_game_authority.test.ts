import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { closeDb } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import {
    handleEngramRecord,
    handleWarGameScore,
} from '../../../src/tools/cstar-kernel-mcp/tools/war_game.js';

function parse(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0]!.text) as Record<string, any>;
}

describe('war-game Hall authority boundary', () => {
    let root = '';
    let previousRoot = '';

    beforeEach(() => {
        previousRoot = registry.getRoot();
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-war-game-authority-'));
        registry.setRoot(root);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(previousRoot);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('serves every read action from an absent store without bootstrapping Hall', async () => {
        const results = await Promise.all([
            handleWarGameScore({ action: 'list_contests' }),
            handleWarGameScore({ action: 'recent' }),
            handleWarGameScore({ action: 'by_scenario', contest_id: 'contest:test' }),
            handleWarGameScore({ action: 'get_score', shot_id: 'shot:test' }),
            handleWarGameScore({ action: 'tally' }),
        ]);

        assert.deepEqual(parse(results[0]!).contests, []);
        assert.deepEqual(parse(results[1]!).scores, []);
        assert.deepEqual(parse(results[2]!).buckets, []);
        assert.equal(parse(results[3]!).score, null);
        assert.deepEqual(parse(results[4]!).tallies, []);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });

    it('rejects contest and engram mutations before creating Hall', async () => {
        const register = parse(await handleWarGameScore({
            action: 'register_contest',
            contest_id: 'contest:test',
            contest_name: 'Synthetic contest',
            attacker_label: 'attacker',
            defender_label: 'defender',
            attacker_intent_prefix: 'attack/',
            defender_intent_prefix: 'defend/',
            terminal_event_class_map: { block: [], complete: [], inconclusive: [] },
            scenario_compatibility_map: {},
        }));
        const engram = parse(await handleEngramRecord({
            intent: 'synthetic mutation probe',
            bead_id: 'bead:test:war-game-authority',
        }));

        for (const result of [register, engram]) {
            assert.match(result.error, /^codex_request_identity_/);
        }
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
    });
});
