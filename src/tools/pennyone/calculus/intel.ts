/**
 * Intel Sensor (I)
 * Purpose: Evaluate documentation ratio and knowledge density.
 * Scale: 1 (Opaque) to 10 (Transparent).
 */

export function calculateIntelScore(code: string, loc: number): number {
    if (loc === 0) return 10;

    // 1. Documentation Density
    const comments = (code.match(/\/\/|\/\*|'''|"""/g) || []).length;
    const docRatio = comments / loc;

    // Scale: 0.1 ratio = 5, 0.2+ = 10
    const docScore = Math.min(docRatio * 50, 10);

    // 2. Export/Public Interface Clarity (Heuristic)
    const exports = (code.match(/export /g) || []).length;
    const exportScore = exports > 0 ? 10 : 7; // Penalize "internal only" files slightly if large

    const rawScore = (docScore * 0.8) + (exportScore * 0.2);
    return Math.max(1, rawScore);
}
