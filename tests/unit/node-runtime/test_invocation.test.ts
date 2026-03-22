import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
    resolveWorkspaceRoot,
    buildCliSession,
    buildBrainTarget,
    buildSpokeTarget,
    withCliWorkspaceTarget,
} from '../../../src/node/core/runtime/invocation.ts';

describe('invocation', () => {
    test('resolveWorkspaceRoot should return string as is', () => {
        const root = '/path/to/root';
        assert.strictEqual(resolveWorkspaceRoot(root), root);
    });

    test('resolveWorkspaceRoot should call function and return result', () => {
        const root = '/path/to/root';
        assert.strictEqual(resolveWorkspaceRoot(() => root), root);
    });

    test('buildCliSession should return a CLI session object', () => {
        const session = buildCliSession();
        assert.deepStrictEqual(session, {
            mode: 'cli',
            interactive: true,
        });
    });

    test('buildBrainTarget should return a brain target object', () => {
        const root = '/path/to/root';
        const target = buildBrainTarget(root);
        assert.deepStrictEqual(target, {
            domain: 'brain',
            workspace_root: root,
            requested_path: root,
        });
    });

    test('buildBrainTarget should return a brain target object with custom requested path', () => {
        const root = '/path/to/root';
        const requested = '/path/to/requested';
        const target = buildBrainTarget(root, requested);
        assert.deepStrictEqual(target, {
            domain: 'brain',
            workspace_root: root,
            requested_path: requested,
        });
    });

    test('buildSpokeTarget should return a spoke target object', () => {
        const root = '/path/to/root';
        const spoke = 'my-spoke';
        const target = buildSpokeTarget(root, spoke);
        assert.deepStrictEqual(target, {
            domain: 'spoke',
            workspace_root: root,
            requested_path: `spoke://${spoke}/`,
            spoke,
        });
    });

    test('withCliWorkspaceTarget should enrich invocation with CLI session and brain target', () => {
        const root = '/path/to/root';
        const invocation = {
            weave_id: 'test-weave',
            payload: { foo: 'bar' },
        };
        const enriched = withCliWorkspaceTarget(invocation, root);
        assert.strictEqual(enriched.weave_id, invocation.weave_id);
        assert.deepStrictEqual(enriched.payload, invocation.payload);
        assert.deepStrictEqual(enriched.session, {
            mode: 'cli',
            interactive: true,
        });
        assert.deepStrictEqual(enriched.target, {
            domain: 'brain',
            workspace_root: root,
            requested_path: root,
        });
    });
});
