/**
 * Pure function to construct the OS-specific path to the python virtual environment
 * executable binaries (like pip).
 * @param platform - The OS platform (e.g. process.platform)
 * @param projectRoot - The absolute path to the project root
 * @param binaryName - The name of the binary (e.g. 'pip' or 'python')
 * @returns The absolute path to the binary
 */
export declare function getVenvBinaryPath(platform: string, projectRoot: string, binaryName: string): string;
/**
 * Executes the autonomous Corvus Star (C*) Bootstrap genesis sequence.
 * This establishes the isolated Python compute plane and globally links the Node.js Gungnir CLI.
 * @param platform - injected OS platform
 * @param execFunction - Dependency-injected execution function for testing.
 * @param fsMock - Dependency-injected fs/promises for testing.
 */
export declare function executeGenesisSequence(platform?: string, execFunction?: any, fsMock?: any): Promise<void>;
