import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.js';
import type { WeaveResult } from '../../src/node/core/runtime/contracts.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

describe('chant host-native dispatch guardrail', () => {
    it('keeps chant out of the public shell registry surface', () => {
        const manifestPath = path.resolve(process.cwd(), '.agents', 'skill_registry.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
            entries?: Record<string, {
                execution?: Record<string, unknown>;
                entrypoint_path?: unknown;
                owner_runtime?: unknown;
                runtime_trigger?: unknown;
            }>;
        };
        const chant = manifest.entries?.chant;

        assert.ok(chant, 'chant must remain registered as a host-native capability');
        assert.equal(chant.runtime_trigger, 'chant');
        assert.equal(chant.owner_runtime, 'host-agent');
        assert.equal(chant.entrypoint_path, null);
        assert.equal(chant.execution?.mode, 'agent-native');
        assert.equal(chant.execution?.ownership_model, 'host-workflow');
        assert.equal(chant.execution?.allow_kernel_fallback, false);
        assert.equal(chant.execution?.cli, undefined);
        assert.equal(chant.execution?.adapter_id, undefined);
    });

    it('fails closed when chant forbids kernel fallback and no host session is active', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-chant-host-required-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    chant: {
                        execution: {
                            mode: 'agent-native',
                            adapter_id: 'weave:chant',
                            allow_kernel_fallback: false,
                        },
                        host_support: {
                            codex: 'exec-bridge',
                        },
                        runtime_trigger: 'chant',
                    },
                },
            }),
        );
        registry.setRoot(tmpRoot);

        delete process.env.CODEX_SHELL;
        delete process.env.CODEX_THREAD_ID;
        delete process.env.CORVUS_HOST_PROVIDER;
        process.env.CORVUS_HOST_SESSION_ACTIVE = '0';

        const chantAdapter = {
            id: 'weave:chant',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:chant',
                status: 'SUCCESS',
                output: 'legacy node chant should not execute',
            })),
        };
        const dispatcher = RuntimeDispatcher.createIsolated({
            activePersona: { name: 'ODIN' },
        });
        dispatcher.registerAdapter(chantAdapter);

        const result = await dispatcher.dispatch({
            id: 'activation:chant:1',
            skill_id: 'chant',
            target_path: tmpRoot,
            intent: 'plan the next Taliesin migration step',
            params: {
                query: 'plan the next Taliesin migration step',
                project_root: tmpRoot,
                cwd: tmpRoot,
            },
            status: 'PENDING',
            priority: 1,
        });

        assert.strictEqual(result.status, 'FAILURE');
        assert.match(result.error ?? '', /requires an active host session/i);
        assert.strictEqual(result.metadata?.kernel_fallback_policy, 'forbidden');
        assert.strictEqual(chantAdapter.execute.mock.callCount(), 0);
        delete process.env.CORVUS_HOST_SESSION_ACTIVE;
    });

    it('fails closed when chant host activation errors and kernel fallback is forbidden', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-chant-host-error-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    chant: {
                        execution: {
                            mode: 'agent-native',
                            adapter_id: 'weave:chant',
                            allow_kernel_fallback: false,
                        },
                        host_support: {
                            codex: 'exec-bridge',
                        },
                        runtime_trigger: 'chant',
                    },
                },
            }),
        );
        registry.setRoot(tmpRoot);

        process.env.CODEX_SHELL = '1';
        process.env.CODEX_THREAD_ID = 'thread-chant-host-error';

        const chantAdapter = {
            id: 'weave:chant',
            execute: mock.fn(async (): Promise<WeaveResult> => ({
                weave_id: 'weave:chant',
                status: 'SUCCESS',
                output: 'legacy node chant should not execute',
            })),
        };
        const hostTextInvoker = mock.fn(async () => {
            throw new Error('bridge timeout');
        });
        const dispatcher = RuntimeDispatcher.createIsolated({
            hostTextInvoker,
            activePersona: { name: 'ODIN' },
        });
        dispatcher.registerAdapter(chantAdapter);

        const result = await dispatcher.dispatch({
            id: 'activation:chant:2',
            skill_id: 'chant',
            target_path: tmpRoot,
            intent: 'plan the next Taliesin migration step',
            params: {
                query: 'plan the next Taliesin migration step',
                project_root: tmpRoot,
                cwd: tmpRoot,
            },
            status: 'PENDING',
            priority: 1,
        });

        delete process.env.CODEX_SHELL;
        delete process.env.CODEX_THREAD_ID;

        assert.strictEqual(result.status, 'FAILURE');
        assert.match(result.error ?? '', /Host-native skill activation failed for 'chant': bridge timeout/);
        assert.strictEqual(result.metadata?.kernel_fallback_policy, 'forbidden');
        assert.strictEqual(chantAdapter.execute.mock.callCount(), 0);
        assert.strictEqual(hostTextInvoker.mock.callCount(), 1);
    });
});
