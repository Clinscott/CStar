import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import {
    readBoundedUtf8FileInside,
    resolveExistingPathInside,
    resolveProspectiveRelativePathInside,
} from '../../../src/tools/cstar-kernel-mcp/contracts/runtime.js';
import { resolveDispatchSurface } from '../../../src/tools/cstar-kernel-mcp/tools/dispatch_request.js';
import { handleEvolve } from '../../../src/tools/cstar-kernel-mcp/tools/evolve.js';
import { handleWarden } from '../../../src/tools/cstar-kernel-mcp/tools/warden.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const originalRoot = registry.getRoot();
const roots: string[] = [];

function temporaryRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    return root;
}

afterEach(() => {
    registry.setRoot(originalRoot);
    cleanupOperatorAuthorizationFixtures();
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('CStar canonical path containment', () => {
    it('accepts real children and rejects absolute, traversal, symlink, and hardlink escapes', () => {
        const root = temporaryRoot('cstar-path-root-');
        const outside = temporaryRoot('cstar-path-outside-');
        const safe = path.join(root, 'safe.txt');
        const outsideFile = path.join(outside, 'secret.txt');
        fs.writeFileSync(safe, 'safe\n');
        fs.writeFileSync(outsideFile, 'secret\n');

        assert.strictEqual(resolveExistingPathInside(root, safe, 'file'), safe);
        assert.throws(
            () => resolveProspectiveRelativePathInside(root, outsideFile),
            /path_must_be_safe_relative/,
        );
        assert.throws(
            () => resolveProspectiveRelativePathInside(root, '../escape.txt'),
            /path_must_be_safe_relative/,
        );

        const linkedFile = path.join(root, 'linked.txt');
        const linkedDirectory = path.join(root, 'linked-dir');
        fs.symlinkSync(outsideFile, linkedFile);
        fs.symlinkSync(outside, linkedDirectory, 'dir');
        assert.throws(() => resolveExistingPathInside(root, linkedFile), /path_symlink_forbidden/);
        assert.throws(
            () => resolveProspectiveRelativePathInside(root, 'linked-dir/new.txt'),
            /path_symlink_forbidden/,
        );

        const hardlink = path.join(root, 'hardlink.txt');
        fs.linkSync(outsideFile, hardlink);
        assert.throws(
            () => readBoundedUtf8FileInside(root, hardlink, 1024),
            /path_hardlink_forbidden/,
        );
    });

    it('does not authorize a symlinked dispatch contract outside CStar', () => {
        const root = temporaryRoot('cstar-dispatch-root-');
        const outside = temporaryRoot('cstar-dispatch-outside-');
        const contractDirectory = path.join(root, 'docs', 'operations');
        fs.mkdirSync(contractDirectory, { recursive: true });
        const outsideContract = path.join(outside, 'forge.md');
        fs.writeFileSync(outsideContract, '# outside\n');
        fs.symlinkSync(outsideContract, path.join(contractDirectory, 'forge.md'));

        const result = resolveDispatchSurface('forge', {
            bead_id: 'bead:path-test',
            decision_id: 'decision-path-test',
            state_update_thread_id: 'thread-project-state',
            source_callback_thread_id: 'thread-callback',
            objective: 'Inspect containment',
            target_paths: [root],
            scope: 'test',
            authority_lane: 'yellow',
            required_metrics: [{ name: 'containment', threshold: 'pass' }],
            artifact_expectations: ['proof'],
            prohibited_actions: ['write'],
            spend_policy: { mode: 'no_spend' },
            callback_contract: { expected_packet: 'PATH_TEST' },
            dispatch_surface_ref: 'docs/operations/forge.md',
        }, root);

        assert.strictEqual(result.found, false);
        assert.strictEqual(result.checked[0].inside_project, false);
        assert.match(result.checked[0].containment_error ?? '', /path_symlink_forbidden/);
    });

    it('refuses symlinked proposal reads and omits them from listings', async () => {
        const root = temporaryRoot('cstar-evolve-root-');
        const outside = temporaryRoot('cstar-evolve-outside-');
        const proposalDirectory = path.join(root, '.agents', 'proposals', 'evolve');
        fs.mkdirSync(proposalDirectory, { recursive: true });
        const outsideProposal = path.join(outside, 'secret.json');
        fs.writeFileSync(outsideProposal, JSON.stringify({ summary: 'outside secret' }));
        fs.symlinkSync(outsideProposal, path.join(proposalDirectory, 'escaped.json'));
        registry.setRoot(root);

        const getResult = await handleEvolve({ action: 'get_proposal', proposal_id: 'escaped' });
        const getPayload = JSON.parse(getResult.content[0].text);
        assert.match(getPayload.error, /path_symlink_forbidden/);

        const listResult = await handleEvolve({ action: 'list_proposals' });
        const listPayload = JSON.parse(listResult.content[0].text);
        assert.strictEqual(listPayload.count, 0);
        assert.deepStrictEqual(listPayload.proposals, []);
    });

    it('rejects a Warden target that resolves through a symlinked directory', async () => {
        const root = temporaryRoot('cstar-warden-root-');
        const outside = temporaryRoot('cstar-warden-outside-');
        fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
        fs.writeFileSync(path.join(root, 'scripts', 'run_warden.py'), '# fixture\n');
        fs.symlinkSync(outside, path.join(root, 'escaped'), 'dir');
        registry.setRoot(root);
        const session = createSession({
            textParts: ['Synthetic root-user request for a contained Warden scan.'],
        });

        const result = await handleWarden(
            { action: 'scan', warden: 'mimir', target: 'escaped' },
            validRequestContext(session.threadId, session.turnId),
        );
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(result.isError, true);
        assert.match(parsed.error, /inside the project root/);
    });
});
