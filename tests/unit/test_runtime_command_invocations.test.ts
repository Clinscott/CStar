import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildStartInvocation } from '../../src/node/core/commands/start.js';
import { buildRavensInvocation } from '../../src/node/core/commands/ravens.js';
import {
    buildRegistrySkillBeadInvocation,
    parseChantSessionDirective,
    resolveRegistryCommandActivation,
    shouldAutoResumeChantSession,
} from '../../src/node/core/commands/dispatcher.ts';

const ROOT = 'C:\\Users\\Craig\\Corvus\\CorvusStar';

function expectedInvocation(weaveId: string, payload: Record<string, unknown>) {
    return {
        weave_id: weaveId,
        payload,
        target: { domain: 'brain', workspace_root: ROOT, requested_path: ROOT },
        session: { mode: 'cli', interactive: true },
    };
}

describe('bounded command invocation builders', () => {
    it('builds structured start metadata without dispatching', () => {
        assert.deepStrictEqual(buildStartInvocation('src/index.ts', {
            task: 'Refactor entrypoint',
            ledger: 'C:\\temp\\ledger',
            loki: true,
        }, ROOT), expectedInvocation('weave:start', {
            target: 'src/index.ts',
            task: 'Refactor entrypoint',
            ledger: 'C:\\temp\\ledger',
            loki: true,
            debug: undefined,
            verbose: undefined,
        }));
    });

    it('builds Ravens start metadata without dispatching', () => {
        assert.deepStrictEqual(buildRavensInvocation('start', {
            shadowForge: true,
        }, ROOT), expectedInvocation('weave:ravens', {
            action: 'start',
            shadow_forge: true,
        }));
    });

    it('builds Ravens cycle metadata through the shared identifier', () => {
        assert.deepStrictEqual(buildRavensInvocation('cycle', {}, ROOT), expectedInvocation('weave:ravens', {
            action: 'cycle',
            shadow_forge: undefined,
        }));
    });

    it('includes Ravens host supervision only when explicitly requested', () => {
        assert.equal(buildRavensInvocation('cycle', {
            hostSupervision: true,
        }, ROOT).payload.host_supervision, true);
    });

    it('blocks host-only chant terminal activation', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-chant-surface-'));
        try {
            fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
            fs.writeFileSync(path.join(root, '.agents', 'skill_registry.json'), JSON.stringify({
                entries: {
                    chant: {
                        entry_surface: 'host-only',
                        execution: { mode: 'agent-native' },
                        runtime_trigger: 'chant',
                    },
                },
            }));

            const activation = resolveRegistryCommandActivation('chant', ['scan'], root, root);

            assert.equal(activation.kind, 'blocked');
            if (activation.kind === 'blocked') {
                assert.equal(activation.skillId, 'chant');
                assert.equal(activation.surface, 'host-only');
                assert.match(activation.error, /host-only.*active host conversation/i);
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('does not auto-resume chant for a fresh detailed planning request', () => {
        assert.equal(shouldAutoResumeChantSession(['plan', 'a', 'fresh', 'request']), false);
        assert.deepStrictEqual(
            parseChantSessionDirective(['--new-session', 'plan', 'a', 'fresh', 'request']),
            {
                queryArgs: ['plan', 'a', 'fresh', 'request'],
                sessionId: undefined,
                shouldResume: false,
            },
        );
    });

    it('parses explicit chant resume directives without executing them', () => {
        assert.equal(shouldAutoResumeChantSession(['proceed']), true);
        assert.deepStrictEqual(
            parseChantSessionDirective(['--session', 'chant-session:abc123', 'proceed']),
            {
                queryArgs: ['proceed'],
                sessionId: 'chant-session:abc123',
                shouldResume: true,
            },
        );
    });

    it('classifies an underspecified registry command as retired compatibility', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-command-registry-'));
        try {
            fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
            fs.writeFileSync(path.join(root, '.agents', 'skill_registry.json'), JSON.stringify({
                entries: {
                    orchestrate: {
                        execution: { mode: 'agent-native' },
                        runtime_trigger: 'orchestrate',
                    },
                },
            }));

            assert.equal(
                buildRegistrySkillBeadInvocation('orchestrate', [], root, root),
                null,
            );
            const activation = resolveRegistryCommandActivation('orchestrate', [], root, root);
            assert.equal(activation.kind, 'blocked');
            if (activation.kind === 'blocked') {
                assert.equal(activation.skillId, 'orchestrate');
                assert.equal(activation.surface, 'compatibility');
                assert.match(activation.error, /retired compatibility surface.*cstar-kernel/i);
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
