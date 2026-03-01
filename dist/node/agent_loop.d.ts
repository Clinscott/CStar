import { CortexLink } from './cortex_link.js';
/**
 * Orchestrates the 7-step Gungnir Flight Cycle to modify and verify a target file.
 *
 * @param targetFile - The code file the agent should analyze/refactor.
 * @param ledgerDirectory - The path to the working knowledge/ledger vault.
 * @param taskDescription - The high-level directive for the compute plane.
 * @param cortexLink - Instantiated TCP bridge to the Python daemon.
 * @param deployExec - Dependency-injected execution function (defaults to internal deployCandidate).
 */
export declare function executeCycle(targetFile: string, ledgerDirectory: string, taskDescription: string, cortexLink: CortexLink, deployExec?: (target: string, candidate: string, msg: string) => Promise<void>): Promise<void>;
