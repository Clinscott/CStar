/**
 * [Ω] GUNGNIR BDD MASTER (Node.js Master)
 * Purpose: A lightweight, regex-driven Gherkin runner for the Corvus Star Framework.
 * Standard: Linscott Mandate (Language Mastery).
 */
export interface StepDefinition {
    pattern: RegExp;
    action: (...args: any[]) => Promise<void> | void;
}
export declare class BddMaster {
    private steps;
    defineStep(pattern: RegExp, action: (...args: any[]) => Promise<void> | void): void;
    runFeature(filePath: string): Promise<void>;
    private runScenario;
    private executeStep;
}
