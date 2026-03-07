import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { SynapticNexus } from './nexus.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const KEEPOS_ROOT = path.resolve(PROJECT_ROOT, '../KeepOS');

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
export class ImperialLedger {
    private static transactions: Transaction[] = [];
    private static pantry: SustenanceItem[] = [];

    /**
     * [🔱] Record Tribute.
     * Logs a financial flow into the ledger.
     */
    public static async recordTransaction(tx: Omit<Transaction, 'id' | 'timestamp'>): Promise<void> {
        const fullTx: Transaction = {
            ...tx,
            id: `TX-${Date.now()}`,
            timestamp: Date.now()
        };
        this.transactions.push(fullTx);
        
        const color = tx.category === 'GROWTH' ? chalk.green : (tx.category === 'ESSENTIAL' ? chalk.yellow : chalk.magenta);
        console.error(color(`  ◈ [LEDGER]: Recorded ${tx.category} flow: ${tx.amount} Gold - ${tx.description}`));
        
        SynapticNexus.recordIntent(`Financial flow recorded in the Imperial Ledger: ${tx.description}`);
        await this.syncToKeep();
    }

    /**
     * [🔱] Update Sustenance.
     * Adjusts the pantry levels of the Keep.
     */
    public static async updatePantry(item: SustenanceItem): Promise<void> {
        const existing = this.pantry.find(i => i.name === item.name);
        if (existing) {
            existing.quantity += item.quantity;
        } else {
            this.pantry.push(item);
        }
        
        console.error(chalk.cyan(`  ◈ [PANTRY]: Updated sustenance: ${item.name} (${item.quantity} ${item.unit})`));
        SynapticNexus.recordIntent(`Sustenance levels adjusted: ${item.name}`);
        await this.syncToKeep();
    }

    /**
     * [🔱] The Famine Clock.
     * Predicts days of remaining sustenance based on burn rate.
     */
    public static getFamineClock(): number {
        // Mock logic: assuming 10 units per day burn
        const totalUnits = this.pantry.reduce((sum, item) => sum + item.quantity, 0);
        return Math.round(totalUnits / 10);
    }

    /**
     * [🔱] Bridge the Workspace.
     * Integrates data from the Google Workspace organ into the Ledger.
     */
    public static async syncGogWorkspace(items: Array<{ type: 'TRANSACTION' | 'SCHEDULE', data: any }>): Promise<void> {
        console.error(chalk.magenta(`  ▷ [WORKSPACE SYNC]: Processing ${items.length} synaptic updates...`));
        
        for (const item of items) {
            if (item.type === 'TRANSACTION') {
                await this.recordTransaction(item.data);
            }
            // Future: Handle Schedule synchronization for Chronos
        }
        
        await this.syncToKeep();
    }

    private static async syncToKeep(): Promise<void> {
        const data = {
            transactions: this.transactions,
            pantry: this.pantry,
            famineClock: this.getFamineClock(),
            lastSync: Date.now()
        };
        
        const targetPath = path.join(KEEPOS_ROOT, 'data/economy.json');
        try {
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (e) {
            console.error(chalk.red(`  [!] Economy Sync Failed: ${e}`));
        }
    }
}
