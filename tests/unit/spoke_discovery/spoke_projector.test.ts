import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    projectSpoke,
    SPOKE_PROFILE_DIR,
    SPOKE_PROJECTION_RETIRED,
    SPOKE_PROJECTION_VERSION,
} from '../../../src/node/core/spokes/spoke_projector.ts';

test('projectSpoke fails before creating projection artifacts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spoke-project-retired-'));
    try {
        assert.throws(
            () => projectSpoke({ slug: 'synthetic', rootPath: root }),
            new RegExp(SPOKE_PROJECTION_RETIRED),
        );
        assert.strictEqual(fs.existsSync(path.join(root, SPOKE_PROFILE_DIR)), false);
        assert.strictEqual(SPOKE_PROJECTION_VERSION, 'retired');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('projectSpoke returns the same authority error for missing and private roots', () => {
    const candidates = [
        path.join(os.tmpdir(), 'missing-spoke-root'),
        path.join(os.homedir(), '.hermes', 'profiles'),
    ];
    for (const rootPath of candidates) {
        assert.throws(
            () => projectSpoke({ slug: 'synthetic', rootPath }),
            new RegExp(SPOKE_PROJECTION_RETIRED),
        );
    }
});
