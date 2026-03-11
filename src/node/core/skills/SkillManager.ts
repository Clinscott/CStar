import { Skill, SkillBead, SkillResult, SkillContext } from './types.js';
import { StateRegistry } from '../state.js';
import { activePersona } from '../../../tools/pennyone/personaRegistry.js';
import { registry } from '../../../tools/pennyone/pathRegistry.js';
import crypto from 'node:crypto';
import { createGungnirMatrix, getGungnirOverall } from '../../../types/gungnir.js';

/**
 * [Ω] THE SKILL DISPATCHER (v1.1)
 * Purpose: Orchestrate the loading, execution, and validation of Woven Skills.
 * Mandate: Maintain the integrity of the Agent Loop.
 */
export class SkillDispatcher {
    private skills: Map<string, Skill<any>> = new Map();
    private static instance: SkillDispatcher;

    private constructor() {}

    public static getInstance(): SkillDispatcher {
        if (!this.instance) {
            this.instance = new SkillDispatcher();
        }
        return this.instance;
    }

    public register(skill: Skill<any>): void {
        this.skills.set(skill.id, skill);
    }

    /**
     * [🔱] THE CANONICAL DISPATCH
     * The primary entry point for all skill execution in Corvus Star.
     */
    public async dispatch<T>(bead: SkillBead<T>): Promise<SkillResult> {
        const skill = this.skills.get(bead.skill_id);
        
        if (!skill) {
            throw new Error(`[ALFRED]: "I am unable to locate the skill '${bead.skill_id}' within our current repertoire, sir."`);
        }

        const context: SkillContext = {
            mission_id: bead.id,
            persona: activePersona.name,
            workspace_root: registry.getRoot(),
            env: process.env,
            trace_id: crypto.randomUUID()
        };

        // Update Framework State
        StateRegistry.updateMission(bead.id, bead.intent);

        try {
            const isReady = await skill.prepare(bead, context);
            if (!isReady) {
                throw new Error(`[ALFRED]: "The preparation for skill '${skill.name}' has failed, sir."`);
            }

            const result = await skill.execute(bead, context);
            const isValid = await skill.validate(result, context);

            if (!isValid) {
                throw new Error(`[ALFRED]: "The execution of '${skill.name}' failed validation standards, sir."`);
            }

            this.syncResult(result);
            return result;
        } catch (error: any) {
            const failure: SkillResult = {
                bead_id: bead.id,
                status: 'FAILURE',
                output: `Execution failed: ${error.message}`,
                initial_metrics: createGungnirMatrix(),
                final_metrics: createGungnirMatrix(),
                sprt_passed: false,
                gherkin_evolved: false,
                error: error.message
            };
            return failure;
        }
    }

    private syncResult(result: SkillResult): void {
        StateRegistry.updateFramework({
            gungnir_score: getGungnirOverall(result.final_metrics),
            status: 'AWAKE'
        });
    }

    public getSkills(): Skill<any>[] {
        return Array.from(this.skills.values());
    }
}
