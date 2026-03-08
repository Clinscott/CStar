/**
 * Intel Sensor (I)
 * Purpose: Evaluate documentation ratio and knowledge density.
 * Scale: 1 (Opaque) to 10 (Transparent).
 */
/**
 * Evaluate documentation ratio and knowledge density.
 * @param {string} code - Source code
 * @param {number} loc - Lines of code
 * @returns {number} Score from 1 to 10
 */
export declare function calculateIntelScore(code: string, loc: number): number;
