import { execa } from 'execa';
import { registry } from  '../pathRegistry.js';
import { 
    saveHallGitHistory, 
    saveHallGitDiff
} from './database.ts';
import { 
    buildHallRepositoryId, 
    normalizeHallPath, 
    HallGitCommitRecord, 
    HallGitDiffRecord 
} from '../../../types/hall.ts';
import chalk from 'chalk';

/**
 * Chronos Indexer
 * Purpose: Ingest full git history into the Hall of Records.
 * Mandate: Temporal Awareness
 */
export class ChronosIndexer {
    private repoPath: string;
    private repoId: string;

    constructor(repoPath?: string) {
        this.repoPath = repoPath || registry.getRoot();
        this.repoId = buildHallRepositoryId(normalizeHallPath(this.repoPath));
    }

    /**
     * Index the git history of the repository.
     */
    public async index(limit: number = 1000): Promise<void> {
        console.error(chalk.cyan(`[ALFRED] Ingesting temporal history for ${this.repoId}...`));

        try {
            // Get commit history with metadata
            // Format: hash|authorName|authorEmail|authorDate|committerName|committerEmail|committerDate|subject|parents
            const { stdout } = await execa('git', [
                'log',
                `-n ${limit}`,
                '--pretty=format:%H|%an|%ae|%at|%cn|%ce|%ct|%s|%P',
            ], { cwd: this.repoPath });

            const lines = stdout.split('\n');
            let count = 0;

            for (const line of lines) {
                if (!line.trim()) continue;
                const [
                    hash, authorName, authorEmail, authorDate,
                    committerName, committerEmail, committerDate,
                    subject, parents
                ] = line.split('|');

                const commit: HallGitCommitRecord = {
                    commit_hash: hash,
                    repo_id: this.repoId,
                    author_name: authorName,
                    author_email: authorEmail,
                    authored_at: parseInt(authorDate) * 1000,
                    committer_name: committerName,
                    committer_email: committerEmail,
                    committed_at: parseInt(committerDate) * 1000,
                    message: subject,
                    parent_hashes: parents ? parents.split(' ') : []
                };

                saveHallGitHistory(commit);
                
                // Optionally index diffs for the latest commits (e.g., top 100)
                if (count < 100) {
                    await this.indexDiff(hash);
                }

                count++;
            }

            console.error(chalk.green(`[ALFRED] Temporal ingestion complete. ${count} commits recorded.`));
        } catch (e: any) {
            console.error(chalk.red(`[ERROR] Chronos Indexer failed: ${e.message}`));
        }
    }

    /**
     * Index the diff for a specific commit.
     */
    private async indexDiff(commitHash: string): Promise<void> {
        try {
            // Get files changed in this commit
            const { stdout } = await execa('git', [
                'show',
                '--name-status',
                '--format=',
                commitHash
            ], { cwd: this.repoPath });

            const lines = stdout.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const [status, filePath, newPath] = trimmed.split(/\s+/);
                
                let changeType: HallGitDiffRecord['change_type'] = 'MODIFIED';
                if (status.startsWith('A')) changeType = 'ADDED';
                else if (status.startsWith('D')) changeType = 'DELETED';
                else if (status.startsWith('R')) changeType = 'RENAMED';

                const diff: HallGitDiffRecord = {
                    commit_hash: commitHash,
                    repo_id: this.repoId,
                    file_path: changeType === 'RENAMED' ? (newPath || filePath) : filePath,
                    change_type: changeType,
                    old_path: changeType === 'RENAMED' ? filePath : undefined,
                    insertions: 0, // Simplified for now
                    deletions: 0
                };

                saveHallGitDiff(diff);
            }
        } catch (e) {
            // Skip diff indexing errors for individual commits
        }
    }
}
