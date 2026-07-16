import type { CompiledGraph } from '../types.js';

const RETIRED_NODE_WARDEN =
    'legacy_node_pennyone_warden_retired_use_cstar_warden';

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

/** @deprecated The Node PennyOne Warden bypassed the typed kernel Warden. */
export class Warden {
    constructor(_customLedgerPath?: string) {}

    public async evaluate(_graph: CompiledGraph): Promise<never> {
        throw new Error(RETIRED_NODE_WARDEN);
    }

    public async evaluateProjection(
        _targetRepo?: string,
        _scanId?: string,
    ): Promise<never> {
        throw new Error(RETIRED_NODE_WARDEN);
    }
}
