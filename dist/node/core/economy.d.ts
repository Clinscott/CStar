export interface Transaction {
    id: string;
    amount: number;
    category: 'ESSENTIAL' | 'GROWTH' | 'LEISURE' | 'TRIBUTE';
    description: string;
    timestamp: number;
}
export interface SustenanceItem {
    name: string;
    quantity: number;
    unit: string;
    expiry?: number;
}
/**
 * 🔱 The Imperial Ledger (v1.0)
 * Lore: "The Keep is strong when the pantry is full and the gold is secure."
 * Purpose: Manage the strategic resources of the Keep.
 */
export declare class ImperialLedger {
    private static transactions;
    private static pantry;
    /**
     * [🔱] Record Tribute.
     * Logs a financial flow into the ledger.
     */
    static recordTransaction(tx: Omit<Transaction, 'id' | 'timestamp'>): Promise<void>;
    /**
     * [🔱] Update Sustenance.
     * Adjusts the pantry levels of the Keep.
     */
    static updatePantry(item: SustenanceItem): Promise<void>;
    /**
     * [🔱] The Famine Clock.
     * Predicts days of remaining sustenance based on burn rate.
     */
    static getFamineClock(): number;
    /**
     * [🔱] Bridge the Workspace.
     * Integrates data from the Google Workspace organ into the Ledger.
     */
    static syncGogWorkspace(items: Array<{
        type: 'TRANSACTION' | 'SCHEDULE';
        data: any;
    }>): Promise<void>;
    private static syncToKeep;
}
