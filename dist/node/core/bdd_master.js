import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
export class BddMaster {
    steps = [];
    defineStep(pattern, action) {
        this.steps.push({ pattern, action });
    }
    async runFeature(filePath) {
        console.log(chalk.cyan(`\n ◤ EXECUTING FEATURE: ${path.basename(filePath)} ◢ `));
        const content = fs.readFileSync(filePath, 'utf-8');
        const scenarios = content.split(/Scenario:/);
        // Skip the first part (Feature description)
        for (let i = 1; i < scenarios.length; i++) {
            await this.runScenario(scenarios[i]);
        }
    }
    async runScenario(scenarioContent) {
        const lines = scenarioContent.split('\n');
        const title = lines[0].trim();
        console.log(chalk.yellow(`\n  ◈ SCENARIO: ${title}`));
        for (let j = 1; j < lines.length; j++) {
            const line = lines[j].trim();
            if (!line || line.startsWith('#'))
                continue;
            // Strip Given/When/Then/And prefix
            const stepText = line.replace(/^(Given|When|Then|And)\s+/, '');
            if (stepText === line)
                continue; // Not a step
            await this.executeStep(stepText);
        }
    }
    async executeStep(stepText) {
        for (const def of this.steps) {
            const match = stepText.match(def.pattern);
            if (match) {
                const args = match.slice(1);
                console.log(chalk.dim(`    ✓ ${stepText}`));
                await def.action(...args);
                return;
            }
        }
        console.error(chalk.red(`    ✖ MISSING STEP: ${stepText}`));
        throw new Error(`Step not defined: ${stepText}`);
    }
}
