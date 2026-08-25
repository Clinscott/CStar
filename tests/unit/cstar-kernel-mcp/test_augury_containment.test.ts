import { describe, it } from 'node:test';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import {
    assert,
    fs,
    handleAugury,
    makeSpoke,
    os,
    path,
    spokeStore,
} from './shared_test_setup.js';

describe('CStar MCP Augury scope and target containment', () => {
    it('rejects traversal, absolute-outside, and symlink-outside targets', async () => {
        const originalRoot = registry.getRoot();
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-augury-root-'));
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-augury-outside-'));
        fs.symlinkSync(outside, path.join(root, 'linked-outside'));
        registry.setRoot(root);
        try {
            for (const target of ['../outside.ts', path.join(outside, 'absolute.ts'), 'linked-outside/escaped.ts']) {
                const result = await handleAugury({ prompt: 'Audit this target.', target_paths: [target] });
                assert.strictEqual(result.isError, true, target);
                const parsed = JSON.parse(result.content[0].text);
                assert.match(parsed.error, /outside_authorized_estate|path_symlink_(?:escape|forbidden)|path_must_be_safe_relative/);
            }
        } finally {
            registry.setRoot(originalRoot);
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });

    it('rejects unavailable spoke scopes and keeps trusted spoke advice non-actionable', async () => {
        const originalRoot = registry.getRoot();
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-augury-hub-'));
        const spokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-augury-spoke-'));
        fs.mkdirSync(path.join(spokeRoot, 'src'), { recursive: true });
        registry.setRoot(root);
        try {
            for (const spoke of [
                makeSpoke({ slug: 'disconnected', mount_status: 'disconnected', root_path: spokeRoot }),
                makeSpoke({ slug: 'quarantined', trust_level: 'quarantined', root_path: spokeRoot }),
            ]) spokeStore.set(spoke.slug, spoke);

            for (const scope of ['spoke:unknown', 'spoke:disconnected', 'spoke:quarantined']) {
                const result = await handleAugury({ prompt: 'Audit this spoke.', scope });
                assert.strictEqual(result.isError, true, scope);
                assert.match(JSON.parse(result.content[0].text).error, /augury_scope_not_authorized/);
            }

            spokeStore.set('trusted', makeSpoke({ slug: 'trusted', root_path: spokeRoot }));
            const result = await handleAugury({
                prompt: 'Audit the new spoke target.',
                scope: 'spoke:trusted',
                target_paths: ['src/new.ts'],
            });
            const parsed = JSON.parse(result.content[0].text);
            assert.equal(result.isError, undefined, result.content[0].text);
            assert.equal(parsed.status, 'routed_advisory');
            assert.equal(parsed.actionable, false);
            assert.equal(parsed.scope, 'spoke:trusted');
            assert.deepEqual(parsed.mimir_targets, [path.join(spokeRoot, 'src', 'new.ts')]);
        } finally {
            registry.setRoot(originalRoot);
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(spokeRoot, { recursive: true, force: true });
        }
    });
});
