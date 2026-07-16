import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { walkSpokeSkillsForRecords } from '../../src/node/core/spokes/spoke_capability_walker.js';
import { bindSyntheticSpokeRoot, makeSpoke } from './cstar-kernel-mcp/shared_test_setup.js';
import { handleEvolve } from '../../src/tools/cstar-kernel-mcp/tools/evolve.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

const roots: string[] = [];

function makeRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    return root;
}

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('bounded local directory enumeration', () => {
    it('lists contained proposals and mounted skills without whole-directory reads', async () => {
        const previousRoot = registry.getRoot();
        const root = makeRoot('cstar-bounded-directory-');
        try {
            registry.setRoot(root);
            const proposals = path.join(root, '.agents', 'proposals', 'evolve');
            fs.mkdirSync(proposals, { recursive: true });
            fs.writeFileSync(path.join(proposals, 'proposal.json'), JSON.stringify({ summary: 'bounded' }));
            const response = await handleEvolve({ action: 'list_proposals' });
            assert.equal(response.isError, undefined);
            const payload = JSON.parse(response.content[0]!.text);
            assert.equal(payload.count, 1);

            const spokeRoot = makeRoot('cstar-bounded-spoke-');
            bindSyntheticSpokeRoot(spokeRoot);
            const skillRoot = path.join(spokeRoot, '.agents', 'skills', 'bounded');
            fs.mkdirSync(skillRoot, { recursive: true });
            fs.writeFileSync(
                path.join(skillRoot, 'SKILL.md'),
                '---\nname: bounded\ndescription: bounded fixture\ntier: SKILL\n---\nFixture.\n',
            );
            const rows = walkSpokeSkillsForRecords([makeSpoke({ root_path: spokeRoot })]);
            assert.deepEqual(rows.map((row) => row.bare_id), ['bounded']);
        } finally {
            registry.setRoot(previousRoot);
        }

        for (const relative of [
            '../../src/tools/cstar-kernel-mcp/tools/evolve.ts',
            '../../src/node/core/spokes/spoke_capability_walker.ts',
        ]) {
            const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
            assert.doesNotMatch(source, /readdirSync/);
            assert.match(source, /opendirSync/);
        }
    });

    it('fails closed instead of returning a partial skill inventory at the entry cap', () => {
        const spokeRoot = makeRoot('cstar-bounded-spoke-overflow-');
        bindSyntheticSpokeRoot(spokeRoot);
        const skillsRoot = path.join(spokeRoot, '.agents', 'skills');
        fs.mkdirSync(skillsRoot, { recursive: true });
        for (let index = 0; index <= 2_048; index += 1) {
            fs.mkdirSync(path.join(skillsRoot, `skill-${index.toString().padStart(4, '0')}`));
        }
        assert.throws(
            () => walkSpokeSkillsForRecords([makeSpoke({ root_path: spokeRoot })]),
            /spoke_skill_directory_entry_limit_exceeded/,
        );
    });
});
