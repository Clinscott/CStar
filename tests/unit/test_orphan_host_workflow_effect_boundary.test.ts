import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    ECONOMY_EFFECT_SURFACE_RETIRED_ERROR,
    ImperialLedger,
} from '../../src/node/core/economy.js';
import {
    HOST_GOVERNOR_CANDIDATES_RETIRED_ERROR,
    collectGovernableCandidates,
    fitsLocalWorkerFileBudget,
} from '../../src/node/core/runtime/weaves/host_governor_candidates.js';
import {
    PENNYONE_INTENT_REFRESH_RETIRED_ERROR,
    refreshOfflineIntents,
} from '../../src/tools/pennyone/intent_refresh.js';

describe('orphan host workflow effect boundaries', () => {
    it('retires HostGovernor candidate discovery before Hall, process, or target reads', () => {
        assert.throws(
            () => fitsLocalWorkerFileBudget('/synthetic', [], {}),
            new RegExp(HOST_GOVERNOR_CANDIDATES_RETIRED_ERROR),
        );
        assert.throws(
            () => collectGovernableCandidates('/synthetic', 1, {}),
            new RegExp(HOST_GOVERNOR_CANDIDATES_RETIRED_ERROR),
        );
    });

    it('retires intent refresh before source, provider, report, or Hall effects', async () => {
        await assert.rejects(
            refreshOfflineIntents('/synthetic/secret-bearing-target'),
            new RegExp(PENNYONE_INTENT_REFRESH_RETIRED_ERROR),
        );
    });

    it('retires the economy ledger before memory, console, or KeepOS writes', async () => {
        await assert.rejects(
            ImperialLedger.recordTransaction({ amount: 1, category: 'ESSENTIAL', description: 'synthetic' }),
            new RegExp(ECONOMY_EFFECT_SURFACE_RETIRED_ERROR),
        );
        await assert.rejects(
            ImperialLedger.updatePantry({ name: 'synthetic', quantity: 1, unit: 'item' }),
            new RegExp(ECONOMY_EFFECT_SURFACE_RETIRED_ERROR),
        );
        assert.throws(() => ImperialLedger.getFamineClock(), new RegExp(ECONOMY_EFFECT_SURFACE_RETIRED_ERROR));
    });

    it('leaves no dormant effect primitives in the retired sources', () => {
        const sources = [
            'src/node/core/economy.ts',
            'src/node/core/runtime/weaves/host_governor_candidates.ts',
            'src/tools/pennyone/intent_refresh.ts',
        ].map((file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')).join('\n');
        assert.doesNotMatch(
            sources,
            /from ['"]node:(?:fs|child_process)|spawnSync\s*\(|execa\s*\(|readFile\s*\(|writeFile\s*\(|mkdir\s*\(|getWritableDb\s*\(|saveHall\w*\s*\(|upsertHall\w*\s*\(|requestHostText\s*\(|SynapticNexus\./,
        );
    });
});
