import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { PathRegistry } from '../../src/tools/pennyone/pathRegistry.js';

describe('PathRegistry Sovereignty', () => {
    let originalCwd: () => string;
    let warnMock: typeof console.warn;

    beforeEach(() => {
        originalCwd = process.cwd;
        warnMock = console.warn;
    });

    afterEach(() => {
        process.cwd = originalCwd;
        console.warn = warnMock;
        // Reset singleton for test isolation
        (PathRegistry as any).instance = undefined;
    });

    test('ascends directory tree to find project root', () => {
        // Simulate running from a deep subdirectory inside the project
        const deepDir = path.join(originalCwd(), 'src', 'tools', 'pennyone', 'intel');
        process.cwd = () => deepDir;

        const registry = PathRegistry.getInstance();
        // Since getRoot() does not exist yet, we expect TS or runtime error here if we use it,
        // or we check the private `root` property during TDD.
        // We will assert on getRoot() which will be implemented.
        const root = (registry as any).getRoot();

        const expectedRoot = originalCwd().replace(/\\/g, '/');
        assert.strictEqual(root?.replace(/\\/g, '/'), expectedRoot);
    });

    test('caches the root on subsequent calls', () => {
        const registry = PathRegistry.getInstance();
        const firstCall = (registry as any).getRoot();
        const secondCall = (registry as any).getRoot();

        assert.strictEqual(firstCall, secondCall);
    });

    test('treats the Corvus estate root as a valid project root without fallback warning', () => {
        const estateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-estate-root-'));
        fs.mkdirSync(path.join(estateRoot, 'CStar', '.agents'), { recursive: true });
        fs.writeFileSync(path.join(estateRoot, 'CStar', '.agents', 'config.json'), '{"system":{"persona":"O.D.I.N."}}', 'utf-8');
        let warned = false;
        console.warn = () => {
            warned = true;
        };

        const registry = PathRegistry.getInstance();
        registry.setRoot(estateRoot);
        const detected = registry.detectWorkspaceRoot(estateRoot);

        assert.strictEqual(detected, estateRoot.replace(/\\/g, '/'));
        assert.strictEqual(warned, false);
    });
});
