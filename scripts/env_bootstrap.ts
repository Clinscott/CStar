import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../');
const RETIRED_ENV_KEYS = new Set([
    'GEMINI_CLI',
    'GEMINI_CLI_ACTIVE',
    'GEMINI_CLI_SUBAGENTS',
]);

export interface SynchronizedEnv {
    content: string;
    updated: boolean;
}

export function synchronizeEnvContent(
    envContent: string,
    requiredKeys: Record<string, string>,
): SynchronizedEnv {
    let updated = false;
    const existingKeys = new Set<string>();
    const lines = envContent.split('\n').filter((line) => {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        const key = match?.[1];
        if (!key) {
            return true;
        }
        if (RETIRED_ENV_KEYS.has(key)) {
            updated = true;
            return false;
        }
        existingKeys.add(key);
        return true;
    });

    for (const [key, value] of Object.entries(requiredKeys)) {
        if (!existingKeys.has(key)) {
            lines.push(`${key}=${value}`);
            updated = true;
        }
    }

    return {
        content: `${lines.join('\n').trim()}\n`,
        updated,
    };
}

/**
 * [🔱] THE ENVIRONMENTAL BOOTSTRAP
 * Purpose: Ensure the .env file exists and contains the necessary keys for Linux/Windows.
 */
export function bootstrapEnv(): void {
    const envPath = path.join(PROJECT_ROOT, '.env');
    const localEnvPath = path.join(PROJECT_ROOT, '.env.local');
    let envContent = '';

    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
    }

    const requiredKeys: Record<string, string> = {
        'CSTAR_PROJECT_ROOT': PROJECT_ROOT,
        'PYTHONPATH': PROJECT_ROOT
    };
    const synchronized = synchronizeEnvContent(envContent, requiredKeys);

    if (synchronized.updated || !fs.existsSync(envPath)) {
        fs.writeFileSync(envPath, synchronized.content);
        console.log(chalk.green(`[SUCCESS]: Environmental bootstrap synchronized for ${envPath}`));
    }

    if (fs.existsSync(localEnvPath)) {
        const localContent = fs.readFileSync(localEnvPath, 'utf-8');
        const synchronizedLocal = synchronizeEnvContent(localContent, {});
        if (synchronizedLocal.updated) {
            fs.writeFileSync(localEnvPath, synchronizedLocal.content);
            console.log(chalk.green(`[SUCCESS]: Environmental bootstrap synchronized for ${localEnvPath}`));
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    bootstrapEnv();
}
