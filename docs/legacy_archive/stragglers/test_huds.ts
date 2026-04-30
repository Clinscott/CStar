import { HUD } from './src/node/core/hud.ts';

async function testHuds() {
    console.log("### 🔱 SOVEREIGN HUD SUITE TEST\n");

    // 1. Standard HUD Box (Markdown Table)
    console.log("--- TEST: STANDARD HUD BOX ---");
    process.stdout.write(HUD.boxTop('TEST BOX TITLE'));
    process.stdout.write(HUD.boxRow('STATUS', 'ACTIVE'));
    process.stdout.write(HUD.boxRow('  ▷ NESTED', 'VALUE'));
    process.stdout.write(HUD.boxSeparator());
    process.stdout.write(HUD.boxNote('This is a test note for the standard HUD.'));
    process.stdout.write(HUD.boxBottom());

    console.log("\n--- TEST: TRACE HUD ---");
    // 2. Trace HUD
    console.log(HUD.traceHUD({
        intent: 'Verify HUD stability',
        well: 'src/node/core/hud.ts',
        wisdom: 'The interface is the mind.',
        verdict: 'Ω STABLE',
        confidence: 0.99
    }));

    console.log("\n--- TEST: PROGRESS BAR & SPINNER ---");
    // 3. Progress Bar
    console.log(`Progress: [${HUD.progressBar(0.7, 20)}]`);
    
    // 4. Spinner (Non-interactive in Gemini mode)
    await HUD.spinner('Processing neural stream');

    console.log("\n--- TEST: MASTER WRAP ---");
    // 5. Master Wrap
    const wrapped = await HUD.masterWrap("This is a test of the Master Sovereign Interface.\nAll content should be contained within the master structural table.\nTesting multi-line alignment.");
    console.log(wrapped);
}

testHuds().catch(console.error);
