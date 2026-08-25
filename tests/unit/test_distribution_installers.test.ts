import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { installCodexPlugin } from '../../src/packaging/installers.js';

describe('archived Codex plugin source staging', () => {
    it('fails closed before reading source or mutating the host', () => {
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-plugin-home-'));
        const before = fs.readdirSync(homeDir);

        assert.throws(
            () => installCodexPlugin({
                projectRoot: path.join(homeDir, 'missing-project'),
                homeDir,
            }),
            /legacy_cstar_codex_plugin_install_retired_use_organism_host_integration/,
        );

        assert.deepEqual(fs.readdirSync(homeDir), before);
        fs.rmSync(homeDir, { recursive: true, force: true });
    });
});
