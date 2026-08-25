export const ECONOMY_EFFECT_SURFACE_RETIRED_ERROR =
    'legacy_economy_effect_surface_retired_requires_operator_gate';

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

function retired(): never {
    throw new Error(ECONOMY_EFFECT_SURFACE_RETIRED_ERROR);
}

/** Retired before memory, console, KeepOS, or filesystem effects. */
export class ImperialLedger {
    public static async recordTransaction(_tx: Omit<Transaction, 'id' | 'timestamp'>): Promise<void> {
        void _tx;
        return retired();
    }

    public static async updatePantry(_item: SustenanceItem): Promise<void> {
        void _item;
        return retired();
    }

    public static getFamineClock(): never {
        return retired();
    }

    public static async syncGogWorkspace(_items: Array<{ type: 'TRANSACTION' | 'SCHEDULE'; data: unknown }>): Promise<void> {
        void _items;
        return retired();
    }
}
