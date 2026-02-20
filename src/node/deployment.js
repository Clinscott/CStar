import fs from 'node:fs/promises';
import { execa } from 'execa';
import chalk from 'chalk';

/**
 * Overwrites a target file with the verified candidate and stages/commits it to Git.
 * 
 * @param {string} targetFile - The original file to overwrite.
 * @param {string} candidateFile - The newly generated and verified candidate file.
 * @param {Function} execFunction - Dependency-injected execution function (defaults to execa).
 */
export async function deployCandidate(targetFile, candidateFile, commitMessage, execFunction = execa) {
    console.log(chalk.magenta("ALFRED: 'Deploying candidate to mainline...'"));

    try {
        // Step 1: Overwrite target with candidate
        await fs.rename(candidateFile, targetFile);
    } catch (err) {
        throw new Error(`Deployment Failed during Overwrite (rename). Details: ${err.message}`);
    }

    try {
        // Step 2: Git Stage
        await execFunction('git', ['add', targetFile]);

        // Step 3: Git Commit
        await execFunction('git', ['commit', '-m', commitMessage]);
    } catch (err) {
        throw new Error(`Deployment Failed during Git Operations. Details: ${err.message}`);
    }
}
