import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeDistributions } from '../../src/packaging/distributions.js';
import { writeReleaseArchives } from '../../src/packaging/release_archives.js';

function createProjectRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-release-archives-'));
    fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
            name: 'corvusstar',
            version: '2.4.6',
            description: 'Kernel-first runtime.',
            homepage: 'https://example.com/cstar',
            repository: { url: 'https://example.com/cstar.git' },
            license: 'MIT',
            author: { name: 'Corvus Star' },
        }, null, 2),
        'utf-8',
    );
    fs.writeFileSync(
        path.join(root, '.agents', 'config.json'),
        JSON.stringify({ system: { persona: 'O.D.I.N.' } }, null, 2),
        'utf-8',
    );
    fs.writeFileSync(
        path.join(root, '.agents', 'skill_registry.json'),
        JSON.stringify({
            entries: {
                hall: {
                    tier: 'PRIME',
                    description: 'Hall lookup',
                    runtime_trigger: 'hall',
                    host_support: {
                        gemini: 'native-session',
                        codex: 'exec-bridge',
                    },
                },
            },
        }, null, 2),
        'utf-8',
    );
    writeDistributions(root);
    return root;
}

describe('release archive generation', () => {
    it('creates versioned tarballs and manifest from host distributions', () => {
        const projectRoot = createProjectRoot();
        const result = writeReleaseArchives(projectRoot);
        assert.equal(
            fs.existsSync(path.join(projectRoot, 'dist', 'releases', 'corvus-star-gemini-extension-v2.4.6.tar.gz')),
            true,
        );
        assert.equal(
            fs.existsSync(path.join(projectRoot, 'dist', 'releases', 'corvus-star-codex-plugin-v2.4.6.tar.gz')),
            true,
        );

        const manifest = JSON.parse(
            fs.readFileSync(path.join(projectRoot, 'dist', 'releases', 'manifest.json'), 'utf-8'),
        ) as {
            version?: string;
            archives?: Array<{ archive?: string }>;
        };

        assert.equal(result.version, '2.4.6');
        assert.equal(manifest.version, '2.4.6');
        assert.deepEqual(
            manifest.archives?.map((entry) => entry.archive),
            [
                'dist/releases/corvus-star-gemini-extension-v2.4.6.tar.gz',
                'dist/releases/corvus-star-codex-plugin-v2.4.6.tar.gz',
            ],
        );
    });
});
