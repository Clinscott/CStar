/**
 * Parses git commit history to determine lifetime edit frequency of all files.
 * Seeds this deep historical weight directly into gravity.db.
 */
export declare function seedGitGravity(): Promise<void>;
