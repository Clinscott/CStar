import { execa } from 'execa';
import { registry } from  '../pathRegistry.js';
import { setFileGravity } from  './gravity_db.js';
import chalk from 'chalk';
import path from 'path';

/**
 * Parses git commit history to determine lifetime edit frequency of all files.
 * Seeds this deep historical weight directly into gravity.db.
 */
export async function seedGitGravity(): Promise<void> {
    console.log(chalk.cyan('[O.D.I.N.]: "Consulting the old logs. Seeding the gravity well..."'));

    try {
        const root = registry.getRoot();
        const { stdout } = await execa('git', ['log', '--name-only', '--pretty=format:'], { cwd: root, maxBuffer: 1024 * 1024 * 50 });

        const lines = stdout.split('\n');
        const frequencies = new Map<string, number>();

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Reconstruct absolute path
            const absolutePath = registry.normalize(path.join(root, trimmed));

            // Only care about valid source files
            if (!absolutePath.match(/\.(ts|js|tsx|jsx|py)$/)) continue;

            frequencies.set(absolutePath, (frequencies.get(absolutePath) || 0) + 1);
        }

        let seededCount = 0;
        for (const [filepath, weight] of frequencies.entries()) {
            setFileGravity(filepath, weight);
            seededCount++;
        }

        console.log(chalk.green(`[O.D.I.N.]: "Matrix seeded. ${seededCount} artifacts imbued with deep historical gravity."`));

    } catch (err: any) {
        console.error(chalk.red(`[ERROR] Failed to seed Git gravity: ${err.message}`));
    }
}

// Allow direct execution
const isMain = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/')) || process.argv[1]?.endsWith('git_trainer.js');
if (isMain) {
    seedGitGravity();
}


