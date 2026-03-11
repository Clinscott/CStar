import type { GungnirMatrix } from '../../../types/gungnir.ts';

/**
 * [Ω] THE SKILL RUNTIME CONTRACT (v1.1)
 * Purpose: Define the canonical interface for all Woven Skills in Corvus Star.
 * Mandate: Every skill must be discrete, verifiable, and contract-driven.
 */

/**
 * [🔱] THE SKILL CONTEXT
 * Shared state and environmental configuration for skill execution.
 */
export interface SkillContext {
    mission_id: string;
    persona: string;
    workspace_root: string;
    env: Record<string, string | undefined>;
    trace_id: string;
}

/**
 * [🔱] THE SKILL BEAD
 * Represents a discrete unit of work to be performed by a skill.
 */
export interface SkillBead<T = unknown> {
    id: string;
    skill_id: string;
    target_path: string;
    intent: string;
    params: T;
    status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
    priority: number;
}

/**
 * [🔱] THE SKILL RESULT
 * The output of a skill execution, including the validation delta.
 */
export interface SkillResult {
    bead_id: string;
    status: 'SUCCESS' | 'FAILURE';
    output: string;
    initial_metrics: GungnirMatrix;
    final_metrics: GungnirMatrix;
    sprt_passed: boolean;
    gherkin_evolved: boolean;
    error?: string;
}

/**
 * [🔱] THE CANONICAL SKILL INTERFACE
 * All woven skills must implement this interface.
 */
export interface Skill<T = unknown> {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly contract_path: string;

    /**
     * Pre-execution validation.
     */
    prepare(bead: SkillBead<T>, context: SkillContext): Promise<boolean>;

    /**
     * Primary execution logic.
     */
    execute(bead: SkillBead<T>, context: SkillContext): Promise<SkillResult>;

    /**
     * Post-execution validation.
     */
    validate(result: SkillResult, context: SkillContext): Promise<boolean>;
}
