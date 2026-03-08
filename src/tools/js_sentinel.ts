import { execa } from 'execa';
import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const CONFIG_PATH = path.join(PROJECT_ROOT, '.agents', 'config.json');

/**
 * Loads the active persona from the config file.
 * @returns The active persona name.
 */
async function getActivePersona(): Promise<string> {
    try {
        const configData = await fs.readFile(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(configData);
        return config.system?.persona || 'ALFRED';
    } catch (err: unknown) {
        return 'ALFRED';
    }
}

interface TextLore {
    TITLE: string;
    SCAN_TARGET: string;
    VIOLATIONS: string;
    PREFIX: string;
    PASS: string;
}

const TEXT_MAP: Record<string, TextLore> = {
    ODIN: {
        TITLE: '[Ω] HEIMDALL JS SECURITY SCAN',
        SCAN_TARGET: 'TARGET SECTOR',
        VIOLATIONS: 'ANOMALIES',
        PREFIX: '[!] BREACH',
        PASS: 'SECTOR SECURE. NO ANOMALIES.'
    },
    ALFRED: {
        TITLE: '[A] THE PERIMETER JS SCAN',
        SCAN_TARGET: 'SCAN AREA',
        VIOLATIONS: 'FINDINGS',
        PREFIX: '[i] NOTE',
        PASS: 'The manor is immaculate, sir.'
    }
};

interface Violation {
    file: string;
    line: number;
    col: number;
    rule: string;
    message: string;
    severity: 'ERROR' | 'WARN';
}

/**
 * Main execution loop for the JS Sentinel.
 * @param {string} target - Path to scan
 * @param {boolean} fix - Whether to auto-fix violations
 */
async function runSentinel(target: string = '.', fix: boolean = false): Promise<void> {
    const persona = await getActivePersona();
    const text = TEXT_MAP[persona] || TEXT_MAP.ALFRED;

    console.log(chalk.bold('━'.repeat(80)));
    console.log(chalk.bold(`  ${text.TITLE}`));
    console.log(chalk.cyan(`  ${text.SCAN_TARGET.padEnd(15)}: ${target}`));

    try {
        const args = ['eslint', target, '--format', 'json'];
        if (fix) args.push('--fix');
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        const { stdout } = await execa(npxCmd, args, { cwd: PROJECT_ROOT, reject: false });
        const results = JSON.parse(stdout);

        let totalViolations = 0;
        const violations: Violation[] = [];

        results.forEach((res: any) => {
            res.messages.forEach((msg: any) => {
                totalViolations++;
                violations.push({
                    file: path.relative(PROJECT_ROOT, res.filePath),
                    line: msg.line,
                    col: msg.column,
                    rule: msg.ruleId,
                    message: msg.message,
                    severity: msg.severity === 2 ? 'ERROR' : 'WARN'
                });
            });
        });

        console.log(chalk[totalViolations > 0 ? 'red' : 'green'](`  ${text.VIOLATIONS.padEnd(15)}: ${totalViolations}`));
        console.log(chalk.bold('━'.repeat(80)));

        if (totalViolations > 0) {
            violations.slice(0, 15).forEach(v => {
                const color = v.severity === 'ERROR' ? chalk.red : chalk.yellow;
                const loc = `${v.file}:${v.line}:${v.col}`;
                const ruleName = v.rule || 'parse-error';
                console.log(`  ${color(text.PREFIX)} ${chalk.bold(ruleName.padEnd(20))} ${chalk.dim(loc)} - ${v.message}`);
            });

            if (totalViolations > 15) {
                console.log(chalk.dim(`  ... + ${totalViolations - 15} more findings`));
            }
            process.exit(1);
        } else {
            console.log(chalk.green(`  STATUS         : ${text.PASS}`));
            process.exit(0);
        }

    } catch (err: any) {
        console.error(chalk.red(`  [SYSTEM FAILURE] ${err.message}`));
        process.exit(1);
    }
}

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const target = args.find(a => !a.startsWith('--')) || '.';
runSentinel(target, fix);
