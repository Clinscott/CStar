/**
 * [ALFRED]: "The crawler is calibrated to ignore the Python Paradox, sir.
 * We now observe the polyglot landscape, including documentation and workflows,
 * while maintaining a strict perimeter around our own telemetry."
 * @param {string} targetPath - Path to crawl
 * @returns {Promise<string[]>} File paths
 */
export declare function crawlRepository(targetPath: string): Promise<string[]>;
