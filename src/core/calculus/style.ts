/**
 * Style Sensor (S)
 * Purpose: Evaluate Birkhoff's Measure (O/C) and Golden Ratio adherence.
 * Scale: 1 (Chaos) to 10 (Harmonious).
 */

export function calculateStyleScore(code: string): number {
    // 1. Birkhoff's Measure (Simplified for TS/JS)
    const elements = (code.match(/<[a-zA-Z0-9]+/g) || []).length;
    const arbitraryValues = (code.match(/-\[.*?\]/g) || []).length;

    if (elements === 0) {
        // Non-UI file: Evaluate whitespace rhythm and comment density
        const lines = code.split('\n');
        let claustrophobicCount = 0;
        let consecutiveLogic = 0;

        for (const line of lines) {
            if (line.trim() && !line.trim().startsWith('//')) {
                consecutiveLogic++;
                if (consecutiveLogic > 12) claustrophobicCount++;
            } else {
                consecutiveLogic = 0;
            }
        }

        return Math.max(1, 10 - (claustrophobicCount * 2));
    }

    // UI File: Penalize arbitrary values and lack of utility symmetry
    const utilitySymmetry = (code.match(/flex|grid|justify|items|mx-auto/g) || []).length;
    const order = 1 + utilitySymmetry;
    const complexity = 1 + elements + (arbitraryValues * 2);

    const measure = order / complexity;

    // Normalize measure (~0.2-1.0) to 1-10 scale
    return Math.min(Math.max(measure * 10, 1), 10);
}
