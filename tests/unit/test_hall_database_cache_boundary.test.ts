import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { HallDatabase } from '../../src/tools/pennyone/intel/database.js';

describe('Hall database handle-cache boundary', () => {
    it('fails closed before opening an unbounded set of distinct root handles', () => {
        const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-hall-cache-'));
        const hall = new HallDatabase();
        try {
            for (let index = 0; index < HallDatabase.MAX_CACHED_ROOTS_PER_MODE; index += 1) {
                const root = path.join(parent, `root-${index}`);
                fs.mkdirSync(root);
                hall.getWritableDb(root);
            }
            const overflow = path.join(parent, 'overflow');
            fs.mkdirSync(overflow);
            assert.throws(
                () => hall.getWritableDb(overflow),
                /hall_database_root_cache_limit_exceeded/,
            );
            assert.equal(fs.existsSync(path.join(overflow, '.stats')), false);
            assert.equal(fs.existsSync(path.join(overflow, '.stats', 'pennyone.db')), false);

            hall.close();
            assert.doesNotThrow(() => hall.getWritableDb(overflow));
        } finally {
            hall.close();
            fs.rmSync(parent, { recursive: true, force: true });
        }
    });
});
