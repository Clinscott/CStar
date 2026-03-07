import { ImperialLedger } from './src/node/core/economy.ts';
import { SynapticNexus } from './src/node/core/nexus.ts';

async function testLedger() {
    console.log("### 🔱 THE IMPERIAL LEDGER RITUAL\n");
    
    SynapticNexus.pulse();

    // 1. Record Gold flows
    await ImperialLedger.recordTransaction({
        amount: 500,
        category: 'GROWTH',
        description: 'Investment in Educational Runes'
    });

    await ImperialLedger.recordTransaction({
        amount: 150,
        category: 'ESSENTIAL',
        description: 'Tribute to the Power Utility'
    });

    // 2. Update Sustenance
    await ImperialLedger.updatePantry({
        name: 'Grains',
        quantity: 50,
        unit: 'Lbs'
    });

    await ImperialLedger.updatePantry({
        name: 'Mana Potions (Milk)',
        quantity: 4,
        unit: 'Gallons'
    });

    // 3. Check the Famine Clock
    const days = ImperialLedger.getFamineClock();
    console.log(`\n  ◈ [FAMINE CLOCK]: ${days} days of sustenance remain.`);

    SynapticNexus.materializeDominion();
}

testLedger().catch(console.error);
