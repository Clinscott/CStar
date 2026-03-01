/**
 * Overwrites a target file with the verified candidate and stages/commits it to Git.
 *
 * @param targetFile - The original file to overwrite.
 * @param candidateFile - The newly generated and verified candidate file.
 * @param commitMessage - Git commit message.
 * @param execFunction - Dependency-injected execution function (defaults to execa).
 */
export declare function deployCandidate(targetFile: string, candidateFile: string, commitMessage: string, execFunction?: any): Promise<void>;
