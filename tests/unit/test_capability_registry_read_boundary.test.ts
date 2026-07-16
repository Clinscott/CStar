import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    readBoundedJsonObject,
    readBoundedUtf8RelativeFile,
} from '../../src/core/safe_local_file.ts';
import { loadRegistryEntries } from '../../src/node/core/runtime/entry_surface.ts';
import { loadRegistryManifest } from '../../src/node/core/runtime/host_workflows/chant_parser.ts';

describe('Capability registry read boundary', () => {
    let root: string;
    let outside: string;
    let previousControlRoot: string | undefined;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-safe-registry-'));
        outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-safe-registry-outside-'));
        previousControlRoot = process.env.CSTAR_CONTROL_ROOT;
    });

    afterEach(() => {
        if (previousControlRoot === undefined) delete process.env.CSTAR_CONTROL_ROOT;
        else process.env.CSTAR_CONTROL_ROOT = previousControlRoot;
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
    });

    function writeRegistry(content = '{"entries":{"safe":{"entry_surface":"compatibility"}}}'): string {
        const agents = path.join(root, '.agents');
        fs.mkdirSync(agents, { recursive: true });
        const manifest = path.join(agents, 'skill_registry.json');
        fs.writeFileSync(manifest, content, { mode: 0o600 });
        return manifest;
    }

    it('reads one bounded, unique regular manifest inside the supplied root', () => {
        writeRegistry();
        const entries = loadRegistryEntries(root);
        assert.deepEqual(Object.keys(entries), ['safe']);
    });

    it('does not use an ambient control-root fallback', () => {
        const outsideAgents = path.join(outside, '.agents');
        fs.mkdirSync(outsideAgents);
        fs.writeFileSync(
            path.join(outsideAgents, 'skill_registry.json'),
            '{"entries":{"ambient":{}}}',
        );
        process.env.CSTAR_CONTROL_ROOT = outside;
        assert.deepEqual(loadRegistryEntries(root), {});
    });

    it('treats an absent optional project root as no registry without masking unsafe files', () => {
        const missingRoot = path.join(root, 'does-not-exist');
        assert.equal(loadRegistryManifest(missingRoot), null);

        fs.mkdirSync(path.join(root, '.agents'));
        fs.writeFileSync(path.join(outside, 'registry.json'), '{"entries":{}}');
        fs.symlinkSync(path.join(outside, 'registry.json'), path.join(root, '.agents', 'skill_registry.json'));
        assert.throws(() => loadRegistryManifest(root), /bounded_file_symlink_forbidden/);
    });

    it('rejects traversal, symlink, hardlink, oversize, and malformed JSON inputs', () => {
        fs.writeFileSync(path.join(outside, 'registry.json'), '{"entries":{}}');
        assert.throws(
            () => readBoundedUtf8RelativeFile(root, '../outside.json', 1024),
            /bounded_file_path_outside_root/,
        );

        const agents = path.join(root, '.agents');
        fs.symlinkSync(outside, agents);
        assert.throws(() => loadRegistryEntries(root), /bounded_file_symlink_forbidden/);
        fs.unlinkSync(agents);

        fs.mkdirSync(agents);
        const outsideManifest = path.join(outside, 'registry.json');
        const manifest = path.join(agents, 'skill_registry.json');
        fs.linkSync(outsideManifest, manifest);
        assert.throws(() => loadRegistryEntries(root), /bounded_file_hardlink_forbidden/);
        fs.unlinkSync(manifest);

        fs.writeFileSync(manifest, 'x'.repeat(128));
        assert.throws(
            () => readBoundedJsonObject(root, '.agents/skill_registry.json', 64),
            /bounded_file_size_limit_exceeded/,
        );
        fs.writeFileSync(manifest, '{not-json');
        assert.throws(() => loadRegistryEntries(root), /bounded_json_invalid/);
    });
});
