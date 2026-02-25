import { CognitiveRouter } from '../src/node/core/CognitiveRouter.js';
import { CorvusProcess } from '../src/node/core/CorvusProcess.js';
import { EventManager } from '../src/node/core/EventManager.js';

/**
 * [VERIFICATION] CogRouter Tiered Logic Test
 */
async function verifyRouter() {
    console.log('🧪 Starting CognitiveRouter Verification...');

    const router = CognitiveRouter.getInstance();
    const corvus = new CorvusProcess();
    const eventManager = EventManager.getInstance();

    // Mock Payload 1: Edge (Ollama)
    const edgePayload = {
        system_meta: { app_id: 'test_app', requires_core: false },
        intent_raw: 'What is the status of the dishwasher?',
        intent_normalized: 'dishwasher_status',
        target_workflow: 'query',
        extracted_entities: {}
    };

    // Mock Payload 2: Core (Corvus)
    const corePayload = {
        system_meta: { app_id: 'test_app', requires_core: true },
        intent_raw: 'Execute complex multi-agent simulation.',
        intent_normalized: 'complex_sim',
        target_workflow: 'simulation',
        extracted_entities: {}
    };

    console.log('\n1. Testing Tier 1: Edge (Ollama)...');
    try {
        await router.routeIntent(edgePayload, corvus);
        console.log('✅ Edge routing initiated. (Check console for Ollama attempt)');
    } catch (err) {
        console.log('❌ Edge routing failed:', err);
    }

    console.log('\n2. Testing Tier 2: Core (Corvus)...');
    try {
        // We expect this to fail with "Daemon offline" since we haven't booted 'corvus'
        await router.routeIntent(corePayload, corvus);
    } catch (err: any) {
        if (err.message.includes('Daemon offline')) {
            console.log('✅ Core escalation correctly blocked by offline daemon.');
        } else {
            console.log('❌ Unexpected core escalation failure:', err);
        }
    }

    console.log('\n🧪 Verification Script Complete.');
}

verifyRouter().catch(console.error);
