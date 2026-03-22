import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { normalizeRepoRoot, loadRavensSweepTargets, resolveTargetPath, deps } from  '../../../../src/node/core/runtime/adapters/ravens_utils.js';

describe('ravens_utils', () => {
    beforeEach(() => {
        deps.listHallMountedSpokes = () => [];
        deps.registry = {
            isSpokeUri: () => false,
            resolveEstatePath: () => '/mock/path',
            getRoot: () => '/root',
        } as any;
    });

    describe('normalizeRepoRoot', () => {
        test('should normalize and replace backslashes', () => {
            const result = normalizeRepoRoot('C:\\Users\\test');
            assert.strictEqual(result.includes('\\'), false);
        });
    });

    describe('loadRavensSweepTargets', () => {
        test('should return brain target by default', () => {
            const result = loadRavensSweepTargets('/root');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0]?.slug, 'brain');
            assert.strictEqual(result[0]?.domain, 'brain');
        });

        test('should return mounted spokes', () => {
            deps.listHallMountedSpokes = () => [
                { slug: 'spoke1', mount_status: 'active', root_path: '/spoke1' },
                { slug: 'spoke2', mount_status: 'inactive', root_path: '/spoke2' },
            ] as any;
            const result = loadRavensSweepTargets('/root');
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0]?.slug, 'brain');
            assert.strictEqual(result[1]?.slug, 'spoke1');
        });

        test('should filter by requested spoke', () => {
            deps.listHallMountedSpokes = () => [
                { slug: 'spoke1', mount_status: 'active', root_path: '/spoke1' },
            ] as any;
            const result = loadRavensSweepTargets('/root', 'spoke1');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0]?.slug, 'spoke1');
        });
    });

    describe('resolveTargetPath', () => {
        test('should return project root if no target path', () => {
            const result = resolveTargetPath('/root', undefined);
            assert.strictEqual(result, '/root');
        });

        test('should resolve spoke URI if target path is a spoke URI', () => {
            deps.registry.isSpokeUri = () => true;
            deps.registry.resolveEstatePath = (uri: string) => `/resolved/${uri.replace('spoke://', '')}`;
            const result = resolveTargetPath('/root', 'spoke://test');
            assert.strictEqual(result, '/resolved/test');
        });

        test('should return absolute path if target path is absolute', () => {
             // Mocking isAbsolute is not necessary as we use the real one from path
             // But we need to make sure registry.isSpokeUri returns false
             const absPath = process.platform === 'win32' ? 'C:\\abs' : '/abs';
             const result = resolveTargetPath('/root', absPath);
             assert.strictEqual(result, absPath);
        });

        test('should resolve relative path', () => {
             const result = resolveTargetPath('/root', 'subdir');
             assert.ok(result.endsWith('root/subdir') || result.endsWith('root\\subdir'));
        });
    });
});
