import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { attachSourceWatcher } from '../../../src/tools/cstar-kernel-mcp/watch.js';

const cleanupRoots: string[] = [];

function makeSourceRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-a5-watch-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'initial.ts'), 'export const initial = true;');
    cleanupRoots.push(root);
    return root;
}

function waitFor<T>(promise: Promise<T>, timeoutMs = 2_000): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => {
            const timer = setTimeout(() => reject(new Error('watcher_test_timeout')), timeoutMs);
            timer.unref?.();
        }),
    ]);
}

afterEach(() => {
    while (cleanupRoots.length > 0) {
        fs.rmSync(cleanupRoots.pop() as string, { recursive: true, force: true });
    }
});

describe('bounded kernel source watcher', () => {
    it('reports one event and closes without polling or reloading', async () => {
        const root = makeSourceRoot();
        const reasons: string[] = [];
        let resolveReason: (reason: string) => void = () => undefined;
        const reasonPromise = new Promise<string>((resolve) => { resolveReason = resolve; });
        const close = await attachSourceWatcher(
            root,
            (reason) => {
                reasons.push(reason);
                resolveReason(reason);
            },
            { CSTAR_KERNEL_ENABLE_WATCH: '1' },
            { max_events: 1, max_duration_ms: 1_000, debounce_ms: 10 },
        );

        await new Promise((resolve) => setTimeout(resolve, 100));
        fs.writeFileSync(path.join(root, 'src', 'initial.ts'), 'export const initial = false;');
        const reason = await waitFor(reasonPromise);
        await close();

        assert.match(reason, /^source change in src\/initial\.ts$/);
        assert.equal(reasons.length, 1);
    });

    it('cancels cleanly before an event and never calls the host callback', async () => {
        const root = makeSourceRoot();
        let callbacks = 0;
        const close = await attachSourceWatcher(
            root,
            () => { callbacks += 1; },
            { CSTAR_KERNEL_ENABLE_WATCH: '1' },
            { max_events: 1, max_duration_ms: 1_000, debounce_ms: 10 },
        );
        await close();
        fs.writeFileSync(path.join(root, 'src', 'initial.ts'), 'export const initial = false;');
        await new Promise((resolve) => setTimeout(resolve, 150));

        assert.equal(callbacks, 0);
        await close();
    });

    it('is disabled unless the explicit development environment switch is set', async () => {
        const root = makeSourceRoot();
        let callbacks = 0;
        const close = await attachSourceWatcher(root, () => { callbacks += 1; }, {});
        fs.writeFileSync(path.join(root, 'src', 'initial.ts'), 'export const initial = false;');
        await new Promise((resolve) => setTimeout(resolve, 100));
        await close();
        assert.equal(callbacks, 0);
    });
});
