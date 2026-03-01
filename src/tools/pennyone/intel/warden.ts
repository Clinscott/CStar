import fs from 'node:fs/promises';
import path from 'node:path';
import { CompiledGraph } from './compiler.js';
import { registry } from '../pathRegistry.js';

export interface TechDebtBounty {
    file: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    justification: string;
    metrics: {
        gravity: number;
        logic: number;
    };
}

export interface TechDebtLedger {
    timestamp: string;
    top_targets: TechDebtBounty[];
}

/**
 * PennyOne Warden (Phase 4)
 * Purpose: Close the loop by identifying "Toxic Sectors" and generating automated refactoring bounties.
 * Mandate: Active Threat Assessment
 */
export class Warden {
    private ledgerPath: string;

    constructor(customLedgerPath?: string) {
        this.ledgerPath = customLedgerPath || path.join(registry.getRoot(), '.agent', 'tech_debt_ledger.json');
    }

    /**
     * Evaluate the Matrix Graph for Toxic Sectors
     * @param {CompiledGraph} graph - The master matrix graph
     */
    public async evaluate(graph: CompiledGraph): Promise<void> {
        const toxicSectors: TechDebtBounty[] = [];

        for (const file of graph.files) {
            const gravity = file.matrix.gravity;
            const logic = file.matrix.logic;

            // Definition of a Toxic Sector: High Gravity, Low Logic
            if (gravity > 100 && logic < 4.0) {
                toxicSectors.push({
                    file: file.path,
                    priority: 'CRITICAL',
                    justification: `[ALFRED]: "Atomic Alert! High influence module with failing logic score. Gravity: ${gravity}, Logic: ${logic.toFixed(2)}. Immediate refactoring mandated."`,
                    metrics: { gravity, logic }
                });
            } else if (gravity > 50 && logic < 6.0) {
                toxicSectors.push({
                    file: file.path,
                    priority: 'HIGH',
                    justification: `[ALFRED]: "Structural Warning. Module influence outpaces its maintainability. Gravity: ${gravity}, Logic: ${logic.toFixed(2)}."`,
                    metrics: { gravity, logic }
                });
            }
        }

        if (toxicSectors.length > 0) {
            await this.updateLedger(toxicSectors);
        }
    }

    private async updateLedger(bounties: TechDebtBounty[]): Promise<void> {
        let ledger: TechDebtLedger = {
            timestamp: new Date().toISOString(),
            top_targets: []
        };

        try {
            const dir = path.dirname(this.ledgerPath);
            await fs.mkdir(dir, { recursive: true });

            // In Phase 4, we overwrite the targets with the freshest scan data
            // but keep the ledger format consistent.
            ledger.top_targets = bounties;

            await fs.writeFile(this.ledgerPath, JSON.stringify(ledger, null, 2), 'utf-8');
            
            process.stdout.write(`
[ALFRED]: "Warden active. ${bounties.length} Toxic Sectors identified and logged to ledger."
`);
        } catch (error: any) {
            console.warn(`[WARNING] Warden failed to update ledger: ${error.message}`);
        }
    }
}
