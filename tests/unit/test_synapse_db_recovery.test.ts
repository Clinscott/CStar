import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
    ensureHealthySynapseDb,
    RETIRED_SYNAPSE_DB_ERROR,
} from '../../src/core/synapse_db.js';


const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');


describe('retired Synapse DB recovery', () => {
    it('rejects before directory, database, backup, or schema effects', () => {
        assert.throws(
            () => ensureHealthySynapseDb('/synthetic/.stats/synapse.db'),
            { message: RETIRED_SYNAPSE_DB_ERROR },
        );
    });

    it('contains no filesystem or SQLite implementation', () => {
        const source = fs.readFileSync(path.join(PROJECT_ROOT, 'src/core/synapse_db.ts'), 'utf8');
        for (const forbidden of [
            "from 'node:fs'",
            'better-sqlite3',
            '.mkdirSync(',
            '.renameSync(',
            '.exec(',
            '.prepare(',
        ]) {
            assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
    });
});
