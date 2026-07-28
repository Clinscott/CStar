import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDb, getDb } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

describe('Hall test storage isolation', () => {
    let isolationRoot: string;
    let explicitRoot: string;
    let previousRegistryRoot: string;
    let previousTestHallRoot: string | undefined;
    let previousTestHallSubjectRoot: string | undefined;

    beforeEach(() => {
        isolationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-hall-test-root-'));
        explicitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-explicit-hall-root-'));
        previousRegistryRoot = registry.getRoot();
        previousTestHallRoot = process.env.CSTAR_TEST_HALL_ROOT;
        previousTestHallSubjectRoot = process.env.CSTAR_TEST_HALL_SUBJECT_ROOT;
        process.env.CSTAR_TEST_HALL_ROOT = isolationRoot;
        process.env.CSTAR_TEST_HALL_SUBJECT_ROOT = PROJECT_ROOT;
        registry.setRoot(PROJECT_ROOT);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(previousRegistryRoot);
        if (previousTestHallRoot === undefined) delete process.env.CSTAR_TEST_HALL_ROOT;
        else process.env.CSTAR_TEST_HALL_ROOT = previousTestHallRoot;
        if (previousTestHallSubjectRoot === undefined) delete process.env.CSTAR_TEST_HALL_SUBJECT_ROOT;
        else process.env.CSTAR_TEST_HALL_SUBJECT_ROOT = previousTestHallSubjectRoot;
        fs.rmSync(isolationRoot, { recursive: true, force: true });
        fs.rmSync(explicitRoot, { recursive: true, force: true });
    });

    it('redirects repository-root Hall storage to a per-process test database', () => {
        const db = getDb();
        const expected = path.join(isolationRoot, `process-${process.pid}`, '.stats', 'pennyone.db');

        assert.equal(path.resolve(db.name), path.resolve(expected));
        assert.ok(fs.existsSync(expected));
    });

    it('does not redirect an explicit non-repository Hall root', () => {
        const db = getDb(explicitRoot);
        const expected = path.join(explicitRoot, '.stats', 'pennyone.db');

        assert.equal(path.resolve(db.name), path.resolve(expected));
        assert.ok(fs.existsSync(expected));
    });
});
