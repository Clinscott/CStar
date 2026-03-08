/**
 * Logic Sensor (L)
 * Purpose: Evaluate cyclomatic complexity and nesting depth.
 * Scale: 1 (Critical Breach) to 10 (Linear Purity).
 */
/**
 * Evaluate cyclomatic complexity and nesting depth.
 * @param {number} complexity - Cyclomatic complexity
 * @param {number} maxNesting - Maximum nesting depth
 * @param {number} loc - Lines of code
 * @returns {number} Score from 1 to 10
 */
export declare function calculateLogicScore(complexity: number, maxNesting: number, loc: number): number;
