/**
 * Logic Sensor (L)
 * Purpose: Evaluate cyclomatic complexity and nesting depth.
 * Scale: 1 (Critical Breach) to 10 (Linear Purity).
 */

export function calculateLogicScore(complexity: number, maxNesting: number, loc: number): number {
    if (loc === 0) return 10;

    // 1. Complexity Score (C)
    // Scale: 10 (Linear) to 1 (Complex). Threshold: CC > 20 is a failure.
    const complexityScore = Math.max(1, 10 - (complexity / 2));

    // 2. Nesting Score (N)
    // Scale: 10 (Flat) to 1 (Deep). Threshold: Nesting > 6 is a failure.
    const nestingScore = Math.max(1, 10 - (maxNesting * 1.5));

    // Amalgamate
    const rawScore = (complexityScore * 0.7) + (nestingScore * 0.3);
    return Math.min(Math.max(rawScore, 1), 10);
}
