import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Skill, SkillBead, SkillResult } from '../../src/node/core/skills/types.js';
import { SkillDispatcher } from '../../src/node/core/skills/SkillManager.js';
import { createGungnirMatrix, getGungnirOverall } from '../../src/types/gungnir.js';

/**
 * [🔱] Mock Skill for Runtime Validation
 */
class MockSkill implements Skill {
    public readonly id = 'mock_skill';
    public readonly name = 'Mock Skill';
    public readonly description = 'A skill for validating the runtime contract.';
    public readonly contract_path = '.agents/skills/mock_skill.feature';

    public async prepare(bead: SkillBead): Promise<boolean> {
        return true;
    }

    public async execute(bead: SkillBead): Promise<SkillResult> {
        return {
            bead_id: bead.id,
            status: 'SUCCESS',
            output: 'Mock execution successful.',
            initial_metrics: createGungnirMatrix({
                logic: 7,
                style: 7,
                intel: 7,
                gravity: 2,
                vigil: 6,
                evolution: 7,
                anomaly: 0,
                sovereignty: 7,
                overall: 7.5,
                stability: 7,
                coupling: 2,
                aesthetic: 7,
            }),
            final_metrics: createGungnirMatrix({
                logic: 8,
                style: 8,
                intel: 8,
                gravity: 1,
                vigil: 8,
                evolution: 8,
                anomaly: 0,
                sovereignty: 8,
                overall: 8.25,
                stability: 8,
                coupling: 1,
                aesthetic: 8,
            }),
            sprt_passed: true,
            gherkin_evolved: false
        };
    }

    public async validate(result: SkillResult): Promise<boolean> {
        return result.status === 'SUCCESS' && result.sprt_passed;
    }
}

describe('Skill Runtime Contract (CS-P1-01)', () => {
    const manager = SkillDispatcher.getInstance();
    const mockSkill = new MockSkill();

    it('should register a new skill', () => {
        manager.register(mockSkill);
        const skills = manager.getSkills();
        assert.ok(skills.some(s => s.id === 'mock_skill'));
    });

    it('should dispatch a bead to the correct skill', async () => {
        const bead: SkillBead = {
            id: 'bead_001',
            skill_id: 'mock_skill',
            target_path: 'src/mock.ts',
            intent: 'Validate the runtime spine.',
            params: {},
            status: 'PENDING',
            priority: 1
        };

        const result = await manager.dispatch(bead);
        assert.strictEqual(result.status, 'SUCCESS');
        assert.strictEqual(result.bead_id, 'bead_001');
        assert.ok(getGungnirOverall(result.final_metrics) > getGungnirOverall(result.initial_metrics));
    });

    it('should fail gracefully for unknown skills', async () => {
        const bead: SkillBead = {
            id: 'bead_002',
            skill_id: 'unknown_skill',
            target_path: 'src/mock.ts',
            intent: 'Expect a failure.',
            params: {},
            status: 'PENDING',
            priority: 1
        };

        await assert.rejects(async () => {
            await manager.dispatch(bead);
        }, (err: Error) => {
            return err.message.includes('unable to locate the skill');
        });
    });
});
