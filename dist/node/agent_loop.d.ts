import { CortexLink } from './cortex_link.js';
/**
 * Orchestrates the 7-step Gungnir Flight Cycle to modify and verify a target file.
 * @param {string} targetFile - The code file the agent should analyze/refactor.
 * @param {string} ledgerDirectory - The path to the working knowledge/ledger vault.
 * @param {string} taskDescription - The high-level directive for the compute plane.
 * @param {CortexLink} cortexLink - Instantiated TCP bridge to the Python daemon.
 * @param {Function} deployExec - Dependency-injected execution function (defaults to internal deployCandidate).
 */
export declare function executeCycle(targetFile: string, ledgerDirectory: string, taskDescription: string, cortexLink: CortexLink, deployExec?: (_target: string, _candidate: string, _msg: string) => Promise<void>, isLoki?: boolean): Promise<void>;
