import { CompiledGraph } from '../types.js';
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
export declare class Warden {
    private ledgerPath;
    constructor(customLedgerPath?: string);
    /**
     * Evaluate the Matrix Graph for Toxic Sectors and Attribute Deficits
     * @param {CompiledGraph} graph - The master matrix graph
     */
    evaluate(graph: CompiledGraph): Promise<void>;
    private createBounty;
    private updateLedger;
}
