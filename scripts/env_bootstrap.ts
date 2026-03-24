import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../');

/**
 * [🔱] THE ENVIRONMENTAL BOOTSTRAP
 * Purpose: Ensure the .env file exists and contains the necessary keys for Linux/Windows.
 */
export function bootstrapEnv(): void {
    const envPath = path.join(PROJECT_ROOT, '.env');
    let envContent = '';

    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
    }

    const requiredKeys: Record<string, string> = {
        'CSTAR_PROJECT_ROOT': PROJECT_ROOT,
        'PYTHONPATH': PROJECT_ROOT,
        'GEMINI_CLI_ACTIVE': 'true'
    };

    let updated = false;
    const lines = envContent.split('\n');

    for (const [key, value] of Object.entries(requiredKeys)) {
        if (!envContent.includes(`${key}=`)) {
            lines.push(`${key}=${value}`);
            updated = true;
        }
    }

    if (updated || !fs.existsSync(envPath)) {
        fs.writeFileSync(envPath, lines.join('\n').trim() + '\n');
        console.log(chalk.green(`[SUCCESS]: Environmental bootstrap synchronized for ${envPath}`));
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    bootstrapEnv();
}
