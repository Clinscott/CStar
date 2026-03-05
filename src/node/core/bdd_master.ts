import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

/**
 * [Ω] GUNGNIR BDD MASTER (Node.js Master)
 * Purpose: A lightweight, regex-driven Gherkin runner for the Corvus Star Framework.
 * Standard: Linscott Mandate (Language Mastery).
 */

export interface StepDefinition {
    pattern: RegExp;
    action: (...args: any[]) => Promise<void> | void;
}

export class BddMaster {
    private steps: StepDefinition[] = [];

    defineStep(pattern: RegExp, action: (...args: any[]) => Promise<void> | void) {
        this.steps.push({ pattern, action });
    }

    async runFeature(filePath: string) {
        console.log(chalk.cyan(`\n ◤ EXECUTING FEATURE: ${path.basename(filePath)} ◢ `));
        const content = fs.readFileSync(filePath, 'utf-8');
        const scenarios = content.split(/Scenario:/);
        
        // Skip the first part (Feature description)
        for (let i = 1; i < scenarios.length; i++) {
            await this.runScenario(scenarios[i]);
        }
    }

    private async runScenario(scenarioContent: string) {
        const lines = scenarioContent.split('\n');
        const title = lines[0].trim();
        console.log(chalk.yellow(`\n  ◈ SCENARIO: ${title}`));

        for (let j = 1; j < lines.length; j++) {
            const line = lines[j].trim();
            if (!line || line.startsWith('#')) continue;

            // Strip Given/When/Then/And prefix
            const stepText = line.replace(/^(Given|When|Then|And)\s+/, '');
            if (stepText === line) continue; // Not a step

            await this.executeStep(stepText);
        }
    }

    private async executeStep(stepText: string) {
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
