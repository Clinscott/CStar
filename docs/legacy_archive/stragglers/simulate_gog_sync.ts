import { ImperialLedger } from './src/node/core/economy.ts';
import { SynapticNexus } from './src/node/core/nexus.ts';

async function simulateGogSync() {
    console.log("### 🔱 THE IMPERIAL WORKSPACE SYNC\n");
    
    SynapticNexus.pulse();

    // Simulating findings from the gog gmail search
    const syncItems: any[] = [
        {
            type: 'TRANSACTION',
            data: {
                amount: 85.50,
                category: 'ESSENTIAL',
                description: 'Rogers Communication Bill (Synced from Gmail)'
            }
        },
        {
            type: 'TRANSACTION',
            data: {
                amount: 210.00,
                category: 'ESSENTIAL',
                description: 'Regus Virtual Office Invoice (Synced from Gmail)'
            }
        }
    ];

    await ImperialLedger.syncGogWorkspace(syncItems);

    SynapticNexus.materializeDominion();
}

simulateGogSync().catch(console.error);
