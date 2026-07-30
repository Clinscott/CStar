import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { PathRegistry } from '../../src/tools/pennyone/pathRegistry.js';

const ENV_KEYS = [
    'CSTAR_CONTROL_ROOT',
    'CSTAR_KERNEL_MCP',
    'CSTAR_LAUNCH_CWD',
    'CSTAR_PROJECT_ROOT',
    'CSTAR_WORKSPACE_ROOT',
] as const;

const originalEnv = new Map<string, string | undefined>();
let temporaryRoots: string[] = [];

function resetSingleton(): void {
    delete (globalThis as typeof globalThis & {
        __PATH_REGISTRY_INSTANCE__?: PathRegistry;
    }).__PATH_REGISTRY_INSTANCE__;
}

function makeTemporaryRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    temporaryRoots.push(root);
    return root;
}

function portablePath(value: string): string {
    return value.replaceAll('\\', '/');
}

describe('PathRegistry project-root isolation', () => {
    beforeEach(() => {
        temporaryRoots = [];
        for (const key of ENV_KEYS) {
            originalEnv.set(key, process.env[key]);
            delete process.env[key];
        }
        resetSingleton();
    });

    afterEach(() => {
        resetSingleton();
        for (const [key, value] of originalEnv) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        originalEnv.clear();
        for (const root of temporaryRoots) {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('ascends only the explicit synthetic project root and caches it', () => {
        const root = makeTemporaryRoot('cstar-path-registry-');
        const deepDirectory = path.join(root, 'src', 'synthetic', 'deep');
        fs.mkdirSync(deepDirectory, { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), '{"name":"synthetic"}\n');
        process.env.CSTAR_PROJECT_ROOT = deepDirectory;

        const registry = PathRegistry.getInstance();
        assert.equal(registry.getRoot(), portablePath(root));
        assert.equal(PathRegistry.getInstance(), registry);
        assert.equal(PathRegistry.getInstance().getRoot(), portablePath(root));
    });

    it('recognizes a synthetic Corvus estate root without warning', () => {
        const estateRoot = makeTemporaryRoot('corvus-estate-root-');
        fs.mkdirSync(path.join(estateRoot, 'CStar'), { recursive: true });
        fs.writeFileSync(
            path.join(estateRoot, 'CStar', 'package.json'),
            '{"name":"synthetic-cstar"}\n',
        );
        const warnings: unknown[][] = [];
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => warnings.push(args);
        try {
            const registry = PathRegistry.getInstance();
            assert.equal(registry.detectWorkspaceRoot(estateRoot), portablePath(estateRoot));
            assert.deepEqual(warnings, []);
        } finally {
            console.warn = originalWarn;
        }
    });
});
