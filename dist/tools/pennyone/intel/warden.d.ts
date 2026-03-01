import { CompiledGraph } from './compiler.js';
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
export declare class Warden {
    private ledgerPath;
    constructor(customLedgerPath?: string);
    /**
     * Evaluate the Matrix Graph for Toxic Sectors
     * @param {CompiledGraph} graph - The master matrix graph
     */
    evaluate(graph: CompiledGraph): Promise<void>;
    private updateLedger;
}
