import fs from 'node:fs/promises';
import path from 'node:path';
import { CompiledGraph } from './compiler.ts';
import { registry } from '../pathRegistry.ts';

export interface TechDebtBounty {
    file: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    justification: string;
    metrics: {
        gravity: number;
        logic: number;
        style: number;
        intel: number;
        stability: number;
        coupling: number;
        anomaly: number;
    };
    target_metric: string;
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
     * Evaluate the Matrix Graph for Toxic Sectors and Attribute Deficits
     * @param {CompiledGraph} graph - The master matrix graph
     */
    public async evaluate(graph: CompiledGraph): Promise<void> {
        const bounties: TechDebtBounty[] = [];

        for (const file of graph.files) {
            const m = file.matrix;
            const gravity = m.gravity;
            
            // 1. Critical Failures (The "Toxic Sector" Protocol)
            if (gravity > 100 && m.logic < 4.0) {
                bounties.push(this.createBounty(file.path, 'CRITICAL', 'LOGIC', m, 
                    `[ALFRED]: "Atomic Alert! High influence module with failing logic score. Immediate refactoring mandated."`));
                continue;
            }

            // 2. High Priority Deficits
            if (gravity > 50) {
                if (m.logic < 6.0) bounties.push(this.createBounty(file.path, 'HIGH', 'LOGIC', m, `Structural Warning: Maintainability outpaced by influence.`));
                if (m.style < 5.0) bounties.push(this.createBounty(file.path, 'HIGH', 'STYLE', m, `Aesthetic Dissonance: High-gravity module violates style standards.`));
                if (m.intel < 5.0) bounties.push(this.createBounty(file.path, 'HIGH', 'INTEL', m, `Cognitive Blindspot: High-gravity module lacks sufficient intent/documentation.`));
                if (m.stability < 0.4) bounties.push(this.createBounty(file.path, 'HIGH', 'STABILITY', m, `Instability Detected: Module complexity threatens system equilibrium.`));
                if (m.coupling > 0.8) bounties.push(this.createBounty(file.path, 'HIGH', 'COUPLING', m, `Extreme Coupling: Module is inextricably tangled with too many dependencies.`));
            }

            // 3. Medium Priority Improvements
            if (m.logic < 7.0) bounties.push(this.createBounty(file.path, 'MEDIUM', 'LOGIC', m, `Logic refinement suggested for sectoral optimization.`));
            if (m.style < 7.0) bounties.push(this.createBounty(file.path, 'MEDIUM', 'STYLE', m, `Style normalization recommended.`));
            if (m.intel < 7.0) bounties.push(this.createBounty(file.path, 'MEDIUM', 'INTEL', m, `Intelligence gap identified in sector lore.`));
            if (m.anomaly > 0.5) bounties.push(this.createBounty(file.path, 'MEDIUM', 'ANOMALY', m, `System Drift: Sector shows signs of architectural divergence.`));
        }

        // Sort by Priority and Gravity
        const priorityMap = { 'CRITICAL': 3, 'HIGH': 2, 'MEDIUM': 1 };
        bounties.sort((a, b) => {
            if (priorityMap[a.priority] !== priorityMap[b.priority]) {
                return priorityMap[b.priority] - priorityMap[a.priority];
            }
            return b.metrics.gravity - a.metrics.gravity;
        });

        // Limit to top 50 targets to avoid bloat
        await this.updateLedger(bounties.slice(0, 50));
    }

    private createBounty(file: string, priority: TechDebtBounty['priority'], target: string, m: any, justification: string): TechDebtBounty {
        return {
            file,
            priority,
            target_metric: target,
            justification,
            metrics: {
                gravity: m.gravity,
                logic: m.logic,
                style: m.style,
                intel: m.intel,
                stability: m.stability,
                coupling: m.coupling,
                anomaly: m.anomaly
            }
        };
    }

    private async updateLedger(bounties: TechDebtBounty[]): Promise<void> {
        const ledger: TechDebtLedger = {
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
            
            process.stderr.write(`
[ALFRED]: "Warden active. ${bounties.length} Toxic Sectors identified and logged to ledger."
`);
        } catch (error: any) {
            console.warn(`[WARNING] Warden failed to update ledger: ${error.message}`);
        }
    }
}

