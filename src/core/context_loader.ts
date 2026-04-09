import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * [🔱] CASCADING CONTEXT LOADER
 * Purpose: Merge hierarchical AGENTS.md files into a single directive block.
 * Standard: Linscott Protocol (Stage 8 Alignment).
 */
export function loadCascadingContext(projectRoot: string): string {
    const contextFiles: string[] = [];
    let currentDir = path.resolve(projectRoot);
    const homeDir = os.homedir();

    // 1. Traverse upwards from project root to home (or root /)
    while (true) {
        const potentialPath = path.join(currentDir, 'AGENTS.md');
        const potentialQmd = path.join(currentDir, 'AGENTS.qmd');

        if (fs.existsSync(potentialPath)) {
            contextFiles.unshift(fs.readFileSync(potentialPath, 'utf-8'));
        } else if (fs.existsSync(potentialQmd)) {
            contextFiles.unshift(fs.readFileSync(potentialQmd, 'utf-8'));
        }

        if (currentDir === homeDir || currentDir === path.dirname(currentDir)) {
            break;
        }
        currentDir = path.dirname(currentDir);
    }

    // 2. Also check ~/.corvus/AGENTS.md if it wasn't hit
    const corvusHomePath = path.join(homeDir, '.corvus', 'AGENTS.md');
    if (fs.existsSync(corvusHomePath)) {
        const content = fs.readFileSync(corvusHomePath, 'utf-8');
        if (!contextFiles.includes(content)) {
            contextFiles.unshift(content);
        }
    }

    if (contextFiles.length === 0) {
        return '';
    }

    return [
        '◤ CASCADING CONTEXT (PI-HARDENED) ◢',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        ...contextFiles,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ].join('\n\n');
}
