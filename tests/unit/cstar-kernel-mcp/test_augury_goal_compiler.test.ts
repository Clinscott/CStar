import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    compileAuguryGoalPlan,
    type AuguryGoalPlanInput,
    type AuguryGoalTaskInput,
} from '../../../src/tools/cstar-kernel-mcp/tools/augury_goal_compiler.js';

function task(index: number, suggestedTokenCeiling?: number): AuguryGoalTaskInput {
    return {
        action: `action-${index}`,
        productPath: `products/${index}`,
        ...(suggestedTokenCeiling === undefined ? {} : { suggestedTokenCeiling }),
    };
}

function input(tasks: readonly AuguryGoalTaskInput[] = [task(1)]): AuguryGoalPlanInput {
    return { objective: '  compile the bounded plan  ', tasks };
}

describe('compileAuguryGoalPlan', () => {
    it('is deterministic, normalizes objective whitespace, and hashes a 64-hex plan id', () => {
        const source = input([task(1), task(2, 12000), task(3)]);
        const first = compileAuguryGoalPlan(source);
        const second = compileAuguryGoalPlan(source);

        assert.deepEqual(first, second);
        assert.equal(first.schema, 'cstar.augury_experimental_goal_plan.v1');
        assert.equal(first.objective, 'compile the bounded plan');
        assert.match(first.planId, /^[0-9a-f]{64}$/);
    });

    it('emits distinct ordered cells with the requested identity and sequencing', () => {
        const plan = compileAuguryGoalPlan(input([task(1), task(2, 12000), task(3)]));
        const ids = plan.cells.map((cell) => cell.id);

        assert.equal(new Set(ids).size, 3);
        assert.deepEqual(plan.cells.map((cell) => cell.ordinal), [1, 2, 3]);
        assert.deepEqual(plan.cells.map((cell) => cell.readiness), ['READY', 'LOCKED', 'LOCKED']);
        assert.deepEqual(plan.cells.map((cell) => cell.productAllowlist), [
            ['products/1'], ['products/2'], ['products/3'],
        ]);
        assert.deepEqual(plan.cells.map((cell) => cell.suggestedTokenCeiling), [8000, 12000, 8000]);
        for (const cell of plan.cells) {
            assert.match(cell.id, new RegExp(`^cell-${cell.ordinal}-[0-9a-f]{64}$`));
            assert.equal(cell.requestedModel, 'gpt-5.6-luna');
            assert.equal(cell.requestedReasoning, 'max');
            assert.equal(cell.actualIdentity, 'unreported');
            assert.equal(cell.productAllowlist.length, 1);
            assert.equal(cell.terminalRequirement, 'ONE_TERMINAL_PACKET');
            assert.equal(cell.automaticRetries, 0);
            assert.equal(cell.descendants, false);
            assert.equal(cell.continuation, false);
            assert.equal(cell.replay, false);
            assert.equal(cell.fallback, false);
            assert.deepEqual(cell.metrics, {
                attempts: 0,
                tokens: 0,
                elapsed: 0,
                protectedEffects: 0,
                outsideScopeChanges: 0,
                terminalState: 'PENDING',
            });
        }
    });

    it('rejects empty, oversized, duplicate, unsafe, and invalid inputs', () => {
        assert.throws(() => compileAuguryGoalPlan({ objective: 'x', tasks: [] }));
        assert.throws(() => compileAuguryGoalPlan({
            objective: 'x',
            tasks: Array.from({ length: 17 }, (_, index) => task(index)),
        }));
        assert.throws(() => compileAuguryGoalPlan(input([task(1), { ...task(2), productPath: 'products/1' }])));

        assert.throws(() => compileAuguryGoalPlan({ objective: ' ', tasks: [task(1)] }));
        assert.throws(() => compileAuguryGoalPlan(input([{ ...task(1), action: ' ' }])));
        assert.throws(() => compileAuguryGoalPlan(input([{ ...task(1), productPath: ' ' }])));
        for (const field of ['objective', 'action', 'productPath'] as const) {
            const base = input([task(1)]);
            const unsafe = field === 'objective'
                ? { ...base, objective: 'safe\u0000text' }
                : { ...base, tasks: [{ ...base.tasks[0], [field]: `safe\u0001${field}` }] };
            assert.throws(() => compileAuguryGoalPlan(unsafe));
        }

        for (const ceiling of [999, 64001, 1000.5, '12000', null] as unknown[]) {
            assert.throws(() => compileAuguryGoalPlan(input([{
                ...task(1),
                suggestedTokenCeiling: ceiling as number,
            }])));
        }
    });
});
