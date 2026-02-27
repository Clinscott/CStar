/**
 * Style Sensor (S) - Refactored (Agnostic)
 * Purpose: Evaluate structural symmetry and naming purity.
 * Scale: 1 (Chaos) to 10 (Harmonious).
 */

export function calculateStyleScore(code: string): number {
    const lines = code.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return 10;

    // 1. Structural Symmetry (Line Length Consistency)
    // Harmonious code often has consistent rhythms in line lengths.
    const lengths = lines.map(l => l.trim().length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + Math.pow(b - avgLength, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);

    // Penalize extreme standard deviation (extreme jaggedness)
    const symmetryScore = Math.max(1, 10 - (stdDev / 8));

    // 2. Naming Purity (camelCase Adherence)
    // Corvus Star mandates camelCase/PascalCase for identifiers.
    const identifiers = code.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    const validIdentifiers = identifiers.filter(id => /^[a-z][a-zA-Z0-9]*$|^[A-Z][a-zA-Z0-9]*$/.test(id));
    const purityRatio = identifiers.length > 0 ? validIdentifiers.length / identifiers.length : 1;
    const purityScore = purityRatio * 10;

    // 3. Complexity Density (Decl vs expression rhythm)
    // High density logic without air (claustrophobia)
    let claustrophobicPenalty = 0;
    let blockCount = 0;
    for (const line of lines) {
        if (!line.includes('//') && !line.includes('/*')) {
            blockCount++;
            if (blockCount > 12) claustrophobicPenalty += 0.5;
        } else {
            blockCount = 0;
        }
    }

    const rawScore = (symmetryScore * 0.4) + (purityScore * 0.4) + (Math.max(1, 10 - claustrophobicPenalty) * 0.2);
    return Math.min(Math.max(rawScore, 1), 10);
}
