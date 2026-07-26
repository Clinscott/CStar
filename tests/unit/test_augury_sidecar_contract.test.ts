import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
    formatAuguryBlock,
    nextAuguryMode,
    resolvePlanningKey,
} from '../../.agents/extension/hooks/augury_sidecar.js';
import { HUD } from '../../src/node/core/hud.ts';

function routedAugury() {
    return {
        status: 'routed',
        routing_authority: 'cstar_augury',
        intent_category: 'REPAIR',
        intent: 'Retire the legacy selection gate.',
        selection: 'WEAVE: restoration',
        scope: 'brain:CStar',
        mimir_targets: ['AGENTS.md', 'src/tools/cstar-kernel-mcp/tools/augury.ts'],
        council_expert: {
            id: 'karpathy',
            label: 'KARPATHY',
            lens: 'Keep model routing behind deterministic tool contracts.',
            signature_question: 'Where can an invented route touch state?',
            guardrails: [
                'Do not let a host invent routing state.',
                'Do not duplicate Council selection.',
            ],
            selection_reason: 'AI-system and model-boundary work',
        },
    };
}

describe('Augury sidecar authority contract', () => {
    it('renders the exact MCP route and complete Council contract in full mode', () => {
        const block = formatAuguryBlock({
            mode: 'full',
            augury: routedAugury(),
            status: { framework: { gungnir_score: 9.2 } },
            projectRoot: '/repo/CStar',
        });

        assert.match(block, /Mode: full/);
        assert.match(block, /Authority: cstar_augury/);
        assert.match(block, /Route: REPAIR -> WEAVE: restoration/);
        assert.match(block, /Council Expert: KARPATHY/);
        assert.match(block, /Council Lens: Keep model routing/);
        assert.match(block, /Guardrails: Do not let a host invent routing state/);
        assert.match(block, /Selection Reason: AI-system and model-boundary work/);
        assert.doesNotMatch(block, /Confidence:/);
        assert.doesNotMatch(block, /Corvus Star Trace/);
    });

    it('compacts the same MCP result without reselecting in lite mode', () => {
        const block = formatAuguryBlock({
            mode: 'lite',
            augury: routedAugury(),
            status: null,
            projectRoot: '/repo/CStar',
        });

        assert.match(block, /Mode: lite/);
        assert.match(block, /Route: REPAIR -> WEAVE: restoration/);
        assert.match(block, /Council Expert: KARPATHY/);
        assert.doesNotMatch(block, /Council Lens:/);
        assert.doesNotMatch(block, /TORVALDS/);
    });

    it('fails visibly instead of inventing a route or expert', () => {
        const block = formatAuguryBlock({
            mode: 'full',
            augury: {
                status: 'unavailable',
                routing_authority: 'cstar_augury',
                failure_reason: 'MCP timeout',
            },
            status: null,
            projectRoot: '/repo/CStar',
        });

        assert.match(block, /Mode: unavailable/);
        assert.match(block, /Do not infer a route or Council expert/);
        assert.doesNotMatch(block, /ORCHESTRATE/);
        assert.doesNotMatch(block, /TORVALDS/);
    });

    it('preserves a blocked MCP decision without fabricating designation fields', () => {
        const block = formatAuguryBlock({
            mode: 'full',
            augury: {
                status: 'blocked',
                routing_authority: 'cstar_augury',
                next_action: 'Clarify the active mission.',
                required_operator_decision: 'Choose the current planning session.',
            },
            status: null,
            projectRoot: '/repo/CStar',
        });

        assert.match(block, /Mode: blocked/);
        assert.match(block, /Choose the current planning session/);
        assert.doesNotMatch(block, /^Route:/m);
        assert.doesNotMatch(block, /^Council Expert:/m);
    });

    it('uses full once per planning key and lite thereafter', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-augury-sidecar-'));
        const countersPath = path.join(tempRoot, 'counters.json');

        assert.equal(nextAuguryMode('plan-a', countersPath), 'full');
        assert.equal(nextAuguryMode('plan-a', countersPath), 'lite');
        assert.equal(nextAuguryMode('plan-b', countersPath), 'full');
        assert.equal(resolvePlanningKey({ planning_key: 'plan-b', session_id: 'session-a' }), 'plan-b');
        assert.equal(resolvePlanningKey({ session_id: 'session-a' }), 'session-a');
    });

    it('does not treat a magic source comment as write authorization', () => {
        const hookPath = path.join(
            process.cwd(),
            '.agents',
            'extension',
            'hooks',
            'before_write.js',
        );
        const run = spawnSync(process.execPath, [hookPath], {
            input: JSON.stringify({
                tool_name: 'write_file',
                tool_input: {
                    file_path: 'src/example.ts',
                    content: 'export const value = 1;\n',
                },
            }),
            encoding: 'utf-8',
        });

        assert.equal(run.status, 0, run.stderr);
        assert.deepEqual(JSON.parse(run.stdout), { decision: 'allow' });
    });

    it('keeps the old HUD method as an Augury-labelled compatibility alias', () => {
        const output = HUD.traceHUD({
            intent: 'Inspect a bounded route.',
            well: 'src/example.ts',
            confidence: 0.99,
        }).replace(/\x1B\[[0-9;]*m/g, '');

        assert.match(output, /CORVUS STAR AUGURY/);
        assert.doesNotMatch(output, /CORVUS STAR TRACE/);
        assert.doesNotMatch(output, /CONFIDENCE/);
    });
});
