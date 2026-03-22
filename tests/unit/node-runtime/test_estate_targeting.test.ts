import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEstateTarget } from '../../../src/node/core/runtime/estate_targeting.ts';
import { registry } from '../../../src/tools/pennyone/pathRegistry.ts';
import { database } from '../../../src/tools/pennyone/intel/database.ts';

describe('Estate Targeting Unit Tests', () => {
    it('should resolve the root workspace when target is undefined', () => {
        mock.method(registry, 'getRoot', () => '/project/root');
        mock.method(registry, 'normalize', (path: string) => path);

        const result = resolveEstateTarget();
        assert.strictEqual(result.workspaceRoot, '/project/root');
        assert.strictEqual(result.targetDomain, 'brain');
        mock.reset();
    });

    it('should resolve specialized domain with provided workspace root', () => {
        mock.method(registry, 'normalize', (path: string) => path);

        const result = resolveEstateTarget({
            workspace_root: '/another/root',
            domain: 'external'
        });

        assert.strictEqual(result.workspaceRoot, '/another/root');
        assert.strictEqual(result.targetDomain, 'external');
        mock.reset();
    });

    it('should resolve spoke by name from hall database', () => {
        mock.method(registry, 'getRoot', () => '/project/root');
        mock.method(database, 'getHallMountedSpoke', (spoke: string, root: string) => {
            if (spoke === 'my-spoke' && root === '/project/root') {
                return { slug: 'my-spoke', root_path: '/project/root/spokes/my-spoke' };
            }
            return null;
        });

        const result = resolveEstateTarget({
            spoke: 'my-spoke',
            domain: 'spoke'
        });

        assert.strictEqual(result.workspaceRoot, '/project/root/spokes/my-spoke');
        assert.strictEqual(result.spokeName, 'my-spoke');
        assert.strictEqual(result.spokeRoot, '/project/root/spokes/my-spoke');
        mock.reset();
    });

    it('should throw error when spoke is not found in database', () => {
        mock.method(registry, 'getRoot', () => '/project/root');
        mock.method(database, 'getHallMountedSpoke', () => null);

        assert.throws(() => {
            resolveEstateTarget({
                spoke: 'unknown-spoke',
                domain: 'spoke'
            });
        }, /Mounted spoke 'unknown-spoke' is not registered/);
        mock.reset();
    });

    it('should resolve spoke from spoke URI in requested path', () => {
        mock.method(registry, 'getRoot', () => '/project/root');
        mock.method(registry, 'isSpokeUri', (path: string) => path.startsWith('spoke://'));
        mock.method(registry, 'parseSpokeUri', (uri: string) => ({ slug: uri.replace('spoke://', '').split('/')[0] }));
        mock.method(registry, 'resolveEstatePath', () => {});
        mock.method(database, 'listHallMountedSpokes', () => [
            { slug: 'test-spoke', root_path: '/project/root/spokes/test-spoke' }
        ]);

        const result = resolveEstateTarget({
            requested_path: 'spoke://test-spoke/src/main.ts',
            domain: 'spoke'
        });

        assert.strictEqual(result.workspaceRoot, '/project/root/spokes/test-spoke');
        assert.strictEqual(result.spokeName, 'test-spoke');
        assert.strictEqual(result.spokeRoot, '/project/root/spokes/test-spoke');
        mock.reset();
    });
});
