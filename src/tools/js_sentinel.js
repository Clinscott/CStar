import { execa } from 'execa';
import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const CONFIG_PATH = path.join(PROJECT_ROOT, '.agent', 'config.json');

async function getActivePersona() {
    try {
        const configData = await fs.readFile(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(configData);
        return config.system?.persona || 'ALFRED';
    } catch (err) {
        return 'ALFRED';
    }
}

const TEXT_MAP = {
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

/**
 * Main execution loop for the JS Sentinel.
 * @param {string} target - Path to scan
 */
async function runSentinel(target = '.') {
    const persona = await getActivePersona();
    const text = TEXT_MAP[persona] || TEXT_MAP.ALFRED;
    const isOdin = persona === 'ODIN';

    console.log(chalk.bold('━'.repeat(80)));
    console.log(chalk.bold(`  ${text.TITLE}`));
    console.log(chalk.cyan(`  ${text.SCAN_TARGET.padEnd(15)}: ${target}`));

    try {
        const { stdout } = await execa('npx', ['eslint', target, '--format', 'json'], { cwd: PROJECT_ROOT, reject: false });
        const results = JSON.parse(stdout);

        let totalViolations = 0;
        const violations = [];

        results.forEach(res => {
            res.messages.forEach(msg => {
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
                console.log(`  ${color(text.PREFIX)} ${chalk.bold(v.rule.padEnd(20))} ${chalk.dim(loc)} - ${v.message}`);
            });

            if (totalViolations > 15) {
                console.log(chalk.dim(`  ... + ${totalViolations - 15} more findings`));
            }
            process.exit(1);
        } else {
            console.log(chalk.green(`  STATUS         : ${text.PASS}`));
            process.exit(0);
        }

    } catch (err) {
        console.error(chalk.red(`  [SYSTEM FAILURE] ${err.message}`));
        process.exit(1);
    }
}

const target = process.argv[2] || '.';
runSentinel(target);
