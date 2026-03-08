import Database from 'better-sqlite3';
/**
 * Get Gravity DB instance
 * @returns {Database.Database} The db instance
 */
export declare function getGravityDb(): Database.Database;
/**
 * [ALFRED]: "Fused gravity is the true measure of a module's influence."
 * @param {string} filepath - Path to file
 * @returns {Promise<number>} Fused gravity score
 */
export declare function getFileGravity(filepath: string): Promise<number>;
/**
 *
 */
/**
 * Set gravity
 * @param {string} filepath - The file
 * @param {number} weight - The weight
 * @returns {void}
 */
export declare function updateFileGravity(filepath: string, weight: number): void;
/**
 *
 */
/**
 * Set gravity
 * @param {string} filepath - The file
 * @param {number} weight - The weight
 * @returns {void}
 */
export declare function setFileGravity(filepath: string, weight: number): void;
/**
 * Closes the active gravity database connection.
 */
export declare function closeGravityDb(): void;
