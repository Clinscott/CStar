/**
 * Logic Sensor (L)
 * Purpose: Evaluate cyclomatic complexity and nesting depth.
 * Scale: 1 (Critical Breach) to 10 (Linear Purity).
 */

export function calculateLogicScore(complexity: number, maxNesting: number, loc: number): number {
    if (loc === 0) return 10;

    // 1. Complexity Score (C)
    // Threshold: CC 1-5 = 10, 10 = 5, 20+ = 1
    const complexityScore = Math.max(1, 10 - (complexity / 2));

    // 2. Nesting Score (N)
    // Threshold: 1-2 = 10, 4 = 5, 6+ = 1
    const nestingScore = Math.max(1, 10 - (maxNesting * 1.5));

    // Amalgamate
    const rawScore = (complexityScore * 0.7) + (nestingScore * 0.3);
    return Math.min(Math.max(rawScore, 1), 10);
}
